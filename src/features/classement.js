import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, EmbedBuilder, Events } from 'discord.js';
import { config } from '../config.js';
import { JOIN_BUTTON_ID } from '../embeds/classement.js';
import { buildPogoStatsEmbed } from '../embeds/pogoStats.js';
import { exampleImageAttachment } from '../embeds/exampleImage.js';
import { applyTeamRole } from './teamRole.js';
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

const STAT_FIELDS = ['level', 'levelXp', 'levelXpMax', 'xp', 'pokedex', 'distance', 'pokestops', 'team'];
const fr = (n) => Number(n).toLocaleString('fr-FR');

// In Pokémon GO these counters only ever grow, so a value LOWER than the one we
// already stored signals a stale/doctored capture. Each metric has an absolute
// floor + a relative slack (% of the previous value) so that an identical or
// near-identical re-submission — where OCR may read one digit slightly off —
// is never flagged. Only a real drop beyond the noise counts.
//   [label, prevColumn, statField, absoluteTolerance, relativeTolerance]
const REGRESSION_CHECKS = [
  ['niveau', 'pogo_level', 'level', 0, 0],
  ['Total XP', 'pogo_xp', 'xp', 1000, 0.01],
  ['captures', 'pogo_pokedex', 'pokedex', 5, 0.01],
  ['distance', 'pogo_distance', 'distance', 1, 0.01],
  ['PokéStops', 'pogo_pokestops', 'pokestops', 5, 0.01],
];

function statRegressions(prev, stats) {
  if (!prev) return [];
  const reasons = [];
  for (const [label, prevKey, statKey, absTol, relTol] of REGRESSION_CHECKS) {
    const before = prev[prevKey];
    const after = stats[statKey];
    if (before == null || after == null) continue;
    const b = Number(before);
    const a = Number(after);
    const tol = Math.max(absTol, b * relTol);
    if (a < b - tol) reasons.push(`${label} en baisse (${fr(b)} → ${fr(a)})`);
  }
  return reasons;
}

// Alert the staff about a suspicious screenshot (with the image + reasons).
// `refused: true` → the submission was rejected; false → kept but to double-check.
async function notifyStaff(message, reasons, urls, { refused = true } = {}) {
  const channelId = config.classementAdminChannelId;
  if (!channelId) {
    console.warn(`[classement] Suspicious submission (${reasons.join('; ')}) but no CLASSEMENT_ADMIN_CHANNEL_ID configured.`);
    return;
  }
  const channel = await message.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor(refused ? 0xff4554 : 0xffcc1f)
    .setTitle(refused ? '🚨 Capture classement refusée' : '⚠️ Capture classement à vérifier')
    .setDescription(
      refused
        ? `<@${message.author.id}> (\`${message.author.tag}\`) — capture **refusée** (stats non enregistrées).`
        : `<@${message.author.id}> (\`${message.author.tag}\`) — stats **enregistrées**, mais à contrôler.`,
    )
    .addFields({ name: 'Raisons', value: reasons.map((r) => `• ${r}`).join('\n').slice(0, 1024) })
    .setTimestamp();
  if (urls[0]) embed.setImage(urls[0]);
  await channel.send({ embeds: [embed] }).catch((e) => console.error('[classement] Staff alert failed:', e?.message ?? e));
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

  const stats = Object.fromEntries(STAT_FIELDS.map((k) => [k, null]));
  let tamperReason = null; // first edit signal (AI guess) across the images
  let certainReason = null; // first PROVEN fake (impossible value) across the images
  let isPogo = false; // at least one image recognised as the PoGo app
  for (const url of urls) {
    const s = await extractStats(url);
    for (const k of STAT_FIELDS) stats[k] = stats[k] ?? s[k];
    if (s.authenticity?.isPogo) isPogo = true;
    if (s.authenticity?.suspected && !tamperReason) {
      tamperReason = s.authenticity.reason || 'signes de retouche détectés';
    }
    if (s.authenticity?.certain && !certainReason) {
      certainReason = s.authenticity.reason || 'valeur impossible détectée';
    }
  }

  if (STAT_FIELDS.every((k) => stats[k] == null)) {
    await message
      .reply('Je n’ai rien réussi à lire sur cette capture 😕 Envoie l’écran de ton **profil** ou de tes **statistiques** bien net (niveau, Total XP, Pokémon capturés, distance, PokéStops).')
      .catch(() => {});
    return;
  }

  // Anti-triche, deux niveaux :
  //  1) Fraude PROUVÉE (valeur physiquement impossible) ou RÉGRESSION de stats →
  //     signaux fiables/déterministes → on refuse fermement, rien n'est enregistré.
  //  2) Retouche seulement « suspectée » par l'IA (faux positifs possibles : flou,
  //     compression…) → on n'bloque PAS, on enregistre et on alerte juste le staff.
  const prev = await getPogoStats(message.author.id);
  const regressions = statRegressions(prev, stats);
  const hardReasons = [...(certainReason ? [certainReason] : []), ...regressions];
  if (hardReasons.length) {
    await notifyStaff(message, hardReasons, urls, { refused: true });
    const detail = certainReason
      ? 'cette capture semble **modifiée** (valeur impossible).'
      : 'certaines stats sont **inférieures** à tes valeurs déjà enregistrées.';
    await message
      .reply(
        `⛔ Je n’ai pas pu valider cette capture : ${detail}\n` +
          'Envoie une capture **récente et non modifiée** de ton profil. En cas d’erreur, un membre de l’équipe peut vérifier.',
      )
      .catch(() => {});
    return;
  }

  await setPogoStats(message.author.id, stats);

  // Sync the team role from the detected colour (exclusive).
  if (stats.team) {
    const guild = message.client.guilds.cache.get(config.guildId);
    const member = guild ? await guild.members.fetch(message.author.id).catch(() => null) : null;
    if (member) await applyTeamRole(member, stats.team);
  }

  const stored = await getPogoStats(message.author.id);
  const profile = await getPogoProfile(message.author.id);
  await message
    .reply({ content: '✅ Stats mises à jour !', embeds: [buildPogoStatsEmbed(message.author, profile?.ign ?? null, stored)] })
    .catch(() => {});

  // Soft anti-cheat: stats are kept, but flag a suspicious image for staff review.
  const flags = [];
  if (tamperReason) flags.push(`retouche possible : ${tamperReason}`);
  if (!isPogo) flags.push('ne ressemble pas à une capture Pokémon GO');
  if (flags.length) await notifyStaff(message, flags, urls, { refused: false });
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
  '📸 **Où trouver l’écran ?** Dans le jeu, touche ton **avatar en bas à gauche**, puis l’onglet où s’affichent tes statistiques (distance, captures, PokéStops, Total XP). Une capture nette suffit — **exemple ci-dessous** 👇',
  '',
  'Tu peux m’envoyer une nouvelle capture quand tu veux pour te mettre à jour. Pour quitter le classement : `/classement-pogo quitter`.',
].join('\n');

// Example screenshots attached to the onboarding DM: the shared profile example
// (assets/profil-exemple.png) plus any extra files named "classement-exemple*".
function exampleAttachments() {
  const extra = [
    'classement-exemple.png',
    'classement-exemple-1.png',
    'classement-exemple-2.png',
    'classement-exemple.jpg',
    'classement-exemple-1.jpg',
    'classement-exemple-2.jpg',
  ]
    .map((name) => join(ASSETS_DIR, name))
    .filter((p) => existsSync(p))
    .map((p) => new AttachmentBuilder(p));

  const shared = exampleImageAttachment();
  return shared ? [shared, ...extra] : extra;
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
