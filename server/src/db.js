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
 * Unified Motisma schema (Neko-style): `guilds` = per-server config (one row),
 * `users` = per-member data. Created here so the site can read/write them; the
 * one-shot `migrate-unified.js` seeds them from .env + the legacy tables.
 */
export const UNIFIED_DDL = `
  CREATE TABLE IF NOT EXISTS guilds (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    verification_role_id     TEXT,
    member_role_id           TEXT,
    verification_channel_id  TEXT,
    validator_role_ids       TEXT,
    welcome_channel_id       TEXT,
    log_channel_id           TEXT,
    temp_voice_hub_id        TEXT,
    temp_voice_category_id   TEXT,
    rdv_category_id          TEXT,
    rdv_announce_channel_id  TEXT,
    levelup_channel_id       TEXT,
    level_roles              TEXT,
    team_role_mystic         TEXT,
    team_role_valor          TEXT,
    team_role_instinct       TEXT,
    classement_role_id           TEXT,
    classement_admin_channel_id  TEXT,
    classement_reminder_day      INT  NOT NULL DEFAULT 1,
    classement_reminder_hour     INT  NOT NULL DEFAULT 10,
    ambassador_role_id       TEXT,
    forum_heart_channel_id   TEXT,
    forum_heart_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    auto_reactions           TEXT,
    vision_model             TEXT,
    presence_text            TEXT,
    presence_emoji           TEXT,
    presence_game            TEXT,
    presence_game_type       TEXT NOT NULL DEFAULT 'playing',
    presence_status          TEXT NOT NULL DEFAULT 'online',
    language_timeout_mild    INT NOT NULL DEFAULT 10,
    language_timeout_strong  INT NOT NULL DEFAULT 30,

    -- LOGS (per-type toggles + embed colour)
    logs_verification BOOLEAN NOT NULL DEFAULT TRUE,
    logs_joins        BOOLEAN NOT NULL DEFAULT FALSE,
    logs_leaves       BOOLEAN NOT NULL DEFAULT FALSE,
    logs_messages     BOOLEAN NOT NULL DEFAULT FALSE,
    logs_moderation   BOOLEAN NOT NULL DEFAULT FALSE,
    logs_roles        BOOLEAN NOT NULL DEFAULT FALSE,
    logs_channels     BOOLEAN NOT NULL DEFAULT FALSE,
    logs_voice        BOOLEAN NOT NULL DEFAULT FALSE,
    logs_boosts       BOOLEAN NOT NULL DEFAULT FALSE,
    log_embed_color   TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id  TEXT NOT NULL,
    guild_id    TEXT NOT NULL,
    username    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    level       INT    NOT NULL DEFAULT 0,
    xp          BIGINT NOT NULL DEFAULT 0,
    rank        TEXT,
    ign               TEXT,
    friend_code       TEXT,
    pogo_team         TEXT,
    pogo_level        INT,
    pogo_level_xp     BIGINT,
    pogo_level_xp_max BIGINT,
    pogo_xp           BIGINT,
    pogo_pokedex      INT,
    pogo_distance     NUMERIC(10,1),
    pogo_pokestops    BIGINT,
    pogo_eggs         BIGINT,
    classement        BOOLEAN NOT NULL DEFAULT FALSE,
    stats_updated_at  TIMESTAMPTZ,
    in_guild    BOOLEAN NOT NULL DEFAULT TRUE,
    left_at     TIMESTAMPTZ,
    UNIQUE (discord_id, guild_id)
  );
  CREATE INDEX IF NOT EXISTS users_guild ON users (guild_id);
  CREATE INDEX IF NOT EXISTS users_discord ON users (discord_id);

  CREATE TABLE IF NOT EXISTS bot_messages (
    guild_id          TEXT NOT NULL,
    key               TEXT NOT NULL,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    content           TEXT,
    embed_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    embed_title       TEXT,
    embed_description TEXT,
    embed_color       TEXT,
    embed_image       TEXT,
    embed_thumbnail   TEXT,
    embed_footer      TEXT,
    ephemeral         BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, key)
  );
`;

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
  // Unified config/member schema (idempotent — safe alongside the legacy tables).
  await pool.query(UNIFIED_DDL);
  // Incremental columns added after first deploy (safe on existing tables).
  await pool.query(`
    ALTER TABLE guilds
      ADD COLUMN IF NOT EXISTS logs_verification BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS logs_joins      BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_leaves     BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_messages   BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_moderation BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_roles      BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_channels   BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_voice      BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS logs_boosts     BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS log_embed_color TEXT,
      ADD COLUMN IF NOT EXISTS forum_heart_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS auto_reactions TEXT,
      ADD COLUMN IF NOT EXISTS validator_role_ids TEXT;
  `);
  // Seed the new reaction rules from the legacy single ❤️ channel, once.
  await pool.query(`
    UPDATE guilds
       SET auto_reactions = json_build_array(
             json_build_object('channelId', forum_heart_channel_id, 'emojis', json_build_array('❤️'))
           )::text
     WHERE (auto_reactions IS NULL OR auto_reactions = '')
       AND forum_heart_channel_id IS NOT NULL AND forum_heart_channel_id <> '';
  `);
  // Seed the validator roles (who may validate/refuse newcomers) from the legacy
  // single STAFF_ROLE_ID env, once — so the dashboard starts pre-filled with the
  // role that can currently validate instead of an empty picker.
  const staffRoleId = (process.env.STAFF_ROLE_ID || '').trim();
  if (staffRoleId) {
    await pool.query(
      `UPDATE guilds
          SET validator_role_ids = to_json(ARRAY[$1]::text[])::text
        WHERE validator_role_ids IS NULL OR validator_role_ids = ''`,
      [staffRoleId],
    );
  }
  // Community events: snapshots of Discord scheduled events, kept so completed
  // events (which Discord drops from its API) can still be shown as past.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_events (
      id          TEXT PRIMARY KEY,
      guild_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      location    TEXT,
      cover_url   TEXT,
      start_time  TIMESTAMPTZ,
      end_time    TIMESTAMPTZ,
      status      INT,
      user_count  INT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS guild_events_time ON guild_events (guild_id, start_time DESC);`);
  console.log('[db] Schema ready (pogo_stats, guilds, users, guild_events).');
}

/**
 * Reconcile the local snapshot with the live scheduled/active events from
 * Discord: upsert everything currently listed, then any event we still hold as
 * scheduled/active that Discord no longer lists is marked completed (if its time
 * has passed) or canceled (still upcoming → removed by an organizer).
 * @param {string} guildId
 * @param {Array}  events  normalized events from fetchGuildScheduledEvents
 */
export async function syncGuildEvents(guildId, events) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of events) {
      await client.query(
        `INSERT INTO guild_events
           (id, guild_id, name, description, location, cover_url, start_time, end_time, status, user_count, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           location = EXCLUDED.location,
           cover_url = EXCLUDED.cover_url,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           status = EXCLUDED.status,
           user_count = EXCLUDED.user_count,
           updated_at = now()`,
        [e.id, guildId, e.name, e.description, e.location, e.coverUrl, e.startTime, e.endTime, e.status, e.userCount],
      );
    }
    const liveIds = events.map((e) => e.id);
    await client.query(
      `UPDATE guild_events
          SET status = CASE
                WHEN COALESCE(end_time, start_time) <= now() THEN 3  -- completed
                ELSE 4                                                -- removed/canceled
              END,
              updated_at = now()
        WHERE guild_id = $1
          AND status IN (1, 2)
          AND NOT (id = ANY($2::text[]))`,
      [guildId, liveIds],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Events for the public site: non-canceled events split by time into upcoming,
 * active and (recent) past. Past is capped to the 12 most recent.
 * @param {string} guildId
 */
export async function getSiteEvents(guildId) {
  if (!pool) return { upcoming: [], active: [], past: [] };
  const { rows } = await pool.query(
    `SELECT id, name, description, location, cover_url, start_time, end_time, status, user_count
       FROM guild_events
      WHERE guild_id = $1 AND status <> 4
      ORDER BY start_time ASC`,
    [guildId],
  );
  const now = Date.now();
  const map = (r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    location: r.location,
    coverUrl: r.cover_url,
    startTime: r.start_time,
    endTime: r.end_time,
    userCount: r.user_count,
    url: `https://discord.com/events/${guildId}/${r.id}`,
  });
  const upcoming = [];
  const active = [];
  const past = [];
  for (const r of rows) {
    const start = r.start_time ? new Date(r.start_time).getTime() : 0;
    const end = r.end_time ? new Date(r.end_time).getTime() : null;
    const ev = map(r);
    if (start > now) upcoming.push(ev);
    else if ((end && end > now) || (!end && r.status === 2)) active.push(ev);
    else past.push(ev);
  }
  past.reverse(); // most recent first
  return { upcoming, active, past: past.slice(0, 12) };
}

const teamOf = (t) => (['mystic', 'valor', 'instinct'].includes(t) ? t : null);

/**
 * Leaderboard: every member opted into the classement, with the in-game stats
 * the bot records from their profile screenshots (stored on pogo_profiles).
 * Ranking is done per category on the client, so we just return the raw numbers
 * (and let each board sort/filter on the field it cares about).
 */
export async function leaderboard(limit = 200) {
  if (!pool) return [];
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const { rows } = await pool.query(
    `SELECT discord_id, ign, pogo_team, pogo_level, pogo_xp, pogo_pokedex, pogo_distance, pogo_pokestops
       FROM pogo_profiles
      WHERE classement = TRUE
      ORDER BY pogo_xp DESC NULLS LAST`,
  );
  return rows.slice(0, limit).map((r) => ({
    discordId: r.discord_id,
    ign: r.ign,
    team: r.pogo_team,
    level: r.pogo_level,
    totalXp: num(r.pogo_xp),
    pokedex: r.pogo_pokedex,
    distance: num(r.pogo_distance),
    pokestops: num(r.pogo_pokestops),
  }));
}

/** The caller's own in-game profile (stats the bot recorded, on pogo_profiles). */
export async function profileStats(discordId) {
  if (!pool) return null;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const { rows } = await pool.query(
    `SELECT ign, pogo_team, pogo_level, pogo_xp, pogo_pokedex, pogo_distance, pogo_pokestops,
            classement, stats_updated_at
       FROM pogo_profiles WHERE discord_id = $1`,
    [discordId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ign: r.ign,
    team: r.pogo_team,
    level: r.pogo_level,
    totalXp: num(r.pogo_xp),
    pokedex: r.pogo_pokedex,
    distance: num(r.pogo_distance),
    pokestops: num(r.pogo_pokestops),
    classement: r.classement === true,
    updatedAt: r.stats_updated_at,
  };
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

// ---------------------------------------------------------------------------
// Admin dashboard — server config (`guilds`) and member moderation.
//
// NOTE: member edits write the bot's LIVE tables (pogo_profiles / levels) so the
// site leaderboard reflects them immediately. The `guilds` config is persisted
// but only changes bot behaviour once the bot is rewired to read it (handoff).
// ---------------------------------------------------------------------------

/** Editable `guilds` columns, with the coercion to apply. */
const GUILD_FIELDS = {
  name: 'text',
  verification_role_id: 'id',
  member_role_id: 'id',
  verification_channel_id: 'id',
  validator_role_ids: 'text',
  welcome_channel_id: 'id',
  log_channel_id: 'id',
  temp_voice_hub_id: 'id',
  temp_voice_category_id: 'id',
  rdv_category_id: 'id',
  rdv_announce_channel_id: 'id',
  levelup_channel_id: 'id',
  level_roles: 'text',
  team_role_mystic: 'id',
  team_role_valor: 'id',
  team_role_instinct: 'id',
  classement_role_id: 'id',
  classement_admin_channel_id: 'id',
  classement_reminder_day: 'int',
  classement_reminder_hour: 'int',
  ambassador_role_id: 'id',
  forum_heart_channel_id: 'id',
  forum_heart_enabled: 'bool',
  auto_reactions: 'text',
  vision_model: 'text',
  presence_text: 'text',
  presence_emoji: 'text',
  presence_game: 'text',
  presence_game_type: 'text',
  presence_status: 'text',
  language_timeout_mild: 'int',
  language_timeout_strong: 'int',
  logs_verification: 'bool',
  logs_joins: 'bool',
  logs_leaves: 'bool',
  logs_messages: 'bool',
  logs_moderation: 'bool',
  logs_roles: 'bool',
  logs_channels: 'bool',
  logs_voice: 'bool',
  logs_boosts: 'bool',
};

/** The single guild config row (or null). */
export async function getGuildConfig(guildId) {
  if (!pool) return null;
  const { rows } = await pool.query('SELECT * FROM guilds WHERE id = $1', [guildId]);
  return rows[0] ?? null;
}

/** Update editable columns of the guild config row. Unknown keys are ignored. */
export async function updateGuildConfig(guildId, data) {
  if (!pool) throw new Error('Database unavailable');
  const sets = [];
  const vals = [];
  for (const [key, type] of Object.entries(GUILD_FIELDS)) {
    if (!(key in data)) continue;
    let v = data[key];
    if (type === 'bool') {
      v = Boolean(v);
    } else if (type === 'int') {
      const n = Number(v);
      v = Number.isFinite(n) ? Math.trunc(n) : null;
    } else {
      // text / id: trim, empty → null (except free text we still null-out when blank)
      v = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    }
    vals.push(v);
    sets.push(`${key} = $${vals.length}`);
  }
  if (!sets.length) return false;
  vals.push(guildId);
  const { rowCount } = await pool.query(
    `UPDATE guilds SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
    vals,
  );
  return rowCount > 0;
}

/** Members for the moderation table (profile + chat XP), ranked by in-game XP. */
export async function adminMembers(limit = 500) {
  if (!pool) return [];
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const { rows } = await pool.query(
    `SELECT p.discord_id, p.ign, p.pogo_team, p.pogo_level, p.pogo_xp,
            p.pogo_pokedex, p.pogo_distance, p.pogo_pokestops, p.classement,
            p.stats_updated_at, COALESCE(l.xp, 0) AS chat_xp
       FROM pogo_profiles p
       LEFT JOIN levels l ON l.discord_id = p.discord_id
      ORDER BY p.pogo_xp DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    discordId: r.discord_id,
    ign: r.ign,
    team: r.pogo_team,
    level: r.pogo_level,
    totalXp: num(r.pogo_xp),
    pokedex: r.pogo_pokedex,
    distance: num(r.pogo_distance),
    pokestops: num(r.pogo_pokestops),
    classement: r.classement === true,
    chatXp: num(r.chat_xp),
    updatedAt: r.stats_updated_at,
  }));
}

/**
 * PoGo profile + chat XP for every member that has any DB row, keyed by
 * discord_id. Used to enrich the live Discord member list.
 */
export async function memberDataMap() {
  if (!pool) return new Map();
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const { rows } = await pool.query(
    `SELECT COALESCE(p.discord_id, l.discord_id) AS discord_id,
            p.ign, p.pogo_team, p.pogo_level, p.pogo_xp,
            p.pogo_pokedex, p.pogo_distance, p.pogo_pokestops,
            p.classement, p.stats_updated_at, COALESCE(l.xp, 0) AS chat_xp
       FROM pogo_profiles p
       FULL OUTER JOIN levels l ON l.discord_id = p.discord_id`,
  );
  const map = new Map();
  for (const r of rows) {
    map.set(r.discord_id, {
      ign: r.ign,
      team: r.pogo_team,
      level: r.pogo_level,
      totalXp: num(r.pogo_xp),
      pokedex: r.pogo_pokedex,
      distance: num(r.pogo_distance),
      pokestops: num(r.pogo_pokestops),
      classement: r.classement === true,
      chatXp: num(r.chat_xp),
      updatedAt: r.stats_updated_at,
    });
  }
  return map;
}

/** Correct a member's IGN and/or toggle their classement participation (live). */
export async function adminUpdateMember(discordId, { ign, classement }) {
  if (!pool) throw new Error('Database unavailable');
  const sets = [];
  const vals = [];
  if (ign !== undefined) {
    vals.push(typeof ign === 'string' && ign.trim() !== '' ? ign.trim() : null);
    sets.push(`ign = $${vals.length}`);
  }
  if (classement !== undefined) {
    vals.push(Boolean(classement));
    sets.push(`classement = $${vals.length}`);
  }
  if (!sets.length) return false;
  // Ensure a row exists so the edit applies even for members who never declared.
  await pool.query(`INSERT INTO pogo_profiles (discord_id) VALUES ($1) ON CONFLICT (discord_id) DO NOTHING`, [
    discordId,
  ]);
  vals.push(discordId);
  const { rowCount } = await pool.query(
    `UPDATE pogo_profiles SET ${sets.join(', ')}, updated_at = now() WHERE discord_id = $${vals.length}`,
    vals,
  );
  return rowCount > 0;
}

// ---------------------------------------------------------------------------
// Customisable bot messages (`bot_messages`). Each row = one message the bot
// sends (welcome, level-up, …) with its text + embed config. Rendered by the
// bot after rewiring; the dashboard edits them here.
// ---------------------------------------------------------------------------

/**
 * Default content for each message key, copied VERBATIM from the bot's current
 * hardcoded text. Keys flagged as pools (welcome, language_*) hold several lines
 * — one per line — from which the bot picks one at random.
 */
const MESSAGE_DEFAULTS = {
  // --- Accueil ---
  welcome: {
    content: [
      'Félicitations ! {user} a évolué en membre du serveur ! 🌟',
      '{user} a utilisé INSCRIPTION ! C’est super efficace ! Bienvenue ! ⚡',
      'Le Professeur Chen a un Pokédex pour toi, {user} ! Bienvenue ! 📕',
      'Un {user} sauvage apparaît !… et il décide de rester avec nous ! 🎣',
      '{user} a capturé le serveur avec une Master Ball ! Bienvenue ! 🟣',
      '{user} a choisi son starter et part à l’aventure ! Bienvenue ! 🔥💧🌿',
      'Bip… bip… le Pokématos sonne : {user} a rejoint l’équipe ! 📟',
      '{user} a obtenu le Badge Communauté ! Bienvenue à Pau ! 🥇',
      'La Team Rocket décolle vers d’autres cieux… mais {user} reste avec nous ! 🚀',
      'L’infirmière Joëlle te souhaite la bienvenue, {user} ! Tes Pokémon sont soignés. 💗',
      '{user} a traversé les hautes herbes et nous rejoint sain et sauf ! 🌿',
      'Rejoindre le serveur, c’était dans la poche… Pokéball, go ! Bienvenue {user} ! 🔴',
    ].join('\n'),
  },

  // --- Niveaux ---
  levelup: { content: '🎉 Bravo {user}, tu passes **niveau {level}** !' },

  // --- Classement (MP & boutons) ---
  classement_reminder: {
    content:
      '🏆 **Classement Pokémon GO — mise à jour mensuelle**\n\nSalut ! C’est le moment de rafraîchir tes stats pour le classement de la communauté de Pau.\n\n📸 **Réponds à ce message avec une capture de ton profil** (niveau, Total XP, Pokémon capturés, distance, PokéStops) et je m’occupe du reste.\n⚠️ Pense à **fermer le bandeau des récompenses** pour bien voir tes stats, et ajoute une capture de ton **badge « Œufs éclos »** 🥚 (médaille Éleveur) si tu veux mettre à jour ce compteur.\n\nPas envie ce mois-ci ? Ignore simplement ce message. Pour quitter le classement : `/classement-pogo quitter`.',
  },
  classement_onboarding: {
    content:
      '🏆 **Bienvenue dans le classement Pokémon GO de Pau !**\n\nPour enregistrer tes stats, **réponds à ce message avec une capture de ton profil** Pokémon GO. J’y lis automatiquement :\n• ⭐ ton **niveau**\n• ✨ ton **Total XP**\n• 🔴 tes **Pokémon capturés**\n• 👟 ta **distance parcourue**\n• 🛑 tes **PokéStops visités**\n• 🥚 tes **œufs éclos**\n\n📸 **Où trouver l’écran ?** Dans le jeu, touche ton **avatar en bas à gauche**, puis l’onglet où s’affichent tes statistiques (distance, captures, PokéStops, Total XP). Une capture nette suffit — **exemple ci-dessous** 👇\n\n⚠️ **Pense à fermer le bandeau des récompenses** (en bas de l’écran) pour qu’il ne cache pas tes statistiques.\n\n🥚 **Pour les œufs éclos**, envoie aussi une capture de ton **badge « Œufs éclos »** (médaille Éleveur) : touche ton avatar → onglet **Médailles**.\n\nTu peux m’envoyer une ou plusieurs captures quand tu veux pour te mettre à jour. Pour quitter le classement : `/classement-pogo quitter`.',
  },
  classement_not_participant: {
    content:
      'Tu n’es pas encore inscrit au classement. Fais `/classement-pogo rejoindre` sur le serveur, puis renvoie ta capture ! 🏆',
  },
  classement_nothing_read: {
    content:
      'Je n’ai rien réussi à lire sur cette capture 😕 Envoie l’écran de ton **profil** ou de tes **statistiques** bien net (niveau, Total XP, Pokémon capturés, distance, PokéStops).',
  },
  classement_capture_refused: {
    content:
      '⛔ Je n’ai pas pu valider cette capture : {detail}\nEnvoie une capture **récente et non modifiée** de ton profil. En cas d’erreur, un membre de l’équipe peut vérifier.',
  },
  classement_join_ok: {
    content:
      '🏆 Tu participes maintenant au **classement Pokémon GO** ! Je t’ai envoyé un **MP** pour enregistrer tes stats. 📨',
  },
  classement_join_closed: {
    content:
      '🏆 Tu participes maintenant au **classement Pokémon GO** ! Mais je n’ai pas pu t’écrire en privé : **ouvre tes MP** (Paramètres de confidentialité du serveur), puis envoie-moi directement une capture de ton profil. 📸',
  },

  // --- Modération du langage (pools) ---
  language_fun: {
    content: [
      '⚡ Bzzt ! Motisma t’envoie un coup de **{attack}** pour surveiller ton langage ! 😄',
      '⚡ **{attack}** ! Doucement sur les gros mots, dresseur. 😏',
      '⚡ Motisma lance **{attack}** : on reste poli sur le serveur !',
      '⚡ Zzzt ! Un petit **{attack}** pour calmer ce vocabulaire. 🔌',
    ].join('\n'),
  },
  language_stern: {
    content: [
      '⚡ Là c’est trop. **Attention à ton langage.** Motisma veille. 😠',
      '⚡ Motisma charge une **Fatal-Foudre**… surveille ton vocabulaire, sérieusement.',
      '⚡ Ce mot-là ne passe pas. **Reste correct** ou Motisma se charge de te recadrer. ⚡😠',
    ].join('\n'),
  },

  // --- Vérification ---
  verification_detection: {
    content: '🔎 Pseudo : {namePart}{teamPart}\nUn modo valide avec ✅.',
  },
  verification_tamper: {
    content:
      '⚠️ **Attention, photo potentiellement truquée.**\n> {tamperReason}\nÀ vérifier avant de valider.',
  },
  verification_refused: {
    content: '❌ Demande de {target} refusée par {user}. Merci de reposter des captures conformes.',
  },
  verification_validated: {
    content: '✅ {target} a été validé par {user}.{suffix}',
  },
};

/** All known message keys. */
export const MESSAGE_KEYS = Object.keys(MESSAGE_DEFAULTS);

/** Editable columns of a message row, with coercion. */
const MESSAGE_FIELDS = {
  enabled: 'bool',
  content: 'text',
  embed_enabled: 'bool',
  embed_title: 'text',
  embed_description: 'text',
  embed_color: 'text',
  embed_image: 'text',
  embed_thumbnail: 'text',
  embed_footer: 'text',
  ephemeral: 'bool',
};

/** Create the default message rows for a guild if they don't exist yet. */
export async function ensureMessages(guildId) {
  if (!pool) return;
  for (const [key, def] of Object.entries(MESSAGE_DEFAULTS)) {
    // Seed whichever default columns the entry provides (content and/or embed).
    const cols = ['guild_id', 'key'];
    const vals = [guildId, key];
    for (const col of Object.keys(MESSAGE_FIELDS)) {
      if (def[col] !== undefined) {
        cols.push(col);
        vals.push(def[col]);
      }
    }
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `INSERT INTO bot_messages (${cols.join(', ')}) VALUES (${ph})
       ON CONFLICT (guild_id, key) DO NOTHING`,
      vals,
    );
  }
}

/** All message rows for a guild (defaults ensured first). */
export async function getMessages(guildId) {
  if (!pool) return [];
  await ensureMessages(guildId);
  const { rows } = await pool.query('SELECT * FROM bot_messages WHERE guild_id = $1 ORDER BY key', [
    guildId,
  ]);
  return rows;
}

/** Upsert one message's editable fields. */
export async function upsertMessage(guildId, key, data) {
  if (!pool) throw new Error('Database unavailable');
  const cols = ['guild_id', 'key'];
  const vals = [guildId, key];
  const updates = [];
  for (const [k, type] of Object.entries(MESSAGE_FIELDS)) {
    if (!(k in data)) continue;
    let v = data[k];
    if (type === 'bool') v = Boolean(v);
    else v = typeof v === 'string' && v.trim() !== '' ? v : null;
    cols.push(k);
    vals.push(v);
    updates.push(`${k} = EXCLUDED.${k}`);
  }
  if (!updates.length) return false;
  updates.push('updated_at = now()');
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(
    `INSERT INTO bot_messages (${cols.join(', ')}) VALUES (${ph})
     ON CONFLICT (guild_id, key) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
  return true;
}

/** Aggregate counts for the dashboard overview. */
export async function adminOverview() {
  if (!pool) return null;
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM users)                                AS members,
      (SELECT count(*) FROM users WHERE classement)              AS classement,
      (SELECT count(*) FROM users WHERE ign IS NOT NULL)         AS with_profile,
      (SELECT count(*) FROM pogo_stats WHERE status = 'pending') AS pending,
      (SELECT count(*) FROM users WHERE pogo_team = 'mystic')    AS mystic,
      (SELECT count(*) FROM users WHERE pogo_team = 'valor')     AS valor,
      (SELECT count(*) FROM users WHERE pogo_team = 'instinct')  AS instinct
  `);
  const r = rows[0];
  const n = (v) => Number(v) || 0;
  return {
    members: n(r.members),
    classement: n(r.classement),
    withProfile: n(r.with_profile),
    pending: n(r.pending),
    teams: { mystic: n(r.mystic), valor: n(r.valor), instinct: n(r.instinct) },
  };
}

/** Set or add chat XP for a member (live `levels` table). mode: 'set' | 'add'. */
export async function adminSetChatXp(discordId, amount, mode = 'set') {
  if (!pool) throw new Error('Database unavailable');
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n)) throw new Error('invalid_amount');
  if (mode === 'add') {
    await pool.query(
      `INSERT INTO levels (discord_id, xp, updated_at) VALUES ($1, GREATEST($2, 0), now())
       ON CONFLICT (discord_id) DO UPDATE SET xp = GREATEST(levels.xp + $2, 0), updated_at = now()`,
      [discordId, n],
    );
  } else {
    await pool.query(
      `INSERT INTO levels (discord_id, xp, updated_at) VALUES ($1, GREATEST($2, 0), now())
       ON CONFLICT (discord_id) DO UPDATE SET xp = GREATEST($2, 0), updated_at = now()`,
      [discordId, n],
    );
  }
  return true;
}
