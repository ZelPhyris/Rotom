import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Registered globally (not guild-scoped) so it's also usable in the bot's DMs,
// where admins clean up after testing. See src/deploy-commands.js.
export const global = true;

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
    opt.setName('membre').setDescription('Ne supprimer que les messages de ce membre (serveur uniquement).'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(true);

// In a DM, Discord only lets a bot delete its OWN messages (and one by one —
// bulkDelete doesn't exist on DM channels). So /clear in DM wipes the bot's
// replies (stats embeds, errors…) but never the user's own uploads.
async function clearOwnDmMessages(interaction, count) {
  await interaction.deferReply();
  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  const mine = [...fetched.values()]
    .filter((m) => m.author.id === interaction.client.user.id)
    .slice(0, count);

  let deleted = 0;
  for (const m of mine) {
    try {
      await m.delete();
      deleted++;
    } catch {
      // Message already gone or too old — skip.
    }
  }

  await interaction.editReply(
    deleted
      ? `🧹 ${deleted} message(s) du bot supprimé(s). *(En MP je ne peux pas supprimer tes propres messages.)*`
      : 'Aucun message du bot à supprimer ici.',
  );
}

export async function execute(interaction) {
  const count = interaction.options.getInteger('nombre', true);

  if (!interaction.inGuild()) {
    await clearOwnDmMessages(interaction, count);
    return;
  }

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
