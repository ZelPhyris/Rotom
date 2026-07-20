import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

/**
 * The resource channels to highlight, grouped by theme and in display order.
 * Channels are referenced by ID: Discord renders "<#id>" with the channel's
 * current name, so renaming a channel never breaks this embed.
 *
 * An item without `desc` is rendered as a bare mention; a group whose items all
 * lack one is laid out as a compact inline list under the group's own `desc`.
 */
const GROUPS = [
  {
    title: '📌 L’essentiel',
    items: [
      { id: '1385590356837666866', desc: 'Les règles du serveur — à lire en premier.' },
      { id: '1424299961662570617', desc: 'Les annonces importantes à ne pas manquer.' },
      { id: '1518648908463739011', desc: 'Propose une sortie ou une idée pour améliorer le serveur.' },
    ],
  },
  {
    title: '💬 Partage & communauté',
    items: [
      { id: '1518600345301942342', desc: 'Partage ce que tu veux, pose tes questions.' },
      { id: '1518602555083460748', desc: 'Tes plus belles prises : shiny, pépites, 100 %…' },
      { id: '1518601425574297671', desc: 'Présente-toi à la communauté.' },
      { id: '1518603710782242816', desc: 'Échange ton code ami avec les autres dresseurs.' },
    ],
  },
  {
    title: '📖 Tout savoir sur le jeu',
    desc: 'Toutes les infos et infographies pour maîtriser Pokémon GO :',
    items: [
      { id: '1385589724315652238' },
      { id: '1385589012219297802' },
      { id: '1416012797258502144' },
      { id: '1385589578907516958' },
    ],
  },
  {
    title: '💡 Les petits tips',
    items: [
      { id: '1498327577247617156', desc: 'Les astuces du quotidien pour progresser plus vite.' },
    ],
  },
];

/** Render a group's channels: one line each with a description, inline list otherwise. */
function renderGroup(group) {
  const mentions = group.items.map((item) => `<#${item.id}>`);

  if (group.items.every((item) => !item.desc)) {
    const list = mentions.join(' • ');
    return group.desc ? `${group.desc}\n${list}` : list;
  }

  const lines = group.items.map((item, i) => (item.desc ? `${mentions[i]} — ${item.desc}` : mentions[i]));
  return group.desc ? [group.desc, ...lines].join('\n') : lines.join('\n');
}

/**
 * Resource channels embed: a guided tour of the important channels, meant to be
 * published in the info channel alongside the presentation and rules embeds.
 * @returns {EmbedBuilder}
 */
export function buildRessourcesEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('🧭 Les salons à connaître')
    .setDescription(
      [
        'Un petit tour du serveur pour trouver **ce qu’il te faut, là où il faut**.',
        'Clique sur un salon pour t’y rendre directement.',
      ].join('\n'),
    )
    .addFields(
      ...GROUPS.filter((group) => group.items.length > 0).map((group) => ({
        name: group.title,
        value: renderGroup(group),
      })),
    )
    .setFooter({ text: 'Perdu ? Demande dans les salons de discussion, on est là — Motisma’Pau' });
}
