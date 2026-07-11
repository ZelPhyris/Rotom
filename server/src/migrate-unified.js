/**
 * One-shot migration: generate the unified Motisma schema (Neko-style) and seed
 * it from the current state.
 *
 *   1. Create `guilds` (per-server config) and `users` (per-member data) — DDL
 *      shared with the server's initSchema (see UNIFIED_DDL in db.js).
 *   2. Pre-fill the single `guilds` row from the bot's .env values.
 *   3. Copy existing `pogo_profiles` + `levels` into `users` (non-destructive:
 *      the old tables are left untouched so the bot keeps running unchanged).
 *
 * Run inside the api container:  docker compose exec api node src/migrate-unified.js
 *
 * Seeding is idempotent: existing rows are never overwritten (ON CONFLICT DO
 * NOTHING), so re-running it won't clobber edits made later from the dashboard.
 */
import { pool, UNIFIED_DDL } from './db.js';
import { config } from './config.js';

const env = (name) => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const intEnv = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
};

async function run() {
  if (!pool) {
    console.error('[migrate] No DATABASE_URL configured. Aborting.');
    process.exit(1);
  }
  const guildId = config.guildId;
  if (!guildId) {
    console.error('[migrate] GUILD_ID is missing. Aborting.');
    process.exit(1);
  }

  // 1. Schema.
  await pool.query(UNIFIED_DDL);
  console.log('[migrate] Schema ready (guilds, users).');

  // 2. Seed the guild config row from .env (only if absent — never clobber).
  const cfg = {
    name: 'POGO PAU',
    verification_role_id: env('VERIFICATION_ROLE_ID'),
    member_role_id: env('MEMBER_ROLE_ID'),
    verification_channel_id: env('VERIFICATION_CHANNEL_ID'),
    welcome_channel_id: env('WELCOME_CHANNEL_ID'),
    log_channel_id: env('LOG_CHANNEL_ID'),
    temp_voice_hub_id: env('TEMP_VOICE_HUB_ID'),
    temp_voice_category_id: env('TEMP_VOICE_CATEGORY_ID'),
    rdv_category_id: env('RDV_CATEGORY_ID'),
    rdv_announce_channel_id: env('RDV_ANNOUNCE_CHANNEL_ID'),
    levelup_channel_id: env('LEVELUP_CHANNEL_ID'),
    level_roles: env('LEVEL_ROLES'),
    team_role_mystic: env('TEAM_ROLE_MYSTIC'),
    team_role_valor: env('TEAM_ROLE_VALOR'),
    team_role_instinct: env('TEAM_ROLE_INSTINCT'),
    classement_role_id: env('CLASSEMENT_ROLE_ID'),
    classement_admin_channel_id: env('CLASSEMENT_ADMIN_CHANNEL_ID'),
    classement_reminder_day: intEnv('CLASSEMENT_REMINDER_DAY', 1),
    classement_reminder_hour: intEnv('CLASSEMENT_REMINDER_HOUR', 10),
    ambassador_role_id: env('AMBASSADOR_ROLE_ID'),
    forum_heart_channel_id: env('FORUM_HEART_CHANNEL_ID'),
    vision_model: env('VISION_MODEL') ?? 'gemini-2.5-flash',
    presence_text: env('PRESENCE_TEXT') ?? '/help • Pokémon GO Pau ⚡',
    presence_emoji: env('PRESENCE_EMOJI'),
    presence_game: env('PRESENCE_GAME'),
    presence_game_type: (env('PRESENCE_GAME_TYPE') ?? 'playing').toLowerCase(),
    presence_status: (env('PRESENCE_STATUS') ?? 'online').toLowerCase(),
    language_timeout_mild: intEnv('LANGUAGE_TIMEOUT_MILD', 10),
    language_timeout_strong: intEnv('LANGUAGE_TIMEOUT_STRONG', 30),
  };

  const cols = ['id', ...Object.keys(cfg)];
  const vals = [guildId, ...Object.values(cfg)];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const seed = await pool.query(
    `INSERT INTO guilds (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO NOTHING`,
    vals,
  );
  console.log(
    seed.rowCount > 0
      ? `[migrate] Guild ${guildId} seeded from .env.`
      : `[migrate] Guild ${guildId} already exists — left untouched.`,
  );

  // 3. Copy members from pogo_profiles (+ levels) into users.
  const fromProfiles = await pool.query(
    `INSERT INTO users (
       discord_id, guild_id, ign, friend_code, pogo_team, pogo_level,
       pogo_level_xp, pogo_level_xp_max, pogo_xp, pogo_pokedex, pogo_distance,
       pogo_pokestops, pogo_eggs, classement, stats_updated_at, xp, updated_at)
     SELECT p.discord_id, $1, p.ign, p.friend_code, p.pogo_team, p.pogo_level,
            p.pogo_level_xp, p.pogo_level_xp_max, p.pogo_xp, p.pogo_pokedex,
            p.pogo_distance, p.pogo_pokestops, p.pogo_eggs, p.classement,
            p.stats_updated_at, COALESCE(l.xp, 0), now()
       FROM pogo_profiles p
       LEFT JOIN levels l ON l.discord_id = p.discord_id
     ON CONFLICT (discord_id, guild_id) DO NOTHING`,
    [guildId],
  );

  // Members who chatted (levels) but have no PoGo profile.
  const fromLevels = await pool.query(
    `INSERT INTO users (discord_id, guild_id, xp, updated_at)
     SELECT l.discord_id, $1, l.xp, now()
       FROM levels l
      WHERE NOT EXISTS (SELECT 1 FROM pogo_profiles p WHERE p.discord_id = l.discord_id)
     ON CONFLICT (discord_id, guild_id) DO NOTHING`,
    [guildId],
  );

  const total = await pool.query('SELECT count(*)::int AS n FROM users WHERE guild_id = $1', [guildId]);
  console.log(
    `[migrate] Users migrated: ${fromProfiles.rowCount} from profiles, ` +
      `${fromLevels.rowCount} chat-only. Total users now: ${total.rows[0].n}.`,
  );

  await pool.end();
  console.log('[migrate] Done.');
}

run().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
