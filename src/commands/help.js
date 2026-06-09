import { SlashCommandBuilder } from 'discord.js';
import { buildOverviewEmbed, buildSelectRow } from '../help/help.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Affiche l’aide et la liste des commandes.');

export async function execute(interaction) {
  await interaction.reply({
    ephemeral: true,
    embeds: [buildOverviewEmbed()],
    components: [buildSelectRow()],
  });
}
