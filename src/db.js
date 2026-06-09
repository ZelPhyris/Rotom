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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      discord_id TEXT PRIMARY KEY,
      xp         BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('[db] Connected and schema ready.');
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
