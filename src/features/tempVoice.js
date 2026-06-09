import { ChannelType, Events, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';

/**
 * "Join to create" temporary voice channels:
 *  - Joining the hub channel spawns a personal voice channel named after the
 *    user, moves them into it, and grants them full control over it.
 *  - The channel is deleted as soon as it becomes empty.
 *
 * Needs the GuildVoiceStates intent (non-privileged). The bot needs the
 * "Manage Channels" and "Move Members" permissions.
 */
const HUB_ID = config.tempVoiceHubId;
const PREFIX = '・'; // marks our channels so orphans survive a restart

// Owner gets full control over their own channel.
const OWNER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.CreateInstantInvite,
];

// Channels created this session (deletion also covers restart orphans by name).
const tempChannels = new Set();

function isTempChannel(channel, hub) {
  if (!channel || channel.id === HUB_ID) return false;
  if (tempChannels.has(channel.id)) return true;
  return Boolean(hub) && channel.parentId === hub.parentId && channel.name.startsWith(PREFIX);
}

async function createForMember(state) {
  const { guild, member } = state;
  const hub = state.channel;

  let channel;
  try {
    channel = await guild.channels.create({
      name: `${PREFIX}${member.displayName}`,
      type: ChannelType.GuildVoice,
      parent: hub.parentId ?? undefined,
      reason: `Salon vocal temporaire de ${member.user.tag}`,
    });
  } catch (error) {
    console.error('[tempVoice] Failed to create the channel:', error);
    return;
  }

  tempChannels.add(channel.id);

  // Inherit the category's permissions, then grant the owner full control.
  try {
    if (channel.parentId) await channel.lockPermissions();
    await channel.permissionOverwrites.edit(
      member.id,
      Object.fromEntries(OWNER_PERMS.map((p) => [p, true])),
    );
  } catch (error) {
    console.error('[tempVoice] Failed to set owner permissions:', error);
  }

  // Move the member in. If they already left, clean up.
  try {
    await member.voice.setChannel(channel);
  } catch {
    if (channel.members.size === 0) {
      await channel.delete('Création annulée — membre parti').catch(() => {});
      tempChannels.delete(channel.id);
    }
  }
}

async function maybeDelete(channel) {
  if (!channel) return;
  if (channel.members.size > 0) return;
  try {
    await channel.delete('Salon vocal temporaire vide');
  } catch (error) {
    console.error('[tempVoice] Failed to delete the channel:', error);
  }
  tempChannels.delete(channel.id);
}

async function onVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild;
  const hub = guild.channels.cache.get(HUB_ID);

  // Joined the hub -> spawn a personal channel.
  if (newState.channelId === HUB_ID) {
    await createForMember(newState);
  }

  // Left a temp channel that is now empty -> delete it.
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const left = oldState.channel;
    if (isTempChannel(left, hub)) await maybeDelete(left);
  }
}

// On startup, sweep empty temp channels orphaned by a previous run.
function cleanupOrphans(client) {
  const guild = client.guilds.cache.get(config.guildId);
  const hub = guild?.channels.cache.get(HUB_ID);
  if (!hub) return;
  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type === ChannelType.GuildVoice &&
      channel.id !== HUB_ID &&
      channel.parentId === hub.parentId &&
      channel.name.startsWith(PREFIX) &&
      channel.members.size === 0
    ) {
      channel.delete('Nettoyage des salons temporaires orphelins').catch(() => {});
    }
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerTempVoice(client) {
  if (!HUB_ID) {
    console.warn('[tempVoice] No TEMP_VOICE_HUB_ID configured; feature disabled.');
    return;
  }
  client.once(Events.ClientReady, () => cleanupOrphans(client));
  client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
}
