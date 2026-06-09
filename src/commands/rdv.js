import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { config } from '../config.js';
import { scheduleChannelDeletion } from '../features/rdvControls.js';

const PREFIX = '・';
const PARIS = 'Europe/Paris';

/** Turn free text into a channel-name-safe slug (lowercase, no accents). */
function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Time parsing (interpret the typed time as Europe/Paris wall-clock) ---
function partsInTz(epoch, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const o = {};
  for (const p of dtf.formatToParts(new Date(epoch))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

function wallClockToEpoch(y, mo, d, hh, mm, tz) {
  const naive = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const p = partsInTz(naive, tz);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - naive;
  return naive - offset;
}

/** Returns the event start epoch (next occurrence of the typed time in Paris). */
function eventStartEpoch(timeStr) {
  const m = timeStr.match(/(\d{1,2})(?:\s*[h:]\s*(\d{1,2}))?/i);
  if (!m) return Date.now() + 24 * 60 * 60 * 1000; // unparsable -> clean up in 24h
  const hh = Math.min(23, parseInt(m[1], 10));
  const mm = m[2] ? Math.min(59, parseInt(m[2], 10)) : 0;

  const now = Date.now();
  const today = partsInTz(now, PARIS);
  let epoch = wallClockToEpoch(today.year, today.month, today.day, hh, mm, PARIS);
  if (epoch <= now) {
    const tomorrow = partsInTz(now + 24 * 60 * 60 * 1000, PARIS);
    epoch = wallClockToEpoch(tomorrow.year, tomorrow.month, tomorrow.day, hh, mm, PARIS);
  }
  return epoch;
}

export const data = new SlashCommandBuilder()
  .setName('rdv')
  .setDescription('Créer un salon temporaire pour organiser une sortie.')
  .addStringOption((opt) =>
    opt.setName('place').setDescription('Où se déroule la sortie').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('time').setDescription('À quelle heure (ex. 15h)').setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('description')
      .setDescription('Petit mot sur la sortie (optionnel)')
      .setMaxLength(300),
  );

export async function execute(interaction) {
  const place = interaction.options.getString('place', true);
  const time = interaction.options.getString('time', true);
  const description = interaction.options.getString('description');

  await interaction.deferReply({ ephemeral: true });

  const deleteAt = eventStartEpoch(time) + 60 * 60 * 1000; // 1h after the meetup
  const c = partsInTz(deleteAt, PARIS);
  const pad = (n) => String(n).padStart(2, '0');
  const closeLabel = `${pad(c.day)}/${pad(c.month)} à ${pad(c.hour)}h${pad(c.minute)}`;

  const name = `${PREFIX}${[slug(place), slug(time)].filter(Boolean).join('-') || 'sortie'}`.slice(
    0,
    100,
  );

  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: config.rdvCategoryId || undefined,
    topic: `rdv-expire:${deleteAt}`,
    reason: `Sortie créée par ${interaction.user.tag}`,
  });

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('Nouvelle sortie')
    .setDescription(
      [
        description ? `${description}\n` : null,
        '-# Clique sur **Participer** pour t’inscrire ou te désinscrire.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields(
      { name: 'Lieu', value: place, inline: true },
      { name: 'Heure', value: time, inline: true },
      { name: 'Organisateur', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Inscrits (0)', value: 'Personne pour l’instant.', inline: false },
    )
    .setFooter({ text: `🕒 Fermeture automatique du salon le ${closeLabel}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rdv:panel')
      .setLabel('Participer')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({
    content: `${interaction.user} organise une sortie !`,
    embeds: [embed],
    components: [row],
  });
  await message.pin().catch(() => {});

  scheduleChannelDeletion(channel, deleteAt);

  // Announce the meetup in the dedicated channel with a link back to it.
  if (config.rdvAnnounceChannelId) {
    const announceChannel = await interaction.guild.channels
      .fetch(config.rdvAnnounceChannelId)
      .catch(() => null);

    if (announceChannel?.isTextBased()) {
      const announce = new EmbedBuilder()
        .setColor(0xffffff)
        .setTitle('📣 Une sortie est organisée !')
        .setDescription(
          [
            `${interaction.user} organise une sortie. Clique pour en savoir plus et t’inscrire 👇`,
            description ? `\n> ${description}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .addFields(
          { name: 'Lieu', value: place, inline: true },
          { name: 'Heure', value: time, inline: true },
        )
        .setFooter({ text: `🕒 Salon fermé automatiquement le ${closeLabel}` });

      const link = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(message.url)
          .setLabel('Voir la sortie')
          .setEmoji('➡️'),
      );

      await announceChannel.send({ embeds: [announce], components: [link] }).catch(() => {});
    }
  }

  await interaction.editReply(`Salon créé : ${channel}`);
}
