import { config } from './config.js';

/**
 * Read-only Discord REST helpers for the web API. Currently used to resolve a
 * member's avatar URL from their Discord ID for the leaderboard. Results are
 * cached in memory so repeated page loads don't hammer the API (and stay well
 * under rate limits).
 */

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map(); // discordId -> { url, exp }

function avatarUrl(user) {
  if (!user?.id) return null;
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  }
  // Default avatar for the new username system: (id >> 22) % 6.
  let idx = 0;
  try {
    idx = Number((BigInt(user.id) >> 22n) % 6n);
  } catch {
    idx = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

async function fetchUser(id) {
  const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${config.botToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Is the bot token configured (→ channel/role selectors available)? */
export function hasBotToken() {
  return Boolean(config.botToken);
}

let botUserCache = null; // { data, exp }

/** The bot's own account (name + avatar URL). Cached 1h. Null if unavailable. */
export async function getBotUser() {
  const now = Date.now();
  if (botUserCache && botUserCache.exp > now) return botUserCache.data;
  const u = await botGet('/users/@me');
  const data = u
    ? { id: u.id, username: u.global_name || u.username, avatarUrl: avatarUrl(u) }
    : null;
  botUserCache = { data, exp: now + 60 * 60 * 1000 };
  return data;
}

async function botGet(path) {
  if (!config.botToken) return null;
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${config.botToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Channels of a guild (id, name, type, position). Null if unavailable. */
export async function fetchGuildChannels(guildId) {
  const data = await botGet(`/guilds/${guildId}/channels`);
  if (!Array.isArray(data)) return null;
  return data
    .map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position, parentId: c.parent_id ?? null }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Full member list of a guild (humans only), via the bot token. Requires the
 * "Server Members" privileged intent. Null if unavailable.
 */
export async function fetchGuildMembers(guildId, limit = 1000) {
  const data = await botGet(`/guilds/${guildId}/members?limit=${limit}`);
  if (!Array.isArray(data)) return null;
  return data
    .filter((m) => m.user && !m.user.bot)
    .map((m) => ({
      discordId: m.user.id,
      username: m.user.global_name || m.user.username,
      // Members are renamed to their in-game name → the nick is the IGN.
      nick: m.nick || null,
      avatar: avatarUrl(m.user),
      roles: m.roles || [],
    }));
}

/** Live member/online counts for a guild (via the bot token). Null if unavailable. */
export async function fetchGuildCounts(guildId) {
  const data = await botGet(`/guilds/${guildId}?with_counts=true`);
  if (!data) return null;
  return {
    name: data.name ?? null,
    memberCount: data.approximate_member_count ?? null,
    onlineCount: data.approximate_presence_count ?? null,
  };
}

/**
 * Guild scheduled events ("Événements" of the server) via the bot token. Discord
 * only lists SCHEDULED (1) and ACTIVE (2) events — once completed they drop off
 * the API, so callers persist snapshots to keep a history. Null if unavailable.
 */
export async function fetchGuildScheduledEvents(guildId) {
  const data = await botGet(`/guilds/${guildId}/scheduled-events?with_user_count=true`);
  if (!Array.isArray(data)) return null;
  return data.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description ?? null,
    // External events carry a free-text place; voice/stage events don't.
    location: e.entity_metadata?.location ?? null,
    coverUrl: e.image
      ? `https://cdn.discordapp.com/guild-events/${e.id}/${e.image}.png?size=600`
      : null,
    startTime: e.scheduled_start_time ?? null,
    endTime: e.scheduled_end_time ?? null,
    status: e.status ?? null,
    userCount: e.user_count ?? null,
  }));
}

/** Roles of a guild (id, name, position, managed). Null if unavailable. */
export async function fetchGuildRoles(guildId) {
  const data = await botGet(`/guilds/${guildId}/roles`);
  if (!Array.isArray(data)) return null;
  return data
    .map((r) => ({ id: r.id, name: r.name, position: r.position, managed: r.managed }))
    .sort((a, b) => b.position - a.position);
}

/**
 * Resolve avatar URLs for a batch of Discord IDs.
 * @param {string[]} ids
 * @returns {Promise<Map<string, string|null>>}
 */
export async function avatarUrlsFor(ids) {
  const out = new Map();
  if (!config.botToken) {
    for (const id of ids) out.set(id, null);
    return out;
  }

  const now = Date.now();
  const missing = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && hit.exp > now) out.set(id, hit.url);
    else missing.push(id);
  }

  await Promise.all(
    missing.map(async (id) => {
      let url = null;
      try {
        url = avatarUrl(await fetchUser(id));
      } catch {
        url = null;
      }
      cache.set(id, { url, exp: now + CACHE_TTL });
      out.set(id, url);
    }),
  );

  return out;
}
