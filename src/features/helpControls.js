import { Events } from 'discord.js';
import { buildCommandEmbed, buildSelectRow } from '../help/help.js';

// Update the ephemeral help message when a command is picked in the dropdown.
async function onSelect(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'help:select') return;
  const id = interaction.values[0];
  await interaction.update({
    embeds: [buildCommandEmbed(id)],
    components: [buildSelectRow(id)],
  });
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerHelpControls(client) {
  client.on(Events.InteractionCreate, onSelect);
}
