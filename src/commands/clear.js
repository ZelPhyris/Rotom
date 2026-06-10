import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Supprime des messages récents (modérateurs).')
  .addIntegerOption((opt) =>
    opt
      .setName('nombre')
      .setDescription('Nombre de messages à supprimer (1-100).')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true),
  )
  .addUserOption((opt) =>
    opt.setName('membre').setDescription('Ne supprimer que les messages de ce membre.'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  const count = interaction.options.getInteger('nombre', true);
  const member = interaction.options.getUser('membre');

  const me = interaction.guild.members.me;
  if (!me?.permissionsIn(interaction.channel).has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({
      content: 'Il me manque la permission **Gérer les messages** dans ce salon.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Fetch a window of recent messages. Filtered by author if a member is given;
  // we fetch up to 100 to find enough of theirs, then keep the requested count.
  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  let targets = [...fetched.values()];
  if (member) targets = targets.filter((m) => m.author.id === member.id);
  targets = targets.slice(0, count);

  if (!targets.length) {
    await interaction.editReply(
      member ? `Aucun message récent de ${member} à supprimer.` : 'Aucun message à supprimer.',
    );
    return;
  }

  // bulkDelete with filterOld=true silently skips messages older than 14 days
  // (Discord forbids bulk-deleting those).
  const deleted = await interaction.channel.bulkDelete(targets, true);

  const skipped = targets.length - deleted.size;
  const who = member ? ` de ${member}` : '';
  const note = skipped ? ` (${skipped} ignoré(s) car trop ancien(s) — +14 jours)` : '';
  await interaction.editReply(`🧹 ${deleted.size} message(s)${who} supprimé(s).${note}`);
}
