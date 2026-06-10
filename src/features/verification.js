import { Events, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { sendWelcome } from './welcome.js';
import { extractProfile, hasVision } from './visionExtract.js';
import { setPogoIgn, setPogoFriendCode } from '../db.js';
import { formatFriendCode } from '../commands/set-pogo.js';

/**
 * Newcomer verification flow (reaction-based, 2 screenshots supported):
 *  1. On join, the "pending" role is assigned.
 *  2. The newcomer posts screenshot(s) — typically one for the trainer name and
 *     one for the friend code. The bot reads each image, accumulates the name
 *     and the 12-digit friend code, and adds ✅ / ❌ reactions.
 *  3. A moderator clicking ✅ removes the pending role, sets the member's
 *     nickname + Pokémon GO profile (name & code), welcomes them, and cleans up
 *     the screenshots. ❌ asks the newcomer to repost.
 *
 * Needs the GuildMessages + GuildMessageReactions intents and Message/Reaction/
 * User partials. Reading attachments needs the MessageContent intent (enabled
 * when vision is configured). The bot's role must sit above the pending role.
 */
const PENDING_ROLE_ID = config.verificationRoleId;
const VERIF_CHANNEL_ID = config.verificationChannelId; // optional scope
const VALIDATE = '✅';
const REFUSE = '❌';

// Per newcomer: accumulated detection + tracked screenshot/detection messages.
// authorId -> { name, code, photoMsgIds: Set<string>, detection: Message|null }
const reviews = new Map();

function imageUrls(message) {
  return [...(message.attachments?.values() ?? [])]
    .filter((a) => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(a.name ?? ''))
    .map((a) => a.url);
}

async function updateDetection(channel, rec) {
  const namePart = rec.name ? `**${rec.name}**` : '❔';
  const codePart = rec.code ? `**${formatFriendCode(rec.code)}**` : '❔';
  const content = `🔎 Pseudo : ${namePart} · Code ami : ${codePart}\nUn modo valide avec ${VALIDATE}.`;
  if (rec.detection) await rec.detection.edit(content).catch(() => {});
  else rec.detection = await channel.send(content).catch(() => null);
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

  const urls = imageUrls(message);
  if (!urls.length) return; // only screenshots drive the flow

  let rec = reviews.get(member.id);
  if (!rec) {
    rec = { name: null, code: null, photoMsgIds: new Set(), detection: null };
    reviews.set(member.id, rec);
  }
  rec.photoMsgIds.add(message.id);

  await message.react(VALIDATE).catch(() => {});
  await message.react(REFUSE).catch(() => {});

  if (hasVision()) {
    for (const url of urls) {
      if (rec.name && rec.code) break;
      const { trainerName, friendCode } = await extractProfile(url);
      if (!rec.name && trainerName) rec.name = trainerName;
      if (!rec.code && friendCode) rec.code = friendCode;
    }
    await updateDetection(message.channel, rec);
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
  if (user.id === message.author.id) return; // can't validate your own submission

  const target = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!target || !target.roles.cache.has(PENDING_ROLE_ID)) return;

  const mod = await message.guild.members.fetch(user.id).catch(() => null);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageRoles)) return;

  const channel = message.channel;
  const rec = reviews.get(target.id);

  if (emoji === REFUSE) {
    await rec?.detection?.delete().catch(() => {});
    reviews.delete(target.id);
    await message.reactions.removeAll().catch(() => {});
    await channel
      .send(`${REFUSE} Demande de ${target} refusée par ${user}. Merci de reposter des captures conformes.`)
      .catch(() => {});
    return;
  }

  // ✅ Validate
  try {
    await target.roles.remove(PENDING_ROLE_ID, `Validé par ${user.tag}`);
  } catch (error) {
    console.error('[verification] Failed to remove the pending role:', error);
    await channel
      .send(`Impossible de retirer le rôle de ${target} — le rôle du bot doit être au-dessus du rôle en attente.`)
      .catch(() => {});
    return;
  }

  let name = rec?.name ?? null;
  let code = rec?.code ?? null;
  if (hasVision() && (!name || !code)) {
    for (const url of imageUrls(message)) {
      if (name && code) break;
      const p = await extractProfile(url);
      name = name || p.trainerName;
      code = code || p.friendCode;
    }
  }

  if (name) {
    await target.setNickname(name.slice(0, 32), `Validé par ${user.tag}`).catch((e) =>
      console.error('[verification] Failed to set nickname:', e?.message ?? e),
    );
    await setPogoIgn(target.id, name).catch((e) =>
      console.error('[verification] Failed to store IGN:', e?.message ?? e),
    );
  }
  if (code) {
    await setPogoFriendCode(target.id, code).catch((e) =>
      console.error('[verification] Failed to store friend code:', e?.message ?? e),
    );
  }

  // Clean up: delete the screenshots and the detection message.
  const photoIds = rec ? [...rec.photoMsgIds] : [message.id];
  for (const id of photoIds) await channel.messages.delete(id).catch(() => {});
  await rec?.detection?.delete().catch(() => {});
  reviews.delete(target.id);

  const bits = [];
  if (name) bits.push(`pseudo **${name}**`);
  if (code) bits.push(`code ami **${formatFriendCode(code)}**`);
  const suffix = bits.length ? ` (${bits.join(' · ')})` : '';
  const confirm = await channel
    .send(`${VALIDATE} ${target} a été validé par ${user}.${suffix}`)
    .catch(() => null);
  if (confirm) setTimeout(() => confirm.delete().catch(() => {}), 8000);

  await sendWelcome(message.guild, target);
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
