import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

// customId of the "join" button, routed in features/classement.js.
export const JOIN_BUTTON_ID = 'classement:join';

/**
 * Participation embed for the monthly Pokémon GO classement of Pau.
 * @returns {EmbedBuilder}
 */
export function buildClassementEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('🏆  Le Classement des Dresseurs de Pau')
    .setThumbnail('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png')
    .setDescription(
      [
        'Et si on savait enfin qui est le meilleur dresseur de Pau ?',
        'Chaque mois on se compare sur **Niveau · XP · Captures · Distance · PokéStops · Œufs éclos**.',
        '',
        'Clique sur **Participer**, puis envoie-moi une **capture de ton profil** en MP : je lis tout automatiquement. 📸',
        '',
        'Une relance par mois, ignorable si tu n’es pas dispo. 🔔',
      ].join('\n'),
    )
    .setFooter({ text: 'Voir : /classement-pogo voir  ·  Quitter : /classement-pogo quitter' });
}

/**
 * The "Participer" button row that accompanies the embed.
 * @returns {ActionRowBuilder}
 */
export function buildClassementComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(JOIN_BUTTON_ID)
      .setLabel('Participer au classement')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Success),
  );
}
