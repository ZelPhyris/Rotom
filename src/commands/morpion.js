import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

/**
 * Tic-tac-toe (morpion) between two members, played with a 3×3 button grid.
 * The challenger is ❌, the opponent is ⭕. Buttons disable as the game ends.
 */
const TIMEOUT_MS = 5 * 60 * 1000;
const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6], // diagonals
];

export const data = new SlashCommandBuilder()
  .setName('morpion')
  .setDescription('Défie un membre au morpion (tic-tac-toe).')
  .addUserOption((opt) =>
    opt.setName('adversaire').setDescription('Le membre à défier.').setRequired(true),
  );

function winner(board) {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every((c) => c) ? 'draw' : null;
}

function render(board, disabled) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const mark = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mp:${i}`)
          .setLabel(mark || '​')
          .setStyle(mark === '❌' ? ButtonStyle.Danger : mark === '⭕' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || Boolean(mark)),
      );
    }
    rows.push(row);
  }
  return rows;
}

export async function execute(interaction) {
  const opponent = interaction.options.getUser('adversaire', true);
  if (opponent.bot || opponent.id === interaction.user.id) {
    await interaction.reply({ content: 'Choisis un autre membre (pas un bot ni toi-même). 🙂', ephemeral: true });
    return;
  }

  const players = { '❌': interaction.user, '⭕': opponent };
  const board = Array(9).fill(null);
  let turn = '❌';

  const status = () => `${players[turn]} (${turn}) à toi de jouer !`;
  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('Morpion')
    .setDescription(`${interaction.user} ❌  vs  ⭕ ${opponent}\n\n${status()}`);

  await interaction.reply({ embeds: [embed], components: render(board, false) });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({ time: TIMEOUT_MS });

  collector.on('collect', async (i) => {
    if (i.user.id !== players[turn].id) {
      await i.reply({ content: 'Ce n’est pas à toi de jouer ! ⏳', ephemeral: true });
      return;
    }
    const cell = Number(i.customId.split(':')[1]);
    if (board[cell]) {
      await i.reply({ content: 'Case déjà prise.', ephemeral: true });
      return;
    }

    board[cell] = turn;
    const result = winner(board);

    if (result) {
      const desc =
        result === 'draw'
          ? '🤝 Match nul !'
          : `🏆 ${players[result]} (${result}) remporte la partie !`;
      embed.setDescription(`${interaction.user} ❌  vs  ⭕ ${opponent}\n\n${desc}`);
      await i.update({ embeds: [embed], components: render(board, true) });
      collector.stop();
      return;
    }

    turn = turn === '❌' ? '⭕' : '❌';
    embed.setDescription(`${interaction.user} ❌  vs  ⭕ ${opponent}\n\n${status()}`);
    await i.update({ embeds: [embed], components: render(board, false) });
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      embed.setDescription(`${interaction.user} ❌  vs  ⭕ ${opponent}\n\n⏱️ Partie expirée (inactivité).`);
      await message.edit({ embeds: [embed], components: render(board, true) }).catch(() => {});
    }
  });
}
