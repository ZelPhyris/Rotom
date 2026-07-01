import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { countBySector } from '../services/sectors.js';
import { renderSectorMap } from '../services/mapRenderer.js';
import { MIN_VISIBLE_PLAYERS } from '../config/sectors.js';

export const data = new SlashCommandBuilder()
  .setName('map')
  .setDescription('Show how many players are active in each area of Pau.')
  // Hidden from regular members: only staff ("Gérer le serveur") see and use it.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply();

  const counts = await countBySector(interaction.guild);
  const png = await renderSectorMap(counts);
  const file = new AttachmentBuilder(png, { name: 'map.png' });

  const embed = new EmbedBuilder()
    .setTitle('Joueurs par secteur — Pau')
    .setImage('attachment://map.png')
    .setFooter({ text: `Un secteur affiche son compteur à partir de ${MIN_VISIBLE_PLAYERS} joueurs.` });

  await interaction.editReply({ embeds: [embed], files: [file] });
}
