import { Events } from 'discord.js';
import { config } from '../config.js';
import { addXp } from '../db.js';

/**
 * Message-based XP / leveling (MEE6-style curve).
 *  - 15–25 XP per message, at most once per COOLDOWN_MS per member.
 *  - Announces level-ups (in LEVELUP_CHANNEL_ID if set, else the same channel).
 * Requires the GuildMessages intent and the database.
 */
const COOLDOWN_MS = 60_000;
const MIN_XP = 15;
const MAX_XP = 25;

const lastAward = new Map();

/**
 * XP needed to go from `level` to `level + 1`. Steeper than the classic MEE6
 * curve so progression stays long and meaningful (≈2.5× more messages/level).
 */
export function xpForLevel(level) {
  return 15 * level * level + 100 * level + 250;
}

/** Total XP accumulated to reach the start of `level`. */
export function totalXpForLevel(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpForLevel(l);
  return total;
}

/** Level reached with a given total XP. */
export function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return level;
}

/**
 * Give the member the reward role for their current tier and remove lower ones,
 * so they always wear a single "current rank". No-op without configured roles.
 */
async function applyLevelRoles(member, level) {
  if (!member || !config.levelRoles.length) return;
  const earned = config.levelRoles.filter((r) => level >= r.level);
  const current = earned.length ? earned[earned.length - 1].roleId : null;

  for (const { roleId } of config.levelRoles) {
    const has = member.roles.cache.has(roleId);
    if (roleId === current && !has) {
      await member.roles.add(roleId, `Niveau ${level}`).catch(() => {});
    } else if (roleId !== current && has) {
      await member.roles.remove(roleId, `Niveau ${level}`).catch(() => {});
    }
  }
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;

  const now = Date.now();
  if (now - (lastAward.get(message.author.id) ?? 0) < COOLDOWN_MS) return;
  lastAward.set(message.author.id, now);

  const gain = MIN_XP + Math.floor(Math.random() * (MAX_XP - MIN_XP + 1));
  const total = await addXp(message.author.id, gain);
  if (total === null) return; // no database

  const newLevel = levelFromXp(total);
  if (newLevel > levelFromXp(total - gain)) {
    await applyLevelRoles(message.member, newLevel);

    const channel = config.levelupChannelId
      ? message.guild.channels.cache.get(config.levelupChannelId)
      : message.channel;
    await channel
      ?.send?.({
        content: `🎉 Bravo ${message.author}, tu passes **niveau ${newLevel}** !`,
        allowedMentions: { users: [message.author.id] },
      })
      .catch(() => {});
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerLeveling(client) {
  client.on(Events.MessageCreate, onMessage);
}
