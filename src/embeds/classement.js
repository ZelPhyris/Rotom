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
        '### Et si on savait enfin qui est le meilleur dresseur de Pau ? 👀',
        '',
        'Chaque mois, la communauté se compare sur plusieurs tableaux :',
        '> ⭐ **Niveau** · ✨ **XP totale** · 🔴 **Captures** · 👟 **Distance** · 🛑 **PokéStops**',
        '',
        'Que tu sois lvl 50 ou en pleine montée, **ta place t’attend**. 🚀',
      ].join('\n'),
    )
    .addFields(
      {
        name: '✅  Rejoindre, c’est instantané',
        value: 'Un clic sur **Participer** ci-dessous → tu reçois le rôle et un petit message privé pour démarrer. C’est tout.',
      },
      {
        name: '📸  Zéro saisie, juste une capture',
        value: 'Envoie-moi en MP une **photo de ton profil** : je lis ton niveau, ton XP, tes captures, ta distance et tes PokéStops **automatiquement**. Magique. ✨',
      },
      {
        name: '🔔  On s’occupe du reste',
        value: 'Une fois par mois, je te relance gentiment pour rafraîchir tes stats. Pas dispo ? Tu ignores, aucun souci.',
      },
    )
    .setFooter({ text: 'Voir le classement : /classement-pogo voir  ·  Quitter quand tu veux : /classement-pogo quitter' });
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
