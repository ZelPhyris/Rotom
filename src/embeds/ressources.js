import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

// Trailing blank line used to space one category from the next. Discord strips
// trailing whitespace from a field, so the line has to carry a zero-width space
// to survive.
const GAP = '\n​';

/**
 * The resource channels to highlight, grouped by theme and in display order.
 * Channels are referenced by ID: Discord renders "<#id>" with the channel's
 * current name, so renaming a channel never breaks this embed.
 *
 * Group titles are set in caps and stay emoji-free: the caps/lowercase contrast
 * carries the hierarchy on its own. Keep new groups consistent with that.
 *
 * An item without `desc` is rendered as a bare mention; a group whose items all
 * lack one is laid out as a compact inline list under the group's own `desc`.
 */
const GROUPS = [
  {
    title: 'L’ESSENTIEL',
    items: [
      { id: '1385590356837666866', desc: 'Les règles du serveur, à lire en premier.' },
      { id: '1424299961662570617', desc: 'Les annonces importantes à ne pas manquer.' },
      { id: '1518648908463739011', desc: 'Propose une sortie ou une idée pour améliorer le serveur.' },
    ],
  },
  {
    title: 'PARTAGE & COMMUNAUTÉ',
    items: [
      { id: '1518601425574297671', desc: 'Présente-toi à la communauté.' },
      { id: '1518603710782242816', desc: 'Échange ton code ami avec les autres dresseurs.' },
      { id: '1518602555083460748', desc: 'Tes plus belles prises : shiny, pépites, 100 %…' },
      { id: '1385575266482655405', desc: 'Discute de tout et n’importe quoi, pose tes questions.' },
    ],
  },
  {
    title: 'TOUT SAVOIR SUR LE JEU',
    desc: 'Toutes les infos et infographies pour maîtriser Pokémon GO :',
    items: [
      { id: '1385589724315652238' },
      { id: '1385589012219297802' },
      { id: '1416012797258502144' },
      { id: '1385589578907516958' },
    ],
  },
  {
    title: 'LES PETITS TIPS',
    items: [
      { id: '1498327577247617156', desc: 'Les astuces du quotidien pour progresser plus vite.' },
    ],
  },
];

/** Render a group's channels: one line each with a description, inline list otherwise. */
function renderGroup(group) {
  if (group.items.every((item) => !item.desc)) {
    const list = group.items.map((item) => `<#${item.id}>`).join(' • ');
    return group.desc ? `${group.desc}\n${list}` : list;
  }

  const lines = group.items.map((item) => (item.desc ? `<#${item.id}> — ${item.desc}` : `<#${item.id}>`));
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
    .setTitle('Les salons à connaître')
    .setDescription(
      [
        'Un petit tour du serveur pour trouver **ce qu’il te faut, là où il faut**.',
        'Clique sur un salon pour t’y rendre directement.',
      ].join('\n'),
    )
    .addFields(
      // A blank line closes every group but the last, so the categories stand
      // apart without loosening the lines inside them. Discord strips trailing
      // whitespace, hence the zero-width space that actually holds the gap.
      ...GROUPS.map((group, i) => ({
        name: group.title,
        value: renderGroup(group) + (i < GROUPS.length - 1 ? GAP : ''),
      })),
    )
    .setFooter({ text: 'Perdu ? Demande dans les salons de discussion, on est là — Motisma’Pau' });
}
