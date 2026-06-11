import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, Events } from 'discord.js';
import { config } from '../config.js';
import { JOIN_BUTTON_ID } from '../embeds/classement.js';
import { buildPogoStatsEmbed } from '../embeds/pogoStats.js';
import { extractStats, hasVision } from './visionExtract.js';
import {
  setClassementOptIn,
  setPogoStats,
  getPogoStats,
  getPogoProfile,
  isClassementParticipant,
  classementParticipantIds,
  getState,
  setState,
} from '../db.js';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

/**
 * Monthly Pokémon GO classement.
 *  - Participants opt in via /classement-pogo rejoindre.
 *  - They update their stats by DMing the bot a profile screenshot: the bot
 *    reads the level / total XP / caught count (Gemini) and stores them.
 *  - Once a month the bot DMs every participant to invite an update.
 *
 * Needs the DirectMessages intent + Channel/Message partials, and (for reading
 * DM screenshots) the MessageContent intent — enabled when vision is configured.
 */
const REMINDER_KEY = 'classement_reminder'; // stores the last "YYYY-M" sent

function imageUrls(message) {
  return [...(message.attachments?.values() ?? [])]
    .filter((a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(a.name ?? ''))
    .map((a) => a.url);
}

// A participant DMs a profile screenshot → read & store whatever stats are found.
async function onDirectMessage(message) {
  if (message.inGuild() || message.author.bot) return;
  if (!hasVision()) return;

  const urls = imageUrls(message);
  if (!urls.length) return;

  if (!(await isClassementParticipant(message.author.id))) {
    await message.reply(
      'Tu n’es pas encore inscrit au classement. Fais `/classement-pogo rejoindre` sur le serveur, puis renvoie ta capture ! 🏆',
    ).catch(() => {});
    return;
  }

  await message.channel.sendTyping().catch(() => {});

  const stats = { level: null, levelXp: null, levelXpMax: null, xp: null, pokedex: null, distance: null, pokestops: null };
  for (const url of urls) {
    const s = await extractStats(url);
    for (const k of Object.keys(stats)) stats[k] = stats[k] ?? s[k];
  }

  if (Object.values(stats).every((v) => v == null)) {
    await message
      .reply('Je n’ai rien réussi à lire sur cette capture 😕 Envoie l’écran de ton **profil** ou de tes **statistiques** bien net (niveau, Total XP, Pokémon capturés, distance, PokéStops).')
      .catch(() => {});
    return;
  }

  await setPogoStats(message.author.id, stats);
  const stored = await getPogoStats(message.author.id);
  const profile = await getPogoProfile(message.author.id);
  await message
    .reply({ content: '✅ Stats mises à jour !', embeds: [buildPogoStatsEmbed(message.author, profile?.ign ?? null, stored)] })
    .catch(() => {});
}

const REMINDER_TEXT = [
  '🏆 **Classement Pokémon GO — mise à jour mensuelle**',
  '',
  'Salut ! C’est le moment de rafraîchir tes stats pour le classement de la communauté de Pau.',
  '',
  '📸 **Réponds à ce message avec une capture de ton profil** (niveau, Total XP, Pokémon capturés, distance, PokéStops) et je m’occupe du reste.',
  '',
  'Pas envie ce mois-ci ? Ignore simplement ce message. Pour quitter le classement : `/classement-pogo quitter`.',
].join('\n');

async function sendMonthlyReminder(client) {
  const ids = await classementParticipantIds();
  let sent = 0;
  for (const id of ids) {
    try {
      const user = await client.users.fetch(id);
      await user.send(REMINDER_TEXT);
      sent++;
    } catch (error) {
      // User may have DMs closed or have left — skip silently.
    }
    await new Promise((r) => setTimeout(r, 1500)); // gentle pacing vs rate limits
  }
  console.log(`[classement] Monthly reminder sent to ${sent}/${ids.length} participant(s).`);
}

// Hourly tick: on the configured day & hour, send the reminder once per month.
async function maybeRemind(client) {
  const now = new Date();
  if (now.getDate() !== config.classementReminderDay) return;
  if (now.getHours() < config.classementReminderHour) return;

  const stamp = `${now.getFullYear()}-${now.getMonth() + 1}`;
  if ((await getState(REMINDER_KEY)) === stamp) return; // already done this month

  await setState(REMINDER_KEY, stamp); // mark first to avoid double-sends
  await sendMonthlyReminder(client);
}

// First DM sent when a member joins the classement (via the embed button).
const ONBOARDING_TEXT = [
  '🏆 **Bienvenue dans le classement Pokémon GO de Pau !**',
  '',
  'Pour enregistrer tes stats, **réponds à ce message avec une capture de ton profil** Pokémon GO. J’y lis automatiquement :',
  '• ⭐ ton **niveau**',
  '• ✨ ton **Total XP**',
  '• 🔴 tes **Pokémon capturés**',
  '• 👟 ta **distance parcourue**',
  '• 🛑 tes **PokéStops visités**',
  '',
  '📸 **Où trouver l’écran ?** Dans le jeu, touche ton **avatar en bas à gauche**, puis l’onglet où s’affichent tes statistiques (distance, captures, PokéStops, Total XP). Une capture nette suffit.',
  '',
  'Tu peux m’envoyer une nouvelle capture quand tu veux pour te mettre à jour. Pour quitter le classement : `/classement-pogo quitter`.',
].join('\n');

// Optional example screenshots: drop files named "classement-exemple*.png|jpg"
// in /assets and they're attached to the onboarding DM automatically.
function exampleAttachments() {
  const candidates = [
    'classement-exemple.png',
    'classement-exemple-1.png',
    'classement-exemple-2.png',
    'classement-exemple.jpg',
    'classement-exemple-1.jpg',
    'classement-exemple-2.jpg',
  ];
  return candidates
    .map((name) => join(ASSETS_DIR, name))
    .filter((p) => existsSync(p))
    .map((p) => new AttachmentBuilder(p));
}

async function sendOnboardingDM(user) {
  await user.send({ content: ONBOARDING_TEXT, files: exampleAttachments() });
}

// The "Participer" button on the participation embed: grant the role, opt in,
// and DM the member the first instructions.
async function onJoinButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== JOIN_BUTTON_ID) return;

  await setClassementOptIn(interaction.user.id, true).catch((e) =>
    console.error('[classement] opt-in failed:', e?.message ?? e),
  );

  if (config.classementRoleId && interaction.member?.roles?.add) {
    await interaction.member.roles
      .add(config.classementRoleId, 'Participe au classement PoGo')
      .catch((e) => console.error('[classement] Failed to add the participation role:', e?.message ?? e));
  }

  let dmOk = true;
  try {
    await sendOnboardingDM(interaction.user);
  } catch {
    dmOk = false; // DMs closed
  }

  const content = dmOk
    ? '🏆 Tu participes maintenant au **classement Pokémon GO** ! Je t’ai envoyé un **MP** pour enregistrer tes stats. 📨'
    : '🏆 Tu participes maintenant au **classement Pokémon GO** ! Mais je n’ai pas pu t’écrire en privé : **ouvre tes MP** (Paramètres de confidentialité du serveur), puis envoie-moi directement une capture de ton profil. 📸';

  await interaction.reply({ content, ephemeral: true }).catch(() => {});
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerClassement(client) {
  client.on(Events.MessageCreate, (message) => {
    onDirectMessage(message).catch((e) => console.error('[classement] DM handling failed:', e));
  });

  client.on(Events.InteractionCreate, (interaction) => {
    onJoinButton(interaction).catch((e) => console.error('[classement] Join button failed:', e));
  });

  client.once(Events.ClientReady, (c) => {
    const tick = () => maybeRemind(c).catch((e) => console.error('[classement] Reminder tick failed:', e));
    tick(); // catch up if the bot was offline over the scheduled time
    setInterval(tick, 60 * 60 * 1000); // re-check hourly
  });
}
