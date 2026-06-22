import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from '../../config.js';
import { buildVerificationLogEmbed } from '../../features/verification.js';

/**
 * Admin helper to preview the verification log embed without going through a
 * real verification. Posts a sample to the configured log channel if set,
 * otherwise replies with the embed so the format can still be checked.
 *   /test-log [cas:ok|suspect]
 */
export const data = new SlashCommandBuilder()
  .setName('test-log')
  .setDescription('Affiche un exemple de l’embed de log de vérification (admin).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o
      .setName('cas')
      .setDescription('Type d’exemple à afficher (défaut : ok)')
      .addChoices(
        { name: 'Photo OK', value: 'ok' },
        { name: 'Photo suspecte', value: 'suspect' },
      ),
  );

export async function execute(interaction) {
  const suspected = interaction.options.getString('cas') === 'suspect';
  const member = interaction.member;

  const embed = buildVerificationLogEmbed({
    target: member,
    mod: member,
    name: member.displayName,
    team: 'mystic',
    suspected,
    tamperReason: suspected ? 'exemple : niveau incohérent avec l’XP' : null,
  });

  const logChannel = config.logChannelId
    ? await interaction.guild.channels.fetch(config.logChannelId).catch(() => null)
    : null;

  if (logChannel?.isTextBased?.()) {
    await logChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `Exemple envoyé dans ${logChannel}.` });
    return;
  }

  await interaction.reply({
    content: config.logChannelId
      ? 'Salon de log introuvable — voici quand même l’aperçu :'
      : 'Aucun LOG_CHANNEL_ID configuré — voici l’aperçu :',
    embeds: [embed],
  });
}
