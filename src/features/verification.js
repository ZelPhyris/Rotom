import { Events, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { sendWelcome } from './welcome.js';
import { extractTrainerName, hasVision } from './visionExtract.js';
import { setPogoIgn } from '../db.js';

/**
 * Newcomer verification flow (reaction-based):
 *  1. On join, the "pending" role is assigned (it should only grant access to
 *     the verification channel — configure that in the server settings).
 *  2. When a pending member posts in the verification channel, the bot adds
 *     ✅ / ❌ reactions on their message.
 *  3. A moderator (Manage Roles) clicking ✅ removes the pending role and the
 *     newcomer is welcomed; ❌ asks them to repost.
 *
 * Needs the GuildMessages + GuildMessageReactions intents and the Message /
 * Reaction / User partials (to handle reactions on uncached messages, e.g.
 * after a restart). Message content is NOT read.
 *
 * The bot's highest role must sit ABOVE the pending role to remove it.
 */
const PENDING_ROLE_ID = config.verificationRoleId;
const VERIF_CHANNEL_ID = config.verificationChannelId; // optional scope
const VALIDATE = '✅';
const REFUSE = '❌';

// Members whose message already carries the review reactions (avoid re-reacting).
const activeReviews = new Set();
// Trainer name detected from a member's screenshot, keyed by message id.
const detectedNames = new Map();
// Bot's "🔎 Pseudo détecté" message, keyed by the screenshot message id.
const detectionMessages = new Map();

/** First image attachment URL on a message, if any. */
function imageUrl(message) {
  const att = message.attachments?.find(
    (a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(a.name ?? ''),
  );
  return att?.url ?? null;
}

async function onMemberJoin(member) {
  if (member.guild.id !== config.guildId) return;
  try {
    await member.roles.add(PENDING_ROLE_ID, 'Newcomer — awaiting verification');
  } catch (error) {
    console.error('[verification] Failed to assign the pending role:', error);
  }
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  if (VERIF_CHANNEL_ID && message.channelId !== VERIF_CHANNEL_ID) return;

  const member = message.member;
  if (!member || !member.roles.cache.has(PENDING_ROLE_ID)) return;
  if (activeReviews.has(member.id)) return;

  activeReviews.add(member.id);
  try {
    await message.react(VALIDATE);
    await message.react(REFUSE);
  } catch (error) {
    activeReviews.delete(member.id);
    console.error('[verification] Failed to add review reactions:', error);
    return;
  }

  // Read the screenshot to pre-detect the trainer name (shown to moderators).
  const url = imageUrl(message);
  if (hasVision() && url) {
    const name = await extractTrainerName(url);
    if (name) {
      detectedNames.set(message.id, name);
      const sent = await message.channel
        .send(`🔎 Pseudo détecté : **${name}** — un modo valide avec ${VALIDATE}.`)
        .catch(() => null);
      if (sent) detectionMessages.set(message.id, sent);
    }
  }
}

async function onReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const emoji = reaction.emoji.name;
  if (emoji !== VALIDATE && emoji !== REFUSE) return;

  const message = reaction.message;
  if (message.partial) {
    try {
      await message.fetch();
    } catch {
      return;
    }
  }
  if (!message.guild) return;
  if (VERIF_CHANNEL_ID && message.channelId !== VERIF_CHANNEL_ID) return;

  // A member cannot validate their own submission.
  if (user.id === message.author.id) return;

  // The newcomer is the message author; must still be pending.
  const target = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!target || !target.roles.cache.has(PENDING_ROLE_ID)) return;

  // The reactor must be a moderator.
  const mod = await message.guild.members.fetch(user.id).catch(() => null);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageRoles)) return;

  if (emoji === VALIDATE) {
    try {
      await target.roles.remove(PENDING_ROLE_ID, `Validé par ${user.tag}`);
    } catch (error) {
      console.error('[verification] Failed to remove the pending role:', error);
      await message.channel
        .send(
          `Impossible de retirer le rôle de ${target} — vérifie que le rôle du bot est au-dessus du rôle en attente.`,
        )
        .catch(() => {});
      return;
    }
    activeReviews.delete(target.id);

    // Assign the detected trainer name: server nickname + stored profile.
    let name = detectedNames.get(message.id);
    if (!name && hasVision()) {
      const url = imageUrl(message);
      if (url) name = await extractTrainerName(url);
    }
    if (name) {
      const nick = name.slice(0, 32);
      await target.setNickname(nick, `Validé par ${user.tag}`).catch((e) =>
        console.error('[verification] Failed to set nickname:', e?.message ?? e),
      );
      await setPogoIgn(target.id, name).catch((e) =>
        console.error('[verification] Failed to store IGN:', e?.message ?? e),
      );
    }
    detectedNames.delete(message.id);

    // Clean up the verification channel: remove the screenshot and the bot's
    // detection message; post a short confirmation that self-deletes.
    const channel = message.channel;
    const detection = detectionMessages.get(message.id);
    detectionMessages.delete(message.id);
    await message.delete().catch(() => {});
    await detection?.delete().catch(() => {});

    const suffix = name ? ` Pseudo attribué : **${name}**.` : '';
    const confirm = await channel
      .send(`${VALIDATE} ${target} a été validé par ${user}.${suffix}`)
      .catch(() => null);
    if (confirm) setTimeout(() => confirm.delete().catch(() => {}), 8000);

    await sendWelcome(message.guild, target);
  } else {
    activeReviews.delete(target.id);
    detectedNames.delete(message.id);
    const detection = detectionMessages.get(message.id);
    detectionMessages.delete(message.id);
    await detection?.delete().catch(() => {});
    await message.reactions.removeAll().catch(() => {});
    await message.channel
      .send(`${REFUSE} Demande de ${target} refusée par ${user}. Merci de reposter une capture conforme.`)
      .catch(() => {});
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerVerification(client) {
  if (!PENDING_ROLE_ID) {
    console.warn('[verification] No VERIFICATION_ROLE_ID configured; feature disabled.');
    return;
  }
  client.on(Events.GuildMemberAdd, onMemberJoin);
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.MessageReactionAdd, onReaction);
}
