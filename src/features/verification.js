import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionFlagsBits,
} from 'discord.js';
import { config } from '../config.js';
import { sendWelcome } from './welcome.js';

/**
 * Newcomer verification flow:
 *  1. On join, the "pending" role is assigned (it should only grant access to
 *     the verification channel — configure that in the server settings).
 *  2. When a pending member posts anything in the verification channel, the bot
 *     attaches Valider / Refuser buttons usable only by moderators.
 *  3. "Valider" removes the pending role, unlocking the rest of the server.
 *
 * Needs the GuildMessages intent (non-privileged). Message content is NOT read,
 * so the privileged MessageContent intent is not required.
 *
 * The bot's highest role must sit ABOVE the pending role to be able to remove it.
 */
const PENDING_ROLE_ID = config.verificationRoleId;
const VERIF_CHANNEL_ID = config.verificationChannelId; // optional scope

// Members with an open review prompt, so we don't spam buttons on every message.
const activeReviews = new Set();

function isModerator(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles);
}

function reviewRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`verify:approve:${userId}`)
      .setLabel('Valider')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`verify:reject:${userId}`)
      .setLabel('Refuser')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
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
    await message.reply({
      content: `🔎 Vérification de ${member} — un modérateur doit valider la capture ci-dessus.`,
      components: [reviewRow(member.id)],
    });
  } catch (error) {
    activeReviews.delete(member.id);
    console.error('[verification] Failed to post the review prompt:', error);
  }
}

async function onButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('verify:')) return;

  const [, action, userId] = interaction.customId.split(':');

  if (!isModerator(interaction)) {
    await interaction.reply({ content: 'Réservé aux modérateurs.', ephemeral: true });
    return;
  }

  const target = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!target) {
    activeReviews.delete(userId);
    await interaction.update({ content: 'Membre introuvable (a-t-il quitté le serveur ?).', components: [] });
    return;
  }

  if (action === 'approve') {
    try {
      await target.roles.remove(PENDING_ROLE_ID, `Validé par ${interaction.user.tag}`);
    } catch (error) {
      console.error('[verification] Failed to remove the pending role:', error);
      await interaction.reply({
        content: 'Impossible de retirer le rôle — vérifie que le rôle du bot est au-dessus du rôle en attente.',
        ephemeral: true,
      });
      return;
    }
    activeReviews.delete(userId);
    await interaction.update({
      content: `✅ ${target} a été validé par ${interaction.user}. Bienvenue ! 🎉`,
      components: [],
    });
    await sendWelcome(interaction.guild, target);
  } else {
    activeReviews.delete(userId);
    await interaction.update({
      content: `❌ Demande de ${target} refusée par ${interaction.user}. Merci de reposter une capture conforme.`,
      components: [],
    });
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
  client.on(Events.InteractionCreate, onButton);
}
