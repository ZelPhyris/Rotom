import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getXp } from '../db.js';
import { levelFromXp, totalXpForLevel, xpForLevel } from '../features/leveling.js';

export const data = new SlashCommandBuilder()
  .setName('niveau')
  .setDescription('Affiche ton niveau et ton XP.')
  .addUserOption((opt) =>
    opt.setName('membre').setDescription('Le membre à afficher (par défaut toi-même)'),
  );

export async function execute(interaction) {
  const user = interaction.options.getUser('membre') ?? interaction.user;

  const xp = await getXp(user.id);
  const level = levelFromXp(xp);
  const into = xp - totalXpForLevel(level);
  const need = xpForLevel(level);

  const filled = Math.round((into / need) * 12);
  const bar = '▰'.repeat(filled) + '▱'.repeat(12 - filled);

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`Niveau ${level}`)
    .setDescription(`${bar}\n**${into} / ${need} XP** vers le niveau ${level + 1}`)
    .setFooter({ text: `XP total : ${xp}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
