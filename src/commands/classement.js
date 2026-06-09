import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { topXp } from '../db.js';
import { levelFromXp } from '../features/leveling.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export const data = new SlashCommandBuilder()
  .setName('classement')
  .setDescription('Top 10 des membres par XP.');

export async function execute(interaction) {
  const top = await topXp(10);

  if (!top.length) {
    await interaction.reply({ content: 'Personne n’a encore d’XP. Lancez la discussion ! 💬', ephemeral: true });
    return;
  }

  const lines = top.map((row, i) => {
    const rank = MEDALS[i] ?? `**${i + 1}.**`;
    return `${rank} <@${row.discordId}> — niveau ${levelFromXp(row.xp)} (${row.xp} XP)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('🏆 Classement XP')
    .setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
