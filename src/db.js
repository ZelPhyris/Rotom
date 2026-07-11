import pg from 'pg';
import { config } from './config.js';

/**
 * PostgreSQL access layer. If DATABASE_URL is not set, the pool stays null and
 * DB-backed features degrade gracefully (commands report the DB as unavailable).
 */
export const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl }) : null;

export function hasDb() {
  return pool !== null;
}

/** Create the schema if needed. Safe to call on every startup. */
export async function initDb() {
  if (!pool) {
    console.warn('[db] No DATABASE_URL configured; Pokémon GO profiles are disabled.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pogo_profiles (
      discord_id  TEXT PRIMARY KEY,
      ign         TEXT,
      friend_code TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Classement columns (added incrementally; safe on existing tables).
  await pool.query(`
    ALTER TABLE pogo_profiles
      ADD COLUMN IF NOT EXISTS pogo_level        INT,
      ADD COLUMN IF NOT EXISTS pogo_level_xp     BIGINT,
      ADD COLUMN IF NOT EXISTS pogo_level_xp_max BIGINT,
      ADD COLUMN IF NOT EXISTS pogo_xp           BIGINT,
      ADD COLUMN IF NOT EXISTS pogo_pokedex      INT,
      ADD COLUMN IF NOT EXISTS pogo_distance     NUMERIC(10,1),
      ADD COLUMN IF NOT EXISTS pogo_pokestops    BIGINT,
      ADD COLUMN IF NOT EXISTS pogo_eggs         BIGINT,
      ADD COLUMN IF NOT EXISTS pogo_team         TEXT,
      ADD COLUMN IF NOT EXISTS classement        BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS stats_updated_at  TIMESTAMPTZ;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      discord_id TEXT PRIMARY KEY,
      xp         BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Generic key/value store (e.g. the year-month of the last monthly reminder).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  console.log('[db] Connected and schema ready.');
}

/**
 * Read the per-server config row written by the dashboard (`guilds` table,
 * owned by the web app). Returns null if the DB or table is unavailable, so the
 * caller can fall back to the .env config.
 */
export async function getGuildConfig(guildId) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query('SELECT * FROM guilds WHERE id = $1', [guildId]);
    return rows[0] ?? null;
  } catch {
    return null; // table missing (web app never ran) → fall back to .env
  }
}

/** Upsert a member's Pokémon GO profile. */
export async function setPogoProfile(discordId, ign, friendCode) {
  if (!pool) throw new Error('Database unavailable');
  await pool.query(
    `INSERT INTO pogo_profiles (discord_id, ign, friend_code, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (discord_id)
     DO UPDATE SET ign = EXCLUDED.ign, friend_code = EXCLUDED.friend_code, updated_at = now()`,
    [discordId, ign, friendCode],
  );
}

/** Upsert only the in-game name, preserving any existing friend code. */
export async function setPogoIgn(discordId, ign) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO pogo_profiles (discord_id, ign, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (discord_id)
     DO UPDATE SET ign = EXCLUDED.ign, updated_at = now()`,
    [discordId, ign],
  );
}

/** Upsert only the friend code, preserving any existing in-game name. */
export async function setPogoFriendCode(discordId, friendCode) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO pogo_profiles (discord_id, friend_code, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (discord_id)
     DO UPDATE SET friend_code = EXCLUDED.friend_code, updated_at = now()`,
    [discordId, friendCode],
  );
}

/**
 * @returns {Promise<{ ign: string, friend_code: string } | null>}
 */
export async function getPogoProfile(discordId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    'SELECT ign, friend_code FROM pogo_profiles WHERE discord_id = $1',
    [discordId],
  );
  return rows[0] ?? null;
}

/**
 * Upsert only the provided Pokémon GO stats, preserving any unspecified ones.
 * When a new level is read, its progress-bar pair (levelXp/levelXpMax) is stored
 * with it; when the level isn't on the screenshot, all three keep their values.
 * @param {string} discordId
 * @param {{ level?, levelXp?, levelXpMax?, xp?, pokedex?, distance?, pokestops?, team? }} stats
 */
export async function setPogoStats(
  discordId,
  { level = null, levelXp = null, levelXpMax = null, xp = null, pokedex = null, distance = null, pokestops = null, eggs = null, team = null },
) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO pogo_profiles
       (discord_id, pogo_level, pogo_level_xp, pogo_level_xp_max, pogo_xp, pogo_pokedex, pogo_distance, pogo_pokestops, pogo_eggs, pogo_team, stats_updated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
     ON CONFLICT (discord_id) DO UPDATE SET
       pogo_level        = COALESCE(EXCLUDED.pogo_level, pogo_profiles.pogo_level),
       pogo_level_xp     = COALESCE(EXCLUDED.pogo_level_xp, pogo_profiles.pogo_level_xp),
       pogo_level_xp_max = COALESCE(EXCLUDED.pogo_level_xp_max, pogo_profiles.pogo_level_xp_max),
       pogo_xp           = COALESCE(EXCLUDED.pogo_xp, pogo_profiles.pogo_xp),
       pogo_pokedex      = COALESCE(EXCLUDED.pogo_pokedex, pogo_profiles.pogo_pokedex),
       pogo_distance     = COALESCE(EXCLUDED.pogo_distance, pogo_profiles.pogo_distance),
       pogo_pokestops    = COALESCE(EXCLUDED.pogo_pokestops, pogo_profiles.pogo_pokestops),
       pogo_eggs         = COALESCE(EXCLUDED.pogo_eggs, pogo_profiles.pogo_eggs),
       pogo_team         = COALESCE(EXCLUDED.pogo_team, pogo_profiles.pogo_team),
       stats_updated_at  = now(),
       updated_at        = now()`,
    [discordId, level, levelXp, levelXpMax, xp, pokedex, distance, pokestops, eggs, team],
  );
}

/**
 * @returns {Promise<{ pogo_level, pogo_level_xp, pogo_level_xp_max, pogo_xp,
 *   pogo_pokedex, pogo_distance, pogo_pokestops, pogo_team } | null>}
 */
export async function getPogoStats(discordId) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT pogo_level, pogo_level_xp, pogo_level_xp_max, pogo_xp, pogo_pokedex, pogo_distance, pogo_pokestops, pogo_eggs, pogo_team
     FROM pogo_profiles WHERE discord_id = $1`,
    [discordId],
  );
  return rows[0] ?? null;
}

/** Wipe a member's classement stats (keeps their IGN, friend code and opt-in). */
export async function resetPogoStats(discordId) {
  if (!pool) return;
  await pool.query(
    `UPDATE pogo_profiles SET
       pogo_level = NULL, pogo_level_xp = NULL, pogo_level_xp_max = NULL,
       pogo_xp = NULL, pogo_pokedex = NULL, pogo_distance = NULL,
       pogo_pokestops = NULL, pogo_eggs = NULL, pogo_team = NULL, stats_updated_at = NULL,
       updated_at = now()
     WHERE discord_id = $1`,
    [discordId],
  );
}

/** Clear a member's saved in-game name and friend code (keeps stats/opt-in). */
export async function resetPogoProfile(discordId) {
  if (!pool) return;
  await pool.query(
    'UPDATE pogo_profiles SET ign = NULL, friend_code = NULL, updated_at = now() WHERE discord_id = $1',
    [discordId],
  );
}

/** Delete a member's whole Pokémon GO row (profile + stats + classement opt-in). */
export async function deletePogoProfile(discordId) {
  if (!pool) return;
  await pool.query('DELETE FROM pogo_profiles WHERE discord_id = $1', [discordId]);
}

/** Reset a member's messaging XP / level to zero. */
export async function resetXp(discordId) {
  if (!pool) return;
  await pool.query('DELETE FROM levels WHERE discord_id = $1', [discordId]);
}

/** Opt a member in/out of the monthly classement (also marks the row). */
export async function setClassementOptIn(discordId, optIn) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO pogo_profiles (discord_id, classement, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (discord_id) DO UPDATE SET classement = EXCLUDED.classement, updated_at = now()`,
    [discordId, optIn],
  );
}

/** Is this member opted into the classement? */
export async function isClassementParticipant(discordId) {
  if (!pool) return false;
  const { rows } = await pool.query(
    'SELECT classement FROM pogo_profiles WHERE discord_id = $1',
    [discordId],
  );
  return rows[0]?.classement === true;
}

/** Discord IDs of everyone opted into the classement. */
export async function classementParticipantIds() {
  if (!pool) return [];
  const { rows } = await pool.query('SELECT discord_id FROM pogo_profiles WHERE classement = TRUE');
  return rows.map((r) => r.discord_id);
}

/**
 * Top participants by a stat column, ignoring rows with no value for it.
 * @param {'pogo_level'|'pogo_xp'|'pogo_pokedex'|'pogo_distance'|'pogo_pokestops'} column
 * @returns {Promise<Array<{ discordId: string, value: number }>>}
 */
export async function topPogoStat(column, limit = 10) {
  if (!pool) return [];
  const allowed = { pogo_level: 1, pogo_xp: 1, pogo_pokedex: 1, pogo_distance: 1, pogo_pokestops: 1, pogo_eggs: 1 };
  if (!allowed[column]) throw new Error(`Invalid stat column: ${column}`);
  const { rows } = await pool.query(
    `SELECT discord_id, pogo_team, ${column} AS value
     FROM pogo_profiles
     WHERE classement = TRUE AND ${column} IS NOT NULL
     ORDER BY ${column} DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ discordId: r.discord_id, value: Number(r.value), team: r.pogo_team }));
}

/** Read a key from the generic store (null if absent). */
export async function getState(key) {
  if (!pool) return null;
  const { rows } = await pool.query('SELECT value FROM bot_kv WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

/** Upsert a key in the generic store. */
export async function setState(key, value) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO bot_kv (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

/** Add XP to a member and return their new total (null if no DB). */
export async function addXp(discordId, amount) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO levels (discord_id, xp, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (discord_id)
     DO UPDATE SET xp = levels.xp + $2, updated_at = now()
     RETURNING xp`,
    [discordId, amount],
  );
  return Number(rows[0].xp);
}

/** A member's total XP (0 if none). */
export async function getXp(discordId) {
  if (!pool) return 0;
  const { rows } = await pool.query('SELECT xp FROM levels WHERE discord_id = $1', [discordId]);
  return rows[0] ? Number(rows[0].xp) : 0;
}

/** Top members by XP. @returns {Promise<Array<{ discordId: string, xp: number }>>} */
export async function topXp(limit = 10) {
  if (!pool) return [];
  const { rows } = await pool.query(
    'SELECT discord_id, xp FROM levels ORDER BY xp DESC LIMIT $1',
    [limit],
  );
  return rows.map((r) => ({ discordId: r.discord_id, xp: Number(r.xp) }));
}
