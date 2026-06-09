import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildReglementEmbed } from '../embeds/reglement.js';
import { buildVerificationEmbed } from '../embeds/verification.js';

/**
 * Registry of publishable info embeds. To add one: create its builder in
 * src/embeds/, then add an entry here (the `value` becomes the choice).
 */
const EMBEDS = {
  reglement: { label: 'Règlement', build: buildReglementEmbed },
  verification: { label: 'Vérification', build: buildVerificationEmbed },
};

export const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Publier un embed d’information du serveur (admin).')
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Quel embed publier')
      .setRequired(true)
      .addChoices(
        ...Object.entries(EMBEDS).map(([value, { label }]) => ({ name: label, value })),
      ),
  )
  // Only members with "Manage Server" see and can use this command.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const type = interaction.options.getString('type', true);
  const entry = EMBEDS[type];

  if (!entry) {
    await interaction.reply({ content: 'Embed inconnu.', ephemeral: true });
    return;
  }

  await interaction.channel.send({ embeds: [entry.build()] });
  await interaction.reply({ content: `Embed « ${entry.label} » publié ici. ✅`, ephemeral: true });
}
