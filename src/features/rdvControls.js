import { EmbedBuilder, Events } from 'discord.js';
import { config } from '../config.js';

const MAX_DELAY = 2 ** 31 - 1; // setTimeout cap (~24.8 days)
const INSCRITS_PREFIX = 'Inscrits';

/**
 * Schedule a meetup channel to be deleted at `deleteAt` (epoch ms).
 * The process is long-lived (pm2); on restart, deletions are rescheduled
 * from each channel's topic marker `rdv-expire:<epoch>`.
 */
export function scheduleChannelDeletion(channel, deleteAt) {
  const delay = Math.max(0, Math.min(MAX_DELAY, deleteAt - Date.now()));
  setTimeout(() => {
    channel.delete('Sortie terminée (1h après l’heure prévue)').catch(() => {});
  }, delay);
}

// Toggle the clicking user in the "Inscrits" field of the meetup embed.
async function handleJoin(interaction) {
  const source = interaction.message.embeds[0];
  if (!source) {
    await interaction.deferUpdate();
    return;
  }

  const fields = source.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
  const idx = fields.findIndex((f) => f.name.startsWith(INSCRITS_PREFIX));
  let ids = idx !== -1 ? [...fields[idx].value.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]) : [];

  const uid = interaction.user.id;
  ids = ids.includes(uid) ? ids.filter((id) => id !== uid) : [...ids, uid];

  const field = {
    name: `${INSCRITS_PREFIX} (${ids.length})`,
    value: ids.length ? ids.map((id) => `<@${id}>`).join('\n') : 'Personne pour l’instant.',
    inline: false,
  };
  if (idx !== -1) fields[idx] = field;
  else fields.push(field);

  await interaction.update({ embeds: [EmbedBuilder.from(source).setFields(fields)] });
}

async function onButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'rdv:join') return;
  await handleJoin(interaction);
}

// On startup, reschedule deletions for meetup channels left by a previous run.
function rescheduleAll(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild || !config.rdvCategoryId) return;
  for (const channel of guild.channels.cache.values()) {
    if (channel.parentId !== config.rdvCategoryId) continue;
    const match = channel.topic?.match(/rdv-expire:(\d+)/);
    if (match) scheduleChannelDeletion(channel, Number(match[1]));
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerRdvControls(client) {
  client.once(Events.ClientReady, () => rescheduleAll(client));
  client.on(Events.InteractionCreate, onButton);
}
