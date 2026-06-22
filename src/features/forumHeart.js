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
const FORUM_ID = config.forumHeartChannelId;
const HEART = '❤️';

function hasImage(message) {
  return Boolean(
    message?.attachments?.some(
      (a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name ?? ''),
    ),
  );
}

// Match when the message is IN the target (a specific channel/post) OR in a
// post whose parent is the target (a whole forum).
function isTarget(channel) {
  return channel?.id === FORUM_ID || channel?.parentId === FORUM_ID;
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  if (!isTarget(message.channel)) return;
  if (hasImage(message)) {
    await message.react(HEART).catch((e) => console.error('[forum] react failed:', e?.message));
  }
}

async function onThreadCreate(thread) {
  // The target forum got a new post, or the target post itself was just created.
  if (thread.id !== FORUM_ID && thread.parentId !== FORUM_ID) return;
  const starter = await thread.fetchStarterMessage().catch(() => null);
  if (starter && hasImage(starter)) {
    await starter.react(HEART).catch((e) => console.error('[forum] react failed:', e?.message));
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerForumHeart(client) {
  if (!FORUM_ID) return;
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.ThreadCreate, onThreadCreate);
}
