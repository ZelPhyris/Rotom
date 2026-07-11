import { config } from './config.js';
import { getGuildConfig } from './db.js';

/**
 * Hydrate the in-memory `config` from the dashboard's `guilds` row, falling back
 * to the .env values whenever the DB is unavailable or a field is empty. This is
 * what links the bot to the dashboard: admins edit the DB, the bot reads it.
 *
 * Safety: if there is no DB / no row / no value, the existing .env config stands.
 */

// DB column → config key (string/id fields).
const FIELD_MAP = {
  verification_role_id: 'verificationRoleId',
  member_role_id: 'memberRoleId',
  verification_channel_id: 'verificationChannelId',
  welcome_channel_id: 'welcomeChannelId',
  log_channel_id: 'logChannelId',
  temp_voice_hub_id: 'tempVoiceHubId',
  temp_voice_category_id: 'tempVoiceCategoryId',
  rdv_category_id: 'rdvCategoryId',
  rdv_announce_channel_id: 'rdvAnnounceChannelId',
  levelup_channel_id: 'levelupChannelId',
  ambassador_role_id: 'ambassadorRoleId',
  forum_heart_channel_id: 'forumHeartChannelId',
  vision_model: 'visionModel',
  classement_role_id: 'classementRoleId',
  classement_admin_channel_id: 'classementAdminChannelId',
  presence_text: 'presenceText',
  presence_emoji: 'presenceEmoji',
  presence_game: 'presenceGame',
  presence_game_type: 'presenceGameType',
  presence_status: 'presenceStatus',
};

const INT_MAP = {
  classement_reminder_day: 'classementReminderDay',
  classement_reminder_hour: 'classementReminderHour',
  language_timeout_mild: 'languageTimeoutMild',
  language_timeout_strong: 'languageTimeoutStrong',
};

const TEAM_MAP = {
  team_role_mystic: 'mystic',
  team_role_valor: 'valor',
  team_role_instinct: 'instinct',
};

// DB column → config key (boolean feature switches). Applied as-is (a real
// false from the DB must override a true default — unlike string/int fields).
const BOOL_MAP = {
  forum_heart_enabled: 'forumHeartEnabled',
};

const has = (v) => v !== null && v !== undefined && v !== '';

/**
 * Ensure the level reward roles exist (create them by name if missing) and set
 * `config.levelRoles` to the resolved [{ level, roleId }] list.
 * @param {import('discord.js').Client} client
 * @param {string} raw  JSON string: [{ "level": 10, "name": "..." }]
 */
async function resolveLevelRoles(client, raw) {
  if (!has(raw)) return;
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(list) || list.length === 0) return;

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  await guild.roles.fetch().catch(() => {});

  const resolved = [];
  for (const entry of list) {
    const level = Number(entry?.level);
    const name = String(entry?.name ?? '').trim();
    if (!Number.isInteger(level) || level <= 0 || !name) continue;

    let role = guild.roles.cache.find((r) => r.name === name);
    if (!role) {
      role = await guild.roles
        .create({ name, reason: `Rôle de niveau ${level} (dashboard)` })
        .catch((err) => {
          console.warn(`[config] Could not create role "${name}":`, err.message);
          return null;
        });
      if (role) console.log(`[config] Created level role "${name}" (level ${level}).`);
    }
    if (role) resolved.push({ level, roleId: role.id });
  }

  resolved.sort((a, b) => a.level - b.level);
  if (resolved.length) config.levelRoles = resolved;
}

/**
 * Parse the dashboard's auto-reaction rules into `config.autoReactions`.
 * Empty/invalid JSON keeps the .env fallback; an empty array disables them.
 * @param {string} raw  JSON: [{ "channelId": "...", "emojis": ["❤️", ...] }]
 */
function resolveAutoReactions(raw) {
  if (!has(raw)) return; // no DB value → keep the .env fallback
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  config.autoReactions = list
    .map((r) => ({
      channelId: String(r?.channelId ?? '').trim(),
      emojis: Array.isArray(r?.emojis) ? r.emojis.map((e) => String(e).trim()).filter(Boolean) : [],
    }))
    .filter((r) => r.channelId && r.emojis.length);
}

/**
 * Parse the dashboard's validator roles into `config.validatorRoleIds` (roles
 * allowed to validate/refuse newcomers, on top of "Manage Roles" admins). No DB
 * value keeps the .env fallback; an explicit empty array means "admins only".
 * @param {string} raw  JSON: ["roleId", ...]
 */
function resolveValidatorRoles(raw) {
  if (!has(raw)) return; // no DB value → keep the .env fallback (STAFF_ROLE_ID)
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  config.validatorRoleIds = list.map((id) => String(id).trim()).filter(Boolean);
}

/**
 * Load the guild config from the DB over the .env defaults. Safe to call
 * repeatedly (creates only missing roles).
 * @param {import('discord.js').Client} client
 */
export async function hydrateConfig(client) {
  const row = await getGuildConfig(config.guildId);
  if (!row) {
    console.log('[config] No DB config — using .env values.');
    return;
  }

  for (const [col, key] of Object.entries(FIELD_MAP)) {
    if (has(row[col])) config[key] = row[col];
  }
  for (const [col, key] of Object.entries(INT_MAP)) {
    if (row[col] !== null && row[col] !== undefined) config[key] = Number(row[col]);
  }
  for (const [col, team] of Object.entries(TEAM_MAP)) {
    if (has(row[col])) config.teamRoles[team] = row[col];
  }
  for (const [col, key] of Object.entries(BOOL_MAP)) {
    if (row[col] !== null && row[col] !== undefined) config[key] = Boolean(row[col]);
  }

  await resolveLevelRoles(client, row.level_roles);
  resolveAutoReactions(row.auto_reactions);
  resolveValidatorRoles(row.validator_role_ids);

  console.log(`[config] Hydrated from DB (guild ${config.guildId}).`);
}
