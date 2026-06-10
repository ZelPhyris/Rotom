import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

/**
 * "Plus ou moins" — the bot picks a secret number and members guess in chat.
 * It replies higher/lower; the first to find the exact number wins.
 */
const TIMEOUT_MS = 60_000;
const MAX = 100;
const active = new Set(); // channelIds with a running game

export const data = new SlashCommandBuilder()
  .setName('devinette')
  .setDescription(`Plus ou moins : devine le nombre secret entre 1 et ${MAX}.`);

export async function execute(interaction) {
  if (active.has(interaction.channelId)) {
    await interaction.reply({ content: 'Une partie est déjà en cours ici ! 🎯', ephemeral: true });
    return;
  }

  const secret = 1 + Math.floor(Math.random() * MAX);
  active.add(interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('Plus ou moins 🎯')
    .setDescription(`J’ai choisi un nombre entre **1** et **${MAX}**.\nÀ vous de le deviner dans le chat !`)
    .setFooter({ text: '60 secondes…' });

  await interaction.reply({ embeds: [embed] });

  const collector = interaction.channel.createMessageCollector({
    filter: (m) => !m.author.bot && /^\d{1,3}$/.test(m.content.trim()),
    time: TIMEOUT_MS,
  });

  collector.on('collect', async (m) => {
    const guess = Number(m.content.trim());
    if (guess === secret) {
      await m.reply(`🎉 Bravo ${m.author}, c’était **${secret}** !`).catch(() => {});
      collector.stop('found');
    } else {
      await m.react(guess < secret ? '⬆️' : '⬇️').catch(() => {});
    }
  });

  collector.on('end', async (_collected, reason) => {
    active.delete(interaction.channelId);
    if (reason !== 'found') {
      await interaction.channel
        .send(`⏱️ Temps écoulé ! Le nombre était **${secret}**.`)
        .catch(() => {});
    }
  });
}
