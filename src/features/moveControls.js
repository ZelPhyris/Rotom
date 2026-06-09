import { ChannelType, Events, PermissionFlagsBits } from 'discord.js';

/**
 * Handles the channel-select that follows the "Déplacer" context-menu command.
 * "Moves" a message by re-posting it in the target channel via a webhook
 * (mimicking the original author), then deleting the original.
 *
 * The bot needs: Manage Webhooks in the target channel, Manage Messages in the
 * source channel. Reactions/edit history are not carried over.
 */
async function onSelect(interaction) {
  if (!interaction.isChannelSelectMenu() || !interaction.customId.startsWith('move:')) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'Réservé aux modérateurs.', ephemeral: true });
    return;
  }

  const [, srcChannelId, messageId] = interaction.customId.split(':');
  const targetId = interaction.values[0];
  await interaction.deferUpdate();

  const guild = interaction.guild;
  const source = await guild.channels.fetch(srcChannelId).catch(() => null);
  const target = await guild.channels.fetch(targetId).catch(() => null);
  const message = source?.isTextBased() ? await source.messages.fetch(messageId).catch(() => null) : null;

  const isForum = target?.type === ChannelType.GuildForum || target?.type === ChannelType.GuildMedia;
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
  client.on(Events.InteractionCreate, onSelect);
}
