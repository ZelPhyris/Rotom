import { Events } from 'discord.js';
import { config } from '../config.js';

/**
 * Reacts with ❤️ to any image posted in a configured target. The target
 * (FORUM_HEART_CHANNEL_ID) can be EITHER:
 *  - a whole forum channel → reacts in every post of that forum, or
 *  - a single channel / forum post (thread) → reacts only inside it.
 * Covers both the starter message of a new post (ThreadCreate) and later
 * messages (MessageCreate).
 *
 * Needs the GuildMessages intent (for replies) and "Add Reactions" permission.
 * Reading attachments requires the MessageContent intent (already enabled when
 * vision is configured).
 */
// Read at call time (not at module load) so dashboard edits hydrated into
// `config` take effect without a restart. Off when disabled or no rule set.
function isActive() {
  return config.forumHeartEnabled && Array.isArray(config.autoReactions) && config.autoReactions.length > 0;
}

function hasImage(message) {
  return Boolean(
    message?.attachments?.some(
      (a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name ?? ''),
    ),
  );
}

// Emojis to add for a channel: any rule whose target is the channel itself OR
// its parent forum contributes its emojis (deduplicated).
function emojisFor(channel) {
  if (!channel) return [];
  const out = [];
  for (const rule of config.autoReactions) {
    if (channel.id === rule.channelId || channel.parentId === rule.channelId) {
      out.push(...rule.emojis);
    }
  }
  return [...new Set(out)];
}

// React sequentially to respect Discord's per-message reaction rate limit.
async function reactAll(message, emojis) {
  for (const emoji of emojis) {
    await message.react(emoji).catch((e) => console.error('[reactions] react failed:', e?.message));
  }
}

async function onMessage(message) {
  if (!isActive()) return;
  if (!message.inGuild() || message.author.bot) return;
  if (!hasImage(message)) return;
  const emojis = emojisFor(message.channel);
  if (emojis.length) await reactAll(message, emojis);
}

async function onThreadCreate(thread) {
  if (!isActive()) return;
  // A configured forum got a new post (or the configured post itself appeared).
  const emojis = emojisFor(thread);
  if (!emojis.length) return;
  const starter = await thread.fetchStarterMessage().catch(() => null);
  if (starter && hasImage(starter)) await reactAll(starter, emojis);
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerForumHeart(client) {
  // Always register: the target/switch can come from the DB at runtime.
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.ThreadCreate, onThreadCreate);
}
