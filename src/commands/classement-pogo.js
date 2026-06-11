import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { hasDb, setClassementOptIn, topPogoStat } from '../db.js';
import { hasVision } from '../features/visionExtract.js';

const MEDALS = ['🥇', '🥈', '🥉'];

// The three ranked stats. `column` matches the DB column whitelist in topPogoStat.
const fr = (v) => v.toLocaleString('fr-FR');
const STATS = {
  niveau: { column: 'pogo_level', label: 'Niveau', emoji: '⭐', fmt: (v) => `niveau **${v}**` },
  xp: { column: 'pogo_xp', label: 'XP totale', emoji: '✨', fmt: (v) => `**${fr(v)}** XP` },
  pokedex: { column: 'pogo_pokedex', label: 'Pokémon capturés', emoji: '🔴', fmt: (v) => `**${fr(v)}** capturés` },
  distance: { column: 'pogo_distance', label: 'Distance parcourue', emoji: '👟', fmt: (v) => `**${fr(v)}** km` },
  pokestops: { column: 'pogo_pokestops', label: 'PokéStops visités', emoji: '🛑', fmt: (v) => `**${fr(v)}** PokéStops` },
};

export const data = new SlashCommandBuilder()
  .setName('classement-pogo')
  .setDescription('Classement Pokémon GO de la communauté (niveau, XP, Pokédex).')
  .addSubcommand((sub) =>
    sub
      .setName('voir')
      .setDescription('Affiche le classement.')
      .addStringOption((opt) =>
        opt
          .setName('stat')
          .setDescription('Statistique à classer (défaut : niveau).')
          .addChoices(
            { name: 'Niveau', value: 'niveau' },
            { name: 'XP totale', value: 'xp' },
            { name: 'Pokémon capturés', value: 'pokedex' },
            { name: 'Distance parcourue', value: 'distance' },
            { name: 'PokéStops visités', value: 'pokestops' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('rejoindre').setDescription('Participe au classement (rappel mensuel pour mettre à jour tes stats).'),
  )
  .addSubcommand((sub) => sub.setName('quitter').setDescription('Quitte le classement.'));

async function syncRole(interaction, add) {
  if (!config.classementRoleId) return;
  try {
    if (add) await interaction.member.roles.add(config.classementRoleId, 'Participe au classement PoGo');
    else await interaction.member.roles.remove(config.classementRoleId, 'Quitte le classement PoGo');
  } catch (error) {
    console.error('[classement] Failed to sync the participation role:', error?.message ?? error);
  }
}

export async function execute(interaction) {
  if (!hasDb()) {
    await interaction.reply({ content: 'La base de données est indisponible pour le moment.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'rejoindre') {
    await setClassementOptIn(interaction.user.id, true);
    await syncRole(interaction, true);
    const dmHint = hasVision()
      ? '\n\n📸 Tu peux **m’envoyer un MP avec une capture de ton profil** (niveau, XP, Pokémon capturés) à tout moment pour mettre à jour tes stats. Je te relancerai aussi chaque mois.'
      : '\n\nJe te relancerai chaque mois pour mettre à jour tes stats.';
    await interaction.reply({
      content: `🏆 Tu participes maintenant au **classement Pokémon GO** !${dmHint}`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'quitter') {
    await setClassementOptIn(interaction.user.id, false);
    await syncRole(interaction, false);
    await interaction.reply({ content: 'Tu as quitté le classement. Tu peux revenir quand tu veux ! 👋', ephemeral: true });
    return;
  }

  // voir
  const key = interaction.options.getString('stat') ?? 'niveau';
  const stat = STATS[key] ?? STATS.niveau;
  const top = await topPogoStat(stat.column, 10);

  if (!top.length) {
    await interaction.reply({
      content: 'Aucune stat enregistrée pour le moment. Rejoins avec `/classement-pogo rejoindre` puis envoie-moi une capture de ton profil en MP ! 📸',
      ephemeral: true,
    });
    return;
  }

  const lines = top.map((row, i) => {
    const rank = MEDALS[i] ?? `**${i + 1}.**`;
    return `${rank} <@${row.discordId}> — ${stat.fmt(row.value)}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle(`${stat.emoji} Classement PoGo — ${stat.label}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Mets à jour tes stats en m’envoyant une capture en MP.' });

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
