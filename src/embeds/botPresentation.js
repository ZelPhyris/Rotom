import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

// Community website — the Pokémon GO leaderboard lives here too.
const SITE_CLASSEMENT = 'https://pogo-pau.mxrine-mz.dev/classement';

// Server custom emoji used as section accents. They render in the description
// of a bot's own embed (never in a title, field name or footer). <a:…> forms
// are animated.
const E = {
  pogo: '<:pogo:1519020981308624896>',
  profil: '<a:pikahi:1519057356812587018>',
  progress: '<a:Pokemon_Evolve:1519057363896631317>',
  vocal: '<a:pikachujam:1519058412972015616>',
  fun: '<a:pokemondance:1519057370754322503>',
  help: '<:attention:1519020989680189651>',
  end: '<a:pokeballsuccess:1519058429392588830>',
};

/**
 * "Meet Motisma" embed: what the bot does for members, meant to be published in
 * the announcements channel. Everything sits in the description so the server
 * emoji can accent each heading (they never render in field names or the title).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {EmbedBuilder}
 */
export function buildBotPresentationEmbed(interaction) {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
    .setTitle('Motisma’Pau — votre assistant sur le serveur')
    .setDescription(
      [
        `${E.pogo} **Motisma** est le bot du serveur, votre compagnon au quotidien — un peu comme un Rotom-Dex de poche. Voici ce qu’il fait pour vous.`,
        '',
        `${E.profil} **VOTRE PROFIL POKÉMON GO**`,
        '`/userinfo` — ton profil, le tien ou celui d’un membre.',
        '`/classement-pogo` — rejoins le classement de la commu : envoie une **capture de ton profil en MP** au bot, il lit tes stats tout seul.',
        `Le classement complet est aussi sur le site **[PoGo Pau](${SITE_CLASSEMENT})**.`,
        '',
        `${E.progress} **TA PROGRESSION SUR LE SERVEUR**`,
        'Tu gagnes de l’XP simplement en discutant.',
        '`/niveau` — ta barre de progression et ton XP · `/classement` — le top 10 des plus actifs.',
        '',
        `${E.vocal} **SALONS VOCAUX**`,
        'Rejoins le salon vocal dédié pour **créer ton propre vocal** en un clic.',
        '',
        `${E.fun} **POUR SE DÉTENDRE**`,
        '`/quiz` · `/pendu` · `/morpion` · `/devinette` · `/sondage`',
        '',
        `${E.help} Pour tout voir en détail, avec des exemples : **\`/help\`**`,
        '',
        `${E.end} Bon jeu, et à bientôt sur le terrain !`,
      ].join('\n'),
    )
    .setFooter({ text: 'Motisma’Pau' });
}
