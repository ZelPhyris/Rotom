import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { sectors } from '../config/sectors.js';
import { getPogoProfile, getXp } from '../db.js';
import { formatFriendCode } from './set-pogo.js';
import { levelFromXp } from '../features/leveling.js';

/** Render the user's avatar clipped to a circle, on a transparent background. */
async function roundAvatar(user) {
  const size = 256;
  const res = await fetch(user.displayAvatarURL({ extension: 'png', size }));
  const img = await loadImage(Buffer.from(await res.arrayBuffer()));

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, size, size);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'avatar.png' });
}

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Affiche le profil d’un membre.')
  .addUserOption((opt) =>
    opt.setName('membre').setDescription('Le membre à afficher (par défaut toi-même)'),
  );

export async function execute(interaction) {
  const user = interaction.options.getUser('membre') ?? interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  const createdSec = Math.floor(user.createdTimestamp / 1000);

  const memberSectors = member
    ? sectors.filter((s) => s.roleId && member.roles.cache.has(s.roleId)).map((s) => s.name)
    : [];
  const sectorValue = memberSectors.length ? memberSectors.join(', ') : 'Non renseigné';

  const pogo = await getPogoProfile(user.id).catch(() => null);
  const xp = await getXp(user.id).catch(() => 0);

  // Build the round avatar (fall back to the plain square avatar if it fails).
  let files = [];
  let thumbnail = user.displayAvatarURL({ size: 256 });
  try {
    const attachment = await roundAvatar(user);
    files = [attachment];
    thumbnail = 'attachment://avatar.png';
  } catch {
    /* keep the square fallback */
  }

  const joined = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  // Row 1 = trainer identity, row 2 = sector + dates.
  const fields = [
    { name: 'Pseudo serveur', value: member?.displayName ?? user.username, inline: true },
  ];
  if (pogo) {
    fields.push(
      { name: 'Nom Pokémon GO', value: pogo.ign || 'Non renseigné', inline: true },
      {
        name: 'Code ami',
        value: pogo.friend_code ? `\`${formatFriendCode(pogo.friend_code)}\`` : 'Non renseigné',
        inline: true,
      },
    );
  }
  fields.push(
    { name: 'Secteur', value: sectorValue, inline: true },
    { name: 'Niveau', value: `${levelFromXp(xp)} (${xp} XP)`, inline: true },
    { name: 'Compte créé', value: `<t:${createdSec}:D>\n<t:${createdSec}:R>`, inline: true },
    {
      name: 'Arrivée sur le serveur',
      value: joined ? `<t:${joined}:D>\n<t:${joined}:R>` : '—',
      inline: true,
    },
  );

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setThumbnail(thumbnail)
    .addFields(fields)
    .setFooter({ text: `ID : ${user.id}${user.bot ? ' • 🤖 Compte bot' : ''}` });

  await interaction.reply({ embeds: [embed], files, ephemeral: true });
}
