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

/**
 * Parse "10:roleId,20:roleId,30:roleId" into a sorted [{ level, roleId }] list.
 */
function parseLevelRoles(raw) {
  return (raw || '')
    .split(',')
    .map((pair) => {
      const [level, roleId] = pair.split(':').map((s) => s.trim());
      return { level: Number(level), roleId };
    })
    .filter((r) => r.level > 0 && r.roleId)
    .sort((a, b) => a.level - b.level);
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
  // PostgreSQL connection string. Empty disables DB-backed features.
  databaseUrl: process.env.DATABASE_URL || '',
  // Google Gemini API key (free tier) for reading profile screenshots. Empty disables it.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Vision model used to extract the trainer name from a screenshot.
  visionModel: process.env.VISION_MODEL || 'gemini-2.5-flash',
  // Role whose members are listed as "ambassadeurs" in the presentation embed.
  ambassadorRoleId: process.env.AMBASSADOR_ROLE_ID || '1513457052226293796',
  // Optional: channel for level-up announcements (else the channel where it happened).
  levelupChannelId: process.env.LEVELUP_CHANNEL_ID || '',
  // Reward roles by level, e.g. LEVEL_ROLES="10:roleId,20:roleId,30:roleId".
  levelRoles: parseLevelRoles(process.env.LEVEL_ROLES),
  // Forum channel where the bot ❤️-reacts to posted images.
  forumHeartChannelId: process.env.FORUM_HEART_CHANNEL_ID || '1513801356509708489',
  // Custom status (the "bubble" line, no verb). Empty to disable.
  presenceText: process.env.PRESENCE_TEXT || '/help • Pokémon GO Pau ⚡',
  // Status emoji shown before the custom status. A unicode emoji ("🏃") or a
  // custom one as "name:id" (e.g. "roucoul:123456789012345678"). Empty for none.
  presenceEmoji: process.env.PRESENCE_EMOJI || '',
  // Rich-presence-style activity (the "Joue à …" line). Empty to disable.
  // NOTE: bots display only ONE activity and the custom status wins, so this is
  // off by default. The "Joue à" verb is mandatory and no image shows for bots.
  presenceGame: process.env.PRESENCE_GAME || '',
  // Verb for the activity above: playing | watching | listening | competing.
  presenceGameType: (process.env.PRESENCE_GAME_TYPE || 'playing').toLowerCase(),
  // Online state: online | idle | dnd | invisible.
  presenceStatus: (process.env.PRESENCE_STATUS || 'online').toLowerCase(),
  // --- Monthly PoGo classement ---
  // Optional role synced with classement participation (assigned on opt-in).
  // Empty = opt-in is tracked in the DB only (works without the role).
  classementRoleId: process.env.CLASSEMENT_ROLE_ID || '',
  // Day of the month (1-28) the reminder DM is sent. Default: 1st.
  classementReminderDay: Number(process.env.CLASSEMENT_REMINDER_DAY || 1),
  // Hour of day (0-23, server time) the reminder is sent. Default: 10h.
  classementReminderHour: Number(process.env.CLASSEMENT_REMINDER_HOUR || 10),
  // --- Language watch (timeouts in seconds; 0 disables the timeout) ---
  // Needs the bot to have "Moderate Members" and a role above the target.
  languageTimeoutMild: Number(process.env.LANGUAGE_TIMEOUT_MILD ?? 10),
  languageTimeoutStrong: Number(process.env.LANGUAGE_TIMEOUT_STRONG ?? 30),
};
