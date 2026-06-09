import pg from 'pg';
import { config } from './config.js';

/**
 * PostgreSQL access for the web API. Shares the same database as the Discord
 * bot. If DATABASE_URL is missing, the pool stays null and the leaderboard runs
 * empty instead of crashing (handy for front-end-only development).
 */
export const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl }) : null;

export const hasDb = () => pool !== null;

/**
 * Create the tables this API owns. The bot owns `pogo_profiles` and `levels`;
 * we only add the in-game stats history here. All statements are idempotent, so
 * it is safe to run on every startup regardless of which process started first.
 */
export async function initSchema() {
  if (!pool) {
    console.warn('[db] No DATABASE_URL configured; leaderboard will be empty.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pogo_stats (
      id             BIGSERIAL PRIMARY KEY,
      discord_id     TEXT NOT NULL,
      level          INT,
      total_xp       BIGINT,
      team           TEXT,
      pokedex_caught INT,
      distance_km    NUMERIC,
      screenshot_url TEXT,
      status         TEXT NOT NULL DEFAULT 'pending',
      submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_by    TEXT,
      reviewed_at    TIMESTAMPTZ
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pogo_stats_board ON pogo_stats (status, total_xp DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pogo_stats_member ON pogo_stats (discord_id, submitted_at DESC);`);
  console.log('[db] Schema ready (pogo_stats).');
}

const teamOf = (t) => (['mystic', 'valor', 'instinct'].includes(t) ? t : null);

/** Leaderboard: latest APPROVED stat line per member, ranked by total in-game XP. */
export async function leaderboard(limit = 100) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (s.discord_id)
         s.discord_id, s.level, s.total_xp, s.team, s.submitted_at, p.ign
       FROM pogo_stats s
       LEFT JOIN pogo_profiles p ON p.discord_id = s.discord_id
       WHERE s.status = 'approved'
       ORDER BY s.discord_id, s.submitted_at DESC
     ) latest
     ORDER BY latest.total_xp DESC NULLS LAST, latest.level DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    discordId: r.discord_id,
    ign: r.ign,
    level: r.level,
    totalXp: r.total_xp === null ? null : Number(r.total_xp),
    team: r.team,
  }));
}

/** Insert a new (pending) stats submission. */
export async function submitStats(discordId, s) {
  if (!pool) throw new Error('Database unavailable');
  const { rows } = await pool.query(
    `INSERT INTO pogo_stats
       (discord_id, level, total_xp, team, pokedex_caught, distance_km, screenshot_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, status, submitted_at`,
    [
      discordId,
      s.level ?? null,
      s.totalXp ?? null,
      teamOf(s.team),
      s.pokedexCaught ?? null,
      s.distanceKm ?? null,
      s.screenshotUrl ?? null,
    ],
  );
  return rows[0];
}

/** A member's own submission history (any status). */
export async function mySubmissions(discordId, limit = 20) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT id, level, total_xp, team, status, submitted_at, reviewed_at
     FROM pogo_stats WHERE discord_id = $1
     ORDER BY submitted_at DESC LIMIT $2`,
    [discordId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    level: r.level,
    totalXp: r.total_xp === null ? null : Number(r.total_xp),
    team: r.team,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  }));
}

/** Pending submissions awaiting moderator review. */
export async function pendingStats(limit = 100) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT s.id, s.discord_id, s.level, s.total_xp, s.team, s.screenshot_url, s.submitted_at, p.ign
     FROM pogo_stats s
     LEFT JOIN pogo_profiles p ON p.discord_id = s.discord_id
     WHERE s.status = 'pending'
     ORDER BY s.submitted_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    discordId: r.discord_id,
    ign: r.ign,
    level: r.level,
    totalXp: r.total_xp === null ? null : Number(r.total_xp),
    team: r.team,
    screenshotUrl: r.screenshot_url,
    submittedAt: r.submitted_at,
  }));
}

/** Approve or reject a submission. status must be 'approved' or 'rejected'. */
export async function reviewStats(id, status, reviewerId) {
  if (!pool) throw new Error('Database unavailable');
  const next = status === 'approved' ? 'approved' : 'rejected';
  const { rowCount } = await pool.query(
    `UPDATE pogo_stats SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id, next, reviewerId],
  );
  return rowCount > 0;
}
