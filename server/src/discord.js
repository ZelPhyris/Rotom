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
