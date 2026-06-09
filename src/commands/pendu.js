import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// Noms de Pokémon (français), sans accent ni caractère spécial pour le jeu.
const WORDS = [
  'BULBIZARRE', 'HERBIZARRE', 'FLORIZARRE', 'SALAMECHE', 'REPTINCEL', 'DRACAUFEU',
  'CARAPUCE', 'CARABAFFE', 'TORTANK', 'CHENIPAN', 'PAPILUSION', 'ASPICOT', 'DARDARGNAN',
  'ROUCOOL', 'ROUCARNAGE', 'RATTATA', 'PIKACHU', 'RAICHU', 'SABELETTE', 'NIDOKING',
  'NIDOQUEEN', 'MELOFEE', 'GOUPIX', 'FEUNARD', 'RONDOUDOU', 'GRODOUDOU', 'MYSTHERBE',
  'RAFFLESIA', 'PARAS', 'TAUPIQUEUR', 'MIAOUSS', 'PERSIAN', 'PSYKOKWAK', 'FEROSINGE',
  'CANINOS', 'ARCANIN', 'PTITARD', 'ABRA', 'KADABRA', 'ALAKAZAM', 'MACHOC', 'MACKOGNEUR',
  'EMPIFLOR', 'TENTACRUEL', 'RACAILLOU', 'GROLEM', 'PONYTA', 'GALOPA', 'RAMOLOSS',
  'MAGNETON', 'DODRIO', 'OTARIA', 'TADMORV', 'KOKIYAS', 'ECTOPLASMA', 'ONIX',
  'HYPNOMADE', 'KRABBY', 'ELECTRODE', 'NOADKOKO', 'OSSATUEUR', 'KICKLEE', 'TYGNON',
  'EXCELANGUE', 'SMOGOGO', 'RHINOFEROS', 'KANGOUREX', 'HYPOCEAN', 'POISSOROY', 'STAROSS',
  'INSECATEUR', 'LIPPOUTOU', 'ELEKTEK', 'TAUROS', 'MAGICARPE', 'LEVIATOR', 'LOKHLASS',
  'METAMORPH', 'EVOLI', 'AQUALI', 'VOLTALI', 'PYROLI', 'PORYGON', 'KABUTOPS', 'PTERA',
  'RONFLEX', 'ARTIKODIN', 'ELECTHOR', 'SULFURA', 'MINIDRACO', 'DRACOLOSSE', 'MEWTWO', 'MEW',
];

const STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

const MAX_WRONG = 6;
const activeGames = new Map();

export const data = new SlashCommandBuilder()
  .setName('pendu')
  .setDescription('🎮 Jouer au pendu version Pokémon !');

function gameEmbed(game) {
  const display = game.word
    .split('')
    .map((l) => (game.found.includes(l) ? `\`${l}\`` : '`_`'))
    .join(' ');
  const wrong = game.wrong.length ? game.wrong.map((l) => `~~${l}~~`).join(' ') : 'Aucune';

  return new EmbedBuilder()
    .setColor(game.wrong.length >= MAX_WRONG ? 0xff0000 : 0xffffff)
    .setTitle('🎮 Pendu Pokémon')
    .setDescription(
      `${STAGES[game.wrong.length]}\n\n**Pokémon à trouver :**\n${display}\n\n` +
        `**Lettres ratées :** ${wrong}\n**Essais restants :** ${MAX_WRONG - game.wrong.length}/${MAX_WRONG}`,
    )
    .setFooter({ text: 'Écris une lettre dans le chat pour deviner !' });
}

export async function execute(interaction) {
  const key = `${interaction.user.id}-${interaction.channelId}`;
  if (activeGames.has(key)) {
    await interaction.reply({ content: 'Tu as déjà une partie en cours ici !', ephemeral: true });
    return;
  }

  const game = {
    word: WORDS[Math.floor(Math.random() * WORDS.length)],
    found: [],
    wrong: [],
    start: Date.now(),
  };
  activeGames.set(key, game);

  await interaction.reply({ embeds: [gameEmbed(game)] });

  const filter = (m) =>
    m.author.id === interaction.user.id && m.content.length === 1 && /^[A-Za-z]$/.test(m.content);
  const collector = interaction.channel.createMessageCollector({ filter, time: 300000 });

  collector.on('collect', async (message) => {
    const g = activeGames.get(key);
    if (!g) return collector.stop();

    const letter = message.content.toUpperCase();
    if (g.found.includes(letter) || g.wrong.includes(letter)) {
      await message.react('❔').catch(() => {});
      return;
    }

    if (g.word.includes(letter)) {
      g.found.push(letter);
      await message.react('✅').catch(() => {});
    } else {
      g.wrong.push(letter);
      await message.react('❌').catch(() => {});
    }

    const won = g.word.split('').every((l) => g.found.includes(l));
    const lost = g.wrong.length >= MAX_WRONG;

    if (won || lost) {
      activeGames.delete(key);
      collector.stop();
      const secs = Math.round((Date.now() - g.start) / 1000);
      const embed = won
        ? new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎉 Gagné !')
            .setDescription(`C’était bien **${g.word}** !\n\n**Temps :** ${secs}s · **Erreurs :** ${g.wrong.length}`)
        : new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('💀 Perdu !')
            .setDescription(`${STAGES[MAX_WRONG]}\n\nLe Pokémon était : **${g.word}**`);
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
      await message.react(won ? '🎉' : '💀').catch(() => {});
      return;
    }

    await interaction.editReply({ embeds: [gameEmbed(g)] }).catch(() => {});
  });

  collector.on('end', async (collected) => {
    activeGames.delete(key);
    if (collected.size === 0) return;
    try {
      if (collected.size > 1) await interaction.channel.bulkDelete(collected, true);
      else await collected.first().delete();
    } catch {
      /* permissions manquantes ou messages > 14j : on ignore */
    }
  });
}
