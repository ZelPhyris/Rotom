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

/** Parse a comma/space separated list of Discord IDs into a clean array. */
function parseIdList(raw) {
  return (raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  // "Pending" role assigned on join until a moderator validates the newcomer.
  verificationRoleId: process.env.VERIFICATION_ROLE_ID || '',
  // Member role ("Dresseur") granted once a newcomer is validated. Empty = none.
  memberRoleId: process.env.MEMBER_ROLE_ID || '',
  // Optional: restrict the verification flow to this channel (else any channel).
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID || '',
  // Role allowed to validate/refuse newcomers without the "Manage Roles" Discord
  // permission (e.g. a "Staff" role, on par with Admin/Ambassadeur). Empty = none.
  // Legacy single-role env; kept as the default seed for `validatorRoleIds`.
  staffRoleId: process.env.STAFF_ROLE_ID || '',
  // Roles allowed to validate/refuse newcomers (besides "Manage Roles" admins).
  // Editable from the dashboard (guilds.validator_role_ids). Defaults to the
  // legacy STAFF_ROLE_ID so the current staff role keeps working out of the box.
  validatorRoleIds:
    parseIdList(process.env.VALIDATOR_ROLE_IDS).length > 0
      ? parseIdList(process.env.VALIDATOR_ROLE_IDS)
      : parseIdList(process.env.STAFF_ROLE_ID),
  // "Join to create" hub voice channel: joining it spawns a personal channel.
  tempVoiceHubId: process.env.TEMP_VOICE_HUB_ID || '',
  // Category where temp voice channels are created. Empty = same category as the hub.
  tempVoiceCategoryId: process.env.TEMP_VOICE_CATEGORY_ID || '',
  // Category where /rdv creates its temporary meetup channels.
  rdvCategoryId: process.env.RDV_CATEGORY_ID || '',
  // Channel where /rdv announces newly created meetups.
  rdvAnnounceChannelId: process.env.RDV_ANNOUNCE_CHANNEL_ID || '',
  // Channel where a welcome message is posted once a newcomer is validated.
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || '',
  // Staff log channel for audit embeds (e.g. who validated whom). Empty = no log.
  logChannelId: process.env.LOG_CHANNEL_ID || '',
  // PostgreSQL connection string. Empty disables DB-backed features.
  databaseUrl: process.env.DATABASE_URL || '',
  // Google Gemini API key (free tier) for reading profile screenshots. Empty disables it.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Vision model used to extract the trainer name from a screenshot.
  visionModel: process.env.VISION_MODEL || 'gemini-2.5-flash',
  // Role whose members are listed as "ambassadeurs" in the presentation embed.
  ambassadorRoleId: process.env.AMBASSADOR_ROLE_ID || '',
  // Optional: channel for level-up announcements (else the channel where it happened).
  levelupChannelId: process.env.LEVELUP_CHANNEL_ID || '',
  // Reward roles by level, e.g. LEVEL_ROLES="10:roleId,20:roleId,30:roleId".
  levelRoles: parseLevelRoles(process.env.LEVEL_ROLES),
  // Forum channel where the bot ❤️-reacts to posted images (legacy single rule).
  forumHeartChannelId: process.env.FORUM_HEART_CHANNEL_ID || '',
  // Master switch for the auto-reactions. Disabled only when explicitly "false".
  forumHeartEnabled: (process.env.FORUM_HEART_ENABLED || 'true').toLowerCase() !== 'false',
  // Auto-reaction rules: [{ channelId, emojis:[...] }]. Built from the legacy
  // single ❤️ channel by default; the dashboard can define richer rules (DB).
  autoReactions: process.env.FORUM_HEART_CHANNEL_ID
    ? [{ channelId: process.env.FORUM_HEART_CHANNEL_ID, emojis: ['❤️'] }]
    : [],
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
  // --- Pokémon GO team roles (detected from the level/XP colour on screenshots) ---
  // Assigned automatically (and kept exclusive) on verification or stats update.
  // Empty = no auto role for that team.
  teamRoles: {
    mystic: process.env.TEAM_ROLE_MYSTIC || '', // Sagesse (bleu)
    valor: process.env.TEAM_ROLE_VALOR || '', // Bravoure (rouge)
    instinct: process.env.TEAM_ROLE_INSTINCT || '', // Intuition (jaune)
  },
  // --- Monthly PoGo classement ---
  // Role synced with classement participation (assigned on opt-in / via the
  // participation embed button). Empty = opt-in is tracked in the DB only.
  classementRoleId: process.env.CLASSEMENT_ROLE_ID || '',
  // Channel where the bot alerts the staff about a suspicious (edited / regressing)
  // classement screenshot. Empty = no alert is posted (only logged to console).
  classementAdminChannelId: process.env.CLASSEMENT_ADMIN_CHANNEL_ID || '',
  // Day of the month (1-28) the reminder DM is sent. Default: 1st.
  classementReminderDay: Number(process.env.CLASSEMENT_REMINDER_DAY || 1),
  // Hour of day (0-23, server time) the reminder is sent. Default: 10h.
  classementReminderHour: Number(process.env.CLASSEMENT_REMINDER_HOUR || 10),
  // --- Language watch (timeouts in seconds; 0 disables the timeout) ---
  // Needs the bot to have "Moderate Members" and a role above the target.
  languageTimeoutMild: Number(process.env.LANGUAGE_TIMEOUT_MILD ?? 10),
  languageTimeoutStrong: Number(process.env.LANGUAGE_TIMEOUT_STRONG ?? 30),
};
