import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

const INVITE = 'https://discord.gg/bWYwAdXes3';
const NIANTIC_TERMS = 'https://nianticlabs.com/terms';
const DISCORD_TERMS = 'https://discord.com/terms';
const DISCORD_GUIDELINES = 'https://discord.com/guidelines';

// Approved external resources.
const CALCYIV = 'https://play.google.com/store/apps/details?id=tesmath.calcy';
const POKEBATTLER = 'https://www.pokebattler.com';
const PVPOKE = 'https://pvpoke.com';
const STADIUM = 'https://www.stadiumgaming.gg';
const GOHUB = 'https://pokemongohub.net';
const LEEKDUCK = 'https://leekduck.com';

/**
 * Server rules embed.
 * @returns {EmbedBuilder}
 */
export function buildReglementEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('📜 Règles du serveur')
    .setDescription(
      [
        'Pour une atmosphère **respectueuse, tolérante et accueillante** pour tous. 💙',
        '',
        '**1 —** On est sympa.',
        '**2 —** On évite les sujets qui fâchent.',
        '**3 —** Pas de pub : contacte un·e admin au préalable.',
        '',
        '**4 —** On reste matures.',
        '> L’âge minimum sur les réseaux sociaux est de **13 ans**. Les joueurs plus jeunes peuvent participer à nos rencontres IRL avec un parent ou gardien.',
        '> On est majoritairement des adultes : **comportement mature et responsable** attendu. Pas de flood, d’insolence, ni de remarques NSFW.',
        '',
        '**5 —** On suit les **CGU de Niantic et Pokémon GO** (détail ci-dessous).',
      ].join('\n'),
    )
    .addFields(
      {
        name: '🚫 5.A · Applications tierces',
        value: [
          '• Piratage GPS (*fly*, *spoof*)',
          '• Sites ou cartes indiquant où sont les Pokémon (bots, scanners)',
          '• Applis de « fausse marche » ou qui font payer pour raider à distance',
          '',
          '✅ **Ressources autorisées**',
          `• Calcul d’IV & renommage — [CalcyIV](${CALCYIV})`,
          `• Contres en raid — [PokeBattler](${POKEBATTLER})`,
          `• PvP — [PvPoke](${PVPOKE}), [GO Stadium](${STADIUM})`,
          `• Infos & guides — [Pokémon GO Hub](${GOHUB}), [LeekDuck](${LEEKDUCK})`,
        ].join('\n'),
      },
      {
        name: '🔒 5.B & 5.C · Comptes',
        value: [
          '• Le **partage de compte est interdit**, y compris si un ami en voyage se connecte pour vous.',
          '• Un joueur = **un seul et unique compte**.',
        ].join('\n'),
      },
      {
        name: 'Niantic',
        value: `[Guide du dresseur](${NIANTIC_TERMS})`,
        inline: true,
      },
      {
        name: 'Discord',
        value: `[Conditions d’utilisation](${DISCORD_TERMS})\n[Règles de la communauté](${DISCORD_GUIDELINES})`,
        inline: true,
      },
      {
        name: 'Inviter des amis',
        value: `[Lien d’invitation](${INVITE})`,
        inline: true,
      },
    )
    .setFooter({
      text: 'Respecte l’esprit du jeu : bonne humeur et sécurité avant tout — Rotom’Pau',
    });
}
