import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from 'discord.js';
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

function getInscritIds(embed) {
  const field = embed?.fields?.find((f) => f.name.startsWith(INSCRITS_PREFIX));
  return field ? [...field.value.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]) : [];
}

function withInscrits(embed, ids) {
  const fields = embed.fields.map((f) =>
    f.name.startsWith(INSCRITS_PREFIX)
      ? {
          name: `${INSCRITS_PREFIX} (${ids.length})`,
          value: ids.length ? ids.map((id) => `<@${id}>`).join('\n') : 'Personne pour l’instant.',
          inline: false,
        }
      : { name: f.name, value: f.value, inline: f.inline },
  );
  return EmbedBuilder.from(embed).setFields(fields);
}

// Private panel: a single button that reflects the clicking user's state.
function panelRow(inscrit, msgId) {
  const button = inscrit
    ? new ButtonBuilder()
        .setCustomId(`rdv:leave:${msgId}`)
        .setLabel('Se désinscrire')
        .setEmoji('➖')
        .setStyle(ButtonStyle.Danger)
    : new ButtonBuilder()
        .setCustomId(`rdv:join:${msgId}`)
        .setLabel('S’inscrire')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(button);
}

const statusText = (inscrit) =>
  inscrit ? 'Tu es inscrit à cette sortie. ✅' : 'Tu n’es pas inscrit à cette sortie.';

// "Participer" on the public message -> open the private panel.
async function openPanel(interaction) {
  const inscrit = getInscritIds(interaction.message.embeds[0]).includes(interaction.user.id);
  await interaction.reply({
    ephemeral: true,
    content: statusText(inscrit),
    components: [panelRow(inscrit, interaction.message.id)],
  });
}

// Join / leave from the private panel -> update the public embed + the panel.
async function toggle(interaction) {
  const [, action, msgId] = interaction.customId.split(':');
  const message = await interaction.channel.messages.fetch(msgId).catch(() => null);

  if (!message || !message.embeds[0]) {
    await interaction.update({ content: 'Cette sortie n’existe plus.', components: [] });
    return;
  }

  const uid = interaction.user.id;
  let ids = getInscritIds(message.embeds[0]);
  ids = action === 'join' ? [...new Set([...ids, uid])] : ids.filter((id) => id !== uid);

  await message.edit({ embeds: [withInscrits(message.embeds[0], ids)] });

  const inscrit = action === 'join';
  await interaction.update({ content: statusText(inscrit), components: [panelRow(inscrit, msgId)] });
}

async function onButton(interaction) {
  if (!interaction.isButton()) return;
  const id = interaction.customId;
  if (id === 'rdv:panel') return openPanel(interaction);
  if (id.startsWith('rdv:join:') || id.startsWith('rdv:leave:')) return toggle(interaction);
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
