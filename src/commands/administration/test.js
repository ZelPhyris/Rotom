import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from '../../config.js';
import { sendWelcome } from '../../features/welcome.js';

/**
 * Admin-only test helpers to walk through the newcomer flow without needing a
 * real user to join.
 *   /test arrivee  [membre] — assign the pending role (simulates a join)
 *   /test bienvenue [membre] — preview a random welcome message
 *   /test reset    [membre] — remove the pending role (cleanup)
 */
export const data = new SlashCommandBuilder()
  .setName('test')
  .setDescription('Commandes de test (admin) pour simuler le parcours d’arrivée.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('arrivee')
      .setDescription('Simule une arrivée : attribue le rôle en attente.')
      .addUserOption((o) => o.setName('membre').setDescription('Cible (par défaut toi-même)')),
  )
  .addSubcommand((s) =>
    s
      .setName('bienvenue')
      .setDescription('Affiche un message de bienvenue de test.')
      .addUserOption((o) => o.setName('membre').setDescription('Cible (par défaut toi-même)')),
  )
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription('Retire le rôle en attente (nettoyage).')
      .addUserOption((o) => o.setName('membre').setDescription('Cible (par défaut toi-même)')),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser('membre') ?? interaction.user;
  const member = await interaction.guild.members.fetch(user.id);

  if (sub === 'arrivee') {
    await member.roles.add(config.verificationRoleId, 'Test : simulation d’arrivée');
    await interaction.reply({
      content: `Rôle en attente attribué à ${member}. Poste une capture dans le salon de vérification pour tester la suite.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'bienvenue') {
    await sendWelcome(interaction.guild, member);
    await interaction.reply({
      content: `Message de bienvenue de test envoyé pour ${member}.`,
      ephemeral: true,
    });
    return;
  }

  // reset
  await member.roles.remove(config.verificationRoleId, 'Test : nettoyage');
  await interaction.reply({ content: `Rôle en attente retiré de ${member}.`, ephemeral: true });
}
