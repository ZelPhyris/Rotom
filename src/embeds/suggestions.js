import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

/**
 * Suggestions channel embed (invented copy: edit freely).
 * @returns {EmbedBuilder}
 */
export function buildSuggestionsEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('💡 Boîte à suggestions')
    .setDescription(
      [
        'Une idée pour améliorer le serveur ou la communauté ? C’est ici que ça se passe !',
        'Sorties, salons, événements, raids, entraide… tout est bon à proposer.',
      ].join('\n'),
    )
    .addFields(
      {
        name: 'Comment proposer',
        value:
          'Poste **une suggestion par message**, claire et concise. Explique en quelques lignes ton idée et ce qu’elle apporterait.',
      },
      {
        name: 'Le vote',
        value:
          'La communauté réagit avec 👍 ou 👎 pour soutenir (ou non) ton idée. Les plus populaires remontent naturellement.',
      },
      {
        name: 'Le suivi',
        value:
          'L’équipe passe régulièrement, étudie les suggestions les plus soutenues et te tient au courant. Une idée refusée n’est jamais perdue : elle peut revenir plus tard.',
      },
    )
    .setFooter({ text: 'Toutes les idées comptent — même les plus folles. À toi de jouer !' });
}
