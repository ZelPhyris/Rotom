import crypto from 'node:crypto';
import { config, oauthReady } from './config.js';

const SESSION_COOKIE = 'pogo_session';
const STATE_COOKIE = 'pogo_oauth_state';
const SESSION_TTL = 7 * 24 * 3600; // seconds

function baseCookie(maxAge) {
  return {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge,
  };
}

function setSession(reply, user) {
  const payload = JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL * 1000 });
  reply.setCookie(SESSION_COOKIE, payload, baseCookie(SESSION_TTL));
}

/** Read the signed session cookie. Returns the user object or null. */
export function readSession(request) {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const data = JSON.parse(unsigned.value);
    if (!data.exp || data.exp < Date.now()) return null;
    return { id: data.id, username: data.username, avatar: data.avatar, isAdmin: data.isAdmin === true };
  } catch {
    return null;
  }
}

// Discord permission bits.
const ADMINISTRATOR = 1n << 3n; // 0x8
const MANAGE_GUILD = 1n << 5n; // 0x20

/**
 * Is the user an admin of the POGO PAU server? Looks them up in the guild list
 * Discord returns (requires the `guilds` OAuth scope) and checks ownership or
 * the Administrator / Manage Server permission on GUILD_ID.
 */
function isGuildAdmin(guilds) {
  if (!config.guildId || !Array.isArray(guilds)) return false;
  const g = guilds.find((x) => x.id === config.guildId);
  if (!g) return false;
  if (g.owner) return true;
  try {
    return (BigInt(g.permissions) & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

// Admin status is computed at login and stored (signed) in the session; the
// allowlist stays as an override for accounts without server admin permissions.
export const isAdmin = (user) =>
  Boolean(user && (user.isAdmin || config.adminIds.includes(user.id)));

/** Fastify guard: 401 if not logged in; attaches request.user otherwise. */
export async function requireUser(request, reply) {
  const user = readSession(request);
  if (!user) {
    reply.code(401).send({ error: 'not_authenticated' });
    return;
  }
  request.user = user;
}

export async function requireAdmin(request, reply) {
  const user = readSession(request);
  if (!user) return reply.code(401).send({ error: 'not_authenticated' });
  if (!isAdmin(user)) return reply.code(403).send({ error: 'forbidden' });
  request.user = user;
}

export async function authRoutes(app) {
  // Kick off the OAuth2 Authorization Code flow.
  app.get('/api/auth/login', async (request, reply) => {
    if (!oauthReady()) return reply.code(503).send({ error: 'oauth_not_configured' });

    const state = crypto.randomBytes(16).toString('hex');
    reply.setCookie(STATE_COOKIE, state, baseCookie(600));

    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', config.discord.clientId);
    url.searchParams.set('redirect_uri', config.discord.redirectUri);
    url.searchParams.set('response_type', 'code');
    // `guilds` lets us read the user's servers + permissions to detect admins.
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    return reply.redirect(url.toString());
  });

  // Discord redirects here with ?code&state. Exchange server-side (secret stays
  // on the server), fetch the user, then set a first-party session cookie.
  app.get('/api/auth/callback', async (request, reply) => {
    const { code, state } = request.query;
    const cookieState = request.unsignCookie(request.cookies[STATE_COOKIE] || '');
    reply.clearCookie(STATE_COOKIE, { path: '/' });

    if (!code || !state || !cookieState.valid || cookieState.value !== state) {
      return reply.code(400).send({ error: 'invalid_state' });
    }

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discord.redirectUri,
      }),
    });
    if (!tokenRes.ok) return reply.code(502).send({ error: 'token_exchange_failed' });
    const token = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userRes.ok) return reply.code(502).send({ error: 'userinfo_failed' });
    const u = await userRes.json();

    // Detect admin status from the user's permissions on the POGO PAU server.
    // Best-effort: if the guilds lookup fails we fall back to the allowlist.
    let admin = config.adminIds.includes(u.id);
    if (!admin) {
      try {
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (guildsRes.ok) admin = isGuildAdmin(await guildsRes.json());
      } catch {
        // Network/Discord hiccup — keep the allowlist result.
      }
    }

    setSession(reply, {
      id: u.id,
      username: u.global_name || u.username,
      avatar: u.avatar,
      isAdmin: admin,
    });
    return reply.redirect(config.webOrigin + '/profil');
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = readSession(request);
    if (!user) return reply.code(401).send({ error: 'not_authenticated' });
    return { user: { ...user, isAdmin: isAdmin(user) } };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
