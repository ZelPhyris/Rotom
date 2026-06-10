import { Events } from 'discord.js';
import { config } from '../config.js';
import { extractStats, hasVision } from './visionExtract.js';
import {
  setPogoStats,
  getPogoStats,
  isClassementParticipant,
  classementParticipantIds,
  getState,
  setState,
} from '../db.js';

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

function formatStats({ pogo_level, pogo_xp, pogo_pokedex }) {
  const parts = [];
  if (pogo_level != null) parts.push(`⭐ Niveau **${pogo_level}**`);
  if (pogo_xp != null) parts.push(`✨ **${Number(pogo_xp).toLocaleString('fr-FR')}** XP`);
  if (pogo_pokedex != null) parts.push(`🔴 **${Number(pogo_pokedex).toLocaleString('fr-FR')}** capturés`);
  return parts.join(' · ');
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

  let level = null;
  let xp = null;
  let pokedex = null;
  for (const url of urls) {
    const s = await extractStats(url);
    level = level ?? s.level;
    xp = xp ?? s.xp;
    pokedex = pokedex ?? s.pokedex;
  }

  if (level == null && xp == null && pokedex == null) {
    await message
      .reply('Je n’ai rien réussi à lire sur cette capture 😕 Envoie l’écran de ton **profil** bien net (niveau, XP, Pokémon capturés).')
      .catch(() => {});
    return;
  }

  await setPogoStats(message.author.id, { level, xp, pokedex });
  const stored = await getPogoStats(message.author.id);
  await message
    .reply(`✅ Stats mises à jour !\n${formatStats(stored)}\n\nConsulte le classement avec \`/classement-pogo voir\`.`)
    .catch(() => {});
}

const REMINDER_TEXT = [
  '🏆 **Classement Pokémon GO — mise à jour mensuelle**',
  '',
  'Salut ! C’est le moment de rafraîchir tes stats pour le classement de la communauté de Pau.',
  '',
  '📸 **Réponds à ce message avec une capture de ton profil** (niveau, XP total, Pokémon capturés) et je m’occupe du reste.',
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

/**
 * @param {import('discord.js').Client} client
 */
export function registerClassement(client) {
  client.on(Events.MessageCreate, (message) => {
    onDirectMessage(message).catch((e) => console.error('[classement] DM handling failed:', e));
  });

  client.once(Events.ClientReady, (c) => {
    const tick = () => maybeRemind(c).catch((e) => console.error('[classement] Reminder tick failed:', e));
    tick(); // catch up if the bot was offline over the scheduled time
    setInterval(tick, 60 * 60 * 1000); // re-check hourly
  });
}
