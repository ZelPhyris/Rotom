import {
  ActionRowBuilder,
  ChannelType,
  Events,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';

/**
 * Handles the "Déplacer" context-menu command in two steps:
 *  1. A channel-select picks the destination parent (text / announcement /
 *     forum / media) — see commands/move.js.
 *  2. If that channel can hold threads, this module lists its open (and recent
 *     archived) posts/threads itself — fetched server-side, so every open forum
 *     post shows up, unlike Discord's native thread picker — and lets the mod
 *     pick the exact post (or the channel root / a new forum post).
 * The move re-posts the message via a webhook (mimicking the author) then deletes
 * the original. The bot needs Manage Webhooks on the target + Manage Messages on
 * the source. Reactions/edit history are not carried over.
 */
const FORUM_TYPES = new Set([ChannelType.GuildForum, ChannelType.GuildMedia]);
const THREADED_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

// Newest-first by snowflake id (a just-created post has the highest id), so the
// cap below never hides a post the moderator just made.
const newestFirst = (list) => [...list].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));

// Active + recent archived (public) threads of a channel, deduped, capped at 24
// (Discord allows 25 select options; one is reserved for the channel root).
// Open posts come first (newest first), then recent archived posts as a fallback.
async function listThreads(channel, cap = 24) {
  if (!channel?.threads) return [];
  const active = new Map();
  try {
    const open = await channel.threads.fetchActive();
    for (const t of open.threads.values()) active.set(t.id, t);
  } catch {
    /* ignore */
  }
  let result = newestFirst(active.values());

  if (result.length < cap) {
    try {
      const archived = await channel.threads.fetchArchived({ type: 'public', limit: 25 });
      const extra = newestFirst([...archived.threads.values()].filter((t) => !active.has(t.id)));
      result = result.concat(extra);
    } catch {
      /* ignore */
    }
  }
  return result.slice(0, cap);
}

// Step 1 result: a parent channel was chosen. Offer its posts/threads, or move
// straight away for a plain channel with no threads.
async function onChannelSelect(interaction) {
  if (!interaction.isChannelSelectMenu() || !interaction.customId.startsWith('move:')) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'Réservé aux modérateurs.', ephemeral: true });
    return;
  }

  const [, srcChannelId, messageId] = interaction.customId.split(':');
  const targetId = interaction.values[0];
  const target = await interaction.guild.channels.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.update({ content: 'Salon introuvable.', components: [] });
    return;
  }

  const isForum = FORUM_TYPES.has(target.type);
  const threads = THREADED_TYPES.has(target.type) ? await listThreads(target) : [];

  // Plain channel without threads → no second step needed.
  if (!isForum && !threads.length) {
    await interaction.deferUpdate();
    await doMove(interaction, srcChannelId, messageId, target);
    return;
  }

  const rootOption = isForum
    ? { label: 'Nouveau post', value: '__root__', emoji: '📝', description: 'Créer un nouveau post dans le forum' }
    : { label: `# ${target.name}`, value: '__root__', description: 'Poster directement dans le salon' };
  const options = [
    rootOption,
    ...threads.map((t) => ({
      label: t.name.slice(0, 100),
      value: t.id,
      description: t.archived ? 'post archivé' : 'post ouvert',
    })),
  ].slice(0, 25);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`movethread:${srcChannelId}:${messageId}:${targetId}`)
      .setPlaceholder(isForum ? 'Choisis un post (ou un nouveau)' : 'Choisis un fil (ou le salon)')
      .addOptions(options),
  );
  await interaction.update({
    content: `Destination : **${target.name}** — choisis le post/fil :`,
    components: [row],
  });
}

// Step 2 result: a specific thread/post (or the channel root) was chosen.
async function onThreadSelect(interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('movethread:')) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'Réservé aux modérateurs.', ephemeral: true });
    return;
  }

  const [, srcChannelId, messageId, targetId] = interaction.customId.split(':');
  const choice = interaction.values[0];
  const destId = choice === '__root__' ? targetId : choice;
  await interaction.deferUpdate();

  const dest = await interaction.guild.channels.fetch(destId).catch(() => null);
  if (!dest) {
    await interaction.editReply({ content: 'Destination introuvable.', components: [] });
    return;
  }
  await doMove(interaction, srcChannelId, messageId, dest);
}

// Shared move: webhook-copy the message into `target`, then delete the original.
// Assumes the interaction has already been deferred/updated.
async function doMove(interaction, srcChannelId, messageId, target) {
  const guild = interaction.guild;
  const source = await guild.channels.fetch(srcChannelId).catch(() => null);
  const message = source?.isTextBased() ? await source.messages.fetch(messageId).catch(() => null) : null;

  const isForum = FORUM_TYPES.has(target?.type);
  if (!message || (!target?.isTextBased() && !isForum)) {
    await interaction.editReply({ content: 'Message ou salon introuvable.', components: [] });
    return;
  }

  // Webhooks live on the real channel, not on a thread. For a thread/forum post,
  // create the webhook on its parent and post into the thread via threadId.
  const isThread = typeof target.isThread === 'function' && target.isThread();
  const webhookChannel = isThread
    ? target.parent ?? (await guild.channels.fetch(target.parentId).catch(() => null))
    : target;

  if (!webhookChannel?.createWebhook) {
    await interaction.editReply({ content: 'Salon de destination invalide.', components: [] });
    return;
  }

  let webhook;
  try {
    webhook = await webhookChannel.createWebhook({ name: 'Motisma — déplacement' });
  } catch {
    await interaction.editReply({
      content: 'Impossible de créer un webhook — le bot a-t-il « Gérer les webhooks » sur le salon cible ?',
      components: [],
    });
    return;
  }

  try {
    const sendOptions = {
      username: (message.member?.displayName ?? message.author.username).slice(0, 80),
      avatarURL: message.author.displayAvatarURL(),
      content: message.content || undefined,
      files: [...message.attachments.values()],
      embeds: message.embeds,
      allowedMentions: { parse: [] },
    };
    if (isThread) {
      // Post into the existing thread / forum post.
      sendOptions.threadId = target.id;
    } else if (isForum) {
      // Forum/media root: create a new post (thread) with a title.
      const firstLine = message.content?.split('\n')[0]?.trim();
      sendOptions.threadName = (firstLine || `Message de ${message.author.username}`).slice(0, 100);
    }
    await webhook.send(sendOptions);
  } catch (error) {
    console.error('[move] webhook send failed:', error);
    await interaction.editReply({ content: 'Échec de la copie du message.', components: [] });
    await webhook.delete().catch(() => {});
    return;
  }

  await webhook.delete().catch(() => {});
  const deleted = await message.delete().then(() => true).catch(() => false);

  await interaction.editReply({
    content: `Message déplacé vers ${target}. ${deleted ? '✅' : '⚠️ (original non supprimé — permission « Gérer les messages » manquante)'}`,
    components: [],
  });
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerMoveControls(client) {
  client.on(Events.InteractionCreate, onChannelSelect);
  client.on(Events.InteractionCreate, onThreadSelect);
}
