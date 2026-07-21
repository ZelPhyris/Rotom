import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildReglementEmbed } from '../embeds/reglement.js';
import { buildVerificationEmbed } from '../embeds/verification.js';
import { buildSuggestionsEmbed } from '../embeds/suggestions.js';
import { buildPresentationEmbed } from '../embeds/presentation.js';
import { buildBotPresentationEmbed } from '../embeds/botPresentation.js';
import { buildRessourcesEmbed } from '../embeds/ressources.js';
import { buildClassementEmbed, buildClassementComponents } from '../embeds/classement.js';
import { exampleImageAttachment } from '../embeds/exampleImage.js';

/**
 * Registry of publishable info embeds. To add one: create its builder in
 * src/embeds/, then add an entry here (the `value` becomes the choice).
 * `components` is optional (e.g. an embed with an interactive button).
 */
const EMBEDS = {
  reglement: { label: 'Règlement', build: buildReglementEmbed },
  verification: { label: 'Vérification', build: buildVerificationEmbed, files: () => [exampleImageAttachment()].filter(Boolean) },
  suggestions: { label: 'Suggestions', build: buildSuggestionsEmbed },
  presentation: { label: 'Présentation', build: buildPresentationEmbed },
  motisma: { label: 'Motisma (le bot)', build: buildBotPresentationEmbed },
  ressources: { label: 'Salons à connaître', build: buildRessourcesEmbed },
  classement: { label: 'Classement PoGo', build: buildClassementEmbed, components: buildClassementComponents },
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

  const embed = await entry.build(interaction);
  const components = entry.components ? [await entry.components(interaction)] : [];
  const files = entry.files ? entry.files(interaction) : [];
  await interaction.channel.send({ embeds: [embed], components, files });
  await interaction.reply({ content: `Embed « ${entry.label} » publié ici. ✅`, ephemeral: true });
}
