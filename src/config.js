import 'dotenv/config';

/**
 * Centralized, validated environment configuration.
 * Throws early with a clear message if a required variable is missing.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  // Optional: voice channel whose name mirrors the member count ("Membres : {nb}").
  memberCountChannelId: process.env.MEMBER_COUNT_CHANNEL_ID || '1513800614348455988',
  // "Pending" role assigned on join until a moderator validates the newcomer.
  verificationRoleId: process.env.VERIFICATION_ROLE_ID || '1513457052239003678',
  // Optional: restrict the verification flow to this channel (else any channel).
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID || '',
  // "Join to create" hub voice channel: joining it spawns a personal channel.
  tempVoiceHubId: process.env.TEMP_VOICE_HUB_ID || '1513457053677518974',
  // Category where /rdv creates its temporary meetup channels.
  rdvCategoryId: process.env.RDV_CATEGORY_ID || '1513457053270675500',
  // Channel where /rdv announces newly created meetups.
  rdvAnnounceChannelId: process.env.RDV_ANNOUNCE_CHANNEL_ID || '1513457052679409685',
  // Channel where a welcome message is posted once a newcomer is validated.
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || '1513457052679409689',
};
