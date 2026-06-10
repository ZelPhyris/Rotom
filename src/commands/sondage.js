import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const data = (() => {
  const builder = new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage avec réactions.')
    .addStringOption((opt) =>
      opt.setName('question').setDescription('La question du sondage.').setRequired(true).setMaxLength(256),
    );
  // Up to 10 optional choices. Without any, the poll is a simple Oui / Non.
  for (let i = 1; i <= 10; i++) {
    builder.addStringOption((opt) =>
      opt.setName(`choix${i}`).setDescription(`Choix ${i}`).setMaxLength(100),
    );
  }
  return builder;
})();

export async function execute(interaction) {
  const question = interaction.options.getString('question', true);
  const choices = [];
  for (let i = 1; i <= 10; i++) {
    const c = interaction.options.getString(`choix${i}`);
    if (c) choices.push(c);
  }

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('📊 ' + question)
    .setFooter({ text: `Sondage lancé par ${interaction.user.username}` });

  let reactions;
  if (choices.length) {
    embed.setDescription(choices.map((c, i) => `${NUMBER_EMOJIS[i]}  ${c}`).join('\n\n'));
    reactions = choices.map((_, i) => NUMBER_EMOJIS[i]);
  } else {
    embed.setDescription('👍  Oui\n\n👎  Non');
    reactions = ['👍', '👎'];
  }

  await interaction.reply({ embeds: [embed] });
  const message = await interaction.fetchReply();
  for (const r of reactions) {
    await message.react(r).catch(() => {});
  }
}
