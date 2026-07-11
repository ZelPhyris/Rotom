import { SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { hasDb, setClassementOptIn } from '../db.js';
import { hasVision } from '../features/visionExtract.js';
import { buildBoard } from '../embeds/classementBoard.js';

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
            { name: 'Œufs éclos', value: 'eggs' },
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

  // voir : embed + boutons de catégorie + lien vers le site.
  const key = interaction.options.getString('stat') ?? 'niveau';
  await interaction.reply(await buildBoard(key));
}
