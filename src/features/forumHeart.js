import { Events } from 'discord.js';
import { config } from '../config.js';

/**
 * Reacts with ❤️ to any image posted in a given forum channel — both the
 * starter message of a new post (ThreadCreate) and later messages in its
 * threads (MessageCreate).
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

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  if (message.channel?.parentId !== FORUM_ID) return;
  if (hasImage(message)) {
    await message.react(HEART).catch((e) => console.error('[forum] react failed:', e?.message));
  }
}

async function onThreadCreate(thread) {
  if (thread.parentId !== FORUM_ID) return;
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
