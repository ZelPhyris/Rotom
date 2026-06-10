import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';

const BRAND = 0xffffff;

/**
 * Help entries for each command. Add a command here and it appears
 * automatically in /help (overview + dropdown detail).
 */
export const COMMAND_HELP = [
  {
    id: 'map',
    name: '/map',
    emoji: '🗺️',
    short: 'Carte des joueurs par secteur de Pau.',
    description:
      'Affiche une image de la carte de Pau avec le nombre de joueurs par secteur. Un secteur n’affiche son compteur qu’à partir de 3 joueurs (anonymat).',
    usage: '/map',
    examples: ['/map'],
  },
  {
    id: 'rdv',
    name: '/rdv',
    emoji: '📅',
    short: 'Organiser une sortie (salon temporaire).',
    description:
      'Crée un salon temporaire pour une sortie, avec inscriptions via un bouton, annonce dans le salon dédié, et fermeture automatique 1h après l’heure prévue.',
    usage: '/rdv place:<lieu> time:<heure> [description:<texte>]',
    examples: [
      '/rdv place:Parc Beaumont time:15h',
      '/rdv place:Lons time:18h30 description:Raid Méga + balade',
    ],
  },
  {
    id: 'embed',
    name: '/embed',
    emoji: '📋',
    adminOnly: true,
    short: 'Publier un embed d’information.',
    description:
      'Publie un embed d’information dans le salon courant (règlement, vérification…).',
    usage: '/embed type:<Règlement|Vérification>',
    examples: ['/embed type: Règlement', '/embed type: Vérification'],
  },
  {
    id: 'test',
    name: '/test',
    emoji: '🧪',
    adminOnly: true,
    short: 'Outils de test du parcours d’arrivée.',
    description:
      'Simule une arrivée, prévisualise le message de bienvenue, ou nettoie le rôle en attente — sans faire rejoindre un vrai membre.',
    usage: '/test <arrivee|bienvenue|reset> [membre]',
    examples: ['/test arrivee', '/test bienvenue', '/test reset membre:@Dresseur'],
  },
  {
    id: 'set-pogo',
    name: '/set-pogo',
    emoji: '🎮',
    short: 'Enregistre ton nom de jeu et code ami Pokémon GO.',
    description:
      'Enregistre ton nom de dresseur et ton code ami (12 chiffres). Ces infos s’affichent ensuite dans /userinfo.',
    usage: '/set-pogo nom:<texte> code:<12 chiffres>',
    examples: ['/set-pogo nom:RedAsh code:1234 5678 9012'],
  },
  {
    id: 'userinfo',
    name: '/userinfo',
    emoji: '👤',
    short: 'Affiche le profil d’un membre.',
    description:
      'Affiche le profil d’un membre : pseudo, secteur, dates, et — s’ils sont renseignés — son nom de jeu et son code ami Pokémon GO.',
    usage: '/userinfo [membre]',
    examples: ['/userinfo', '/userinfo membre:@Dresseur'],
  },
  {
    id: 'niveau',
    name: '/niveau',
    emoji: '⭐',
    short: 'Affiche ton niveau et ton XP.',
    description:
      'Affiche ton niveau, ta barre de progression et ton XP total. Tu gagnes de l’XP en discutant sur le serveur.',
    usage: '/niveau [membre]',
    examples: ['/niveau', '/niveau membre:@Dresseur'],
  },
  {
    id: 'classement',
    name: '/classement',
    emoji: '🏆',
    short: 'Top 10 des membres par XP.',
    description: 'Affiche le classement des membres les plus actifs (par XP).',
    usage: '/classement',
    examples: ['/classement'],
  },
  {
    id: 'classement-pogo',
    name: '/classement-pogo',
    emoji: '🔴',
    short: 'Classement Pokémon GO (niveau, XP, Pokédex).',
    description:
      'Classement de la communauté par stats Pokémon GO. Rejoins-le, et mets tes stats à jour en envoyant une capture de ton profil au bot en MP — il les lit automatiquement. Un rappel est envoyé chaque mois.',
    usage: '/classement-pogo <voir|rejoindre|quitter> [stat]',
    examples: ['/classement-pogo voir stat:Niveau', '/classement-pogo rejoindre', '/classement-pogo quitter'],
  },
  {
    id: 'pendu',
    name: '/pendu',
    emoji: '🎮',
    short: 'Jeu du pendu version Pokémon.',
    description:
      'Lance une partie de pendu avec un nom de Pokémon (en français). Devine en tapant une lettre dans le chat. 6 erreurs max !',
    usage: '/pendu',
    examples: ['/pendu'],
  },
  {
    id: 'help',
    name: '/help',
    emoji: '❓',
    short: 'Affiche cette aide.',
    description: 'Liste les commandes et permet d’afficher le détail de chacune.',
    usage: '/help',
    examples: ['/help'],
  },
];

export function buildOverviewEmbed() {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('Aide — Motisma’Pau')
    .setDescription(
      'Voici les commandes disponibles. Choisis-en une dans le menu ci-dessous pour voir le détail et des exemples.',
    );

  for (const c of COMMAND_HELP) {
    embed.addFields({ name: `• ${c.name}${c.adminOnly ? ' 🔒' : ''}`, value: c.short });
  }

  embed.setFooter({ text: '🔒 = réservé aux administrateurs' });
  return embed;
}

export function buildCommandEmbed(id) {
  const c = COMMAND_HELP.find((x) => x.id === id);
  if (!c) return buildOverviewEmbed();

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`• ${c.name}`)
    .setDescription(c.description)
    .addFields({ name: 'Utilisation', value: `\`${c.usage}\`` });

  if (c.examples?.length) {
    embed.addFields({ name: 'Exemples', value: c.examples.map((e) => `\`${e}\``).join('\n') });
  }
  if (c.adminOnly) {
    embed.addFields({ name: 'Accès', value: '🔒 Réservé aux administrateurs' });
  }
  return embed;
}

export function buildSelectRow(selectedId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:select')
    .setPlaceholder('Choisis une commande…')
    .addOptions(
      COMMAND_HELP.map((c) => ({
        label: `• ${c.name}`,
        value: c.id,
        description: c.short.slice(0, 100),
        default: c.id === selectedId,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}
