import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';

const BRAND = 0xffffff; // white

// Bot application emoji, used as the embed's brand mark. Custom emoji only
// render in an embed's description and field values — never in the title, a
// field name or the footer — so it opens the description rather than the title.
const PIN = '<:pushpin_1f4cc:1528857210187288689>';

// Trailing blank line spacing one category from the next. Discord strips
// trailing whitespace from a field, so the line carries a zero-width space to
// survive. Same convention as the resource channels embed.
const GAP = '\n​';

// Pokéball separating the Conseil 4 mentions on their single line. A custom
// emoji renders here because the mentions sit in a field value.
const MEMBER_SEP = ' <:pokeball:1529068808541831240> ';

// Between two adjacent ambassadors the Pokéball would sit between their two
// badges and crowd the line, so that pair gets a plain gap instead.
const AMB_SEP = ' ';

// Badge shown next to Conseil 4 members who are also ambassadors. Bot
// application emoji: a purple pentagon with a white star (generated, crisp).
const AMBASSADOR_EMOJI = '<:ambassadeur:1529095444817252505>';

/**
 * The members holding a role, on a single line. Ambassadors (members of
 * `badgeRoleId`) get `badge` prefixed. Members are separated by the Pokéball,
 * except between two ambassadors where a plain gap avoids a crowded
 * badge-Pokéball-badge run. Resolved live so the embed never lists someone who
 * has left the team.
 * @param {import('discord.js').Guild} guild
 * @param {string} roleId
 * @param {string} [badgeRoleId]  role earning an extra badge (e.g. ambassadors)
 * @param {string} [badge]        emoji prefixed to members holding badgeRoleId
 * @returns {Promise<string>}
 */
async function roleMembers(guild, roleId, badgeRoleId, badge) {
  if (!roleId) return 'À venir !';
  try {
    // Fetch members first: the role's member list is only populated for
    // members already in cache.
    await guild.members.fetch();
    const role = guild.roles.cache.get(roleId);
    if (!role) return 'À venir !';
    const members = [...role.members.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (!members.length) return 'À venir !';

    const isBadged = (m) => Boolean(badgeRoleId && badge && m.roles.cache.has(badgeRoleId));
    const label = (m) => (isBadged(m) ? `${badge} ${m}` : m.toString());

    let line = label(members[0]);
    for (let i = 1; i < members.length; i += 1) {
      line += (isBadged(members[i - 1]) && isBadged(members[i]) ? AMB_SEP : MEMBER_SEP) + label(members[i]);
    }
    return line;
  } catch {
    return 'Indisponible pour le moment.';
  }
}

/**
 * Server presentation embed: what the server is for, plus the live list of the
 * Conseil 4 — the role gathering the staff and the ambassadors.
 *
 * Headings are set in caps and stay emoji-free, matching the resource channels
 * embed the two are published next to.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<EmbedBuilder>}
 */
export async function buildPresentationEmbed(interaction) {
  const council = await roleMembers(
    interaction.guild,
    config.councilRoleId,
    config.ambassadorRoleId,
    AMBASSADOR_EMOJI,
  );

  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('Motisma’Pau — Communauté Pokémon GO de Pau')
    .setDescription(`${PIN} Bienvenue ! Ici se retrouvent les dresseurs de **Pau et ses environs** pour jouer ensemble.`)
    .addFields(
      {
        name: 'LE BUT DU SERVEUR',
        value:
          [
            'Rassembler la communauté Pokémon GO locale, **dans la bonne humeur et en toute sécurité** :',
            '• rencontrer les dresseurs de son quartier,',
            '• organiser facilement des **sorties et des raids**,',
            '• s’entraider (PvP, échanges, conseils),',
            '… sans jamais exposer d’adresse ou de position perso.',
          ].join('\n') + GAP,
      },
      {
        name: 'LE CONSEIL 4',
        value:
          'Le **staff et les ambassadeurs** du serveur : une équipe de passionnés qui **l’entretient au quotidien** ' +
          'pour garder une **ambiance agréable, conviviale et sûre** — animation, organisation des sorties, ' +
          `modération et coups de main.\n\n${council}` +
          GAP,
      },
      {
        name: 'UNE QUESTION ?',
        value:
          'Pose-la directement dans les **salons de discussion** : toute la communauté (et le Conseil 4) se fera un ' +
          'plaisir de t’aider. Pas besoin de MP !',
      },
    )
    .setFooter({ text: 'Bon jeu, et à bientôt sur le terrain — Motisma’Pau' });
}
