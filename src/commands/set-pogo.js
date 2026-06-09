import { SlashCommandBuilder } from 'discord.js';
import { hasDb, setPogoProfile } from '../db.js';

/** Format 12 digits as "XXXX XXXX XXXX". */
export function formatFriendCode(digits) {
  return digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
}

export const data = new SlashCommandBuilder()
  .setName('set-pogo')
  .setDescription('Enregistre ton nom de jeu et ton code ami Pokémon GO.')
  .addStringOption((opt) =>
    opt.setName('nom').setDescription('Ton nom de dresseur en jeu').setRequired(true).setMaxLength(64),
  )
  .addStringOption((opt) =>
    opt.setName('code').setDescription('Ton code ami (12 chiffres)').setRequired(true),
  );

export async function execute(interaction) {
  if (!hasDb()) {
    await interaction.reply({
      content: 'La base de données est indisponible pour le moment, réessaie plus tard.',
      ephemeral: true,
    });
    return;
  }

  const nom = interaction.options.getString('nom', true).trim();
  const rawCode = interaction.options.getString('code', true);
  const code = rawCode.replace(/[\s-]/g, '');

  if (!/^\d{12}$/.test(code)) {
    await interaction.reply({
      content: 'Code ami invalide : il doit contenir **exactement 12 chiffres** (ex. `1234 5678 9012`).',
      ephemeral: true,
    });
    return;
  }

  await setPogoProfile(interaction.user.id, nom, code);

  await interaction.reply({
    content: `Profil enregistré ✅\n**Nom :** ${nom}\n**Code ami :** \`${formatFriendCode(code)}\``,
    ephemeral: true,
  });
}
