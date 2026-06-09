import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';

const BRAND = 0xffffff; // white

/**
 * Server presentation embed: purpose of the server + live list of ambassadors
 * (members holding the ambassador role).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<EmbedBuilder>}
 */
export async function buildPresentationEmbed(interaction) {
  // Fetch members so the ambassador role's member list is populated.
  let ambassadors = '—';
  try {
    await interaction.guild.members.fetch();
    const role = interaction.guild.roles.cache.get(config.ambassadorRoleId);
    const mentions = role
      ? [...role.members.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((m) => m.toString())
      : [];
    if (mentions.length) ambassadors = mentions.join('\n');
    else ambassadors = 'À venir !';
  } catch {
    ambassadors = 'Indisponible pour le moment.';
  }

  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('📍 Motisma’Pau — Communauté Pokémon GO de Pau')
    .setDescription(
      'Bienvenue ! Ici se retrouvent les dresseurs de **Pau et ses environs** pour jouer ensemble.',
    )
    .addFields(
      {
        name: '🎯 Le but du serveur',
        value: [
          'Rassembler la communauté Pokémon GO locale, **dans la bonne humeur et en toute sécurité** :',
          '• voir qu’on n’est jamais seul à jouer dans son coin,',
          '• organiser facilement des **sorties et des raids**,',
          '• s’entraider (PvP, échanges, conseils),',
          '… sans jamais exposer d’adresse ou de position perso.',
        ].join('\n'),
      },
      {
        name: '🤝 Les ambassadeurs',
        value: `Tes points de contact : ils animent la communauté, organisent et répondent à tes questions.\n\n${ambassadors}`,
      },
    )
    .setFooter({ text: 'Bon jeu, et à bientôt sur le terrain — Motisma’Pau' });
}
