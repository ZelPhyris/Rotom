import dotenv from 'dotenv';

// Load server/.env first (local dev overrides), then fall back to the repo-root
// .env (shared with the bot) without overriding values already set.
dotenv.config();
dotenv.config({ path: new URL('../../.env', import.meta.url) });

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export const config = {
  port: Number(process.env.PORT || 3100),
  host: str(process.env.HOST) || '0.0.0.0',

  // Where the browser-facing site lives. Used to redirect back after login and,
  // in production, served from the same origin so cookies are first-party.
  webOrigin: str(process.env.WEB_ORIGIN) || 'http://localhost:5173',

  // Secret used to sign session/state cookies. MUST be set in production.
  sessionSecret: str(process.env.SESSION_SECRET) || 'dev-insecure-session-secret-change-me-please',
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  databaseUrl: str(process.env.DATABASE_URL),

  // Bot token (shared .env), used only for read-only Discord REST lookups such
  // as resolving a member's avatar for the leaderboard. Never sent to the browser.
  botToken: str(process.env.DISCORD_TOKEN),

  // Niantic Spatial (Lightship) developer API key, used server-side only to read
  // public VPS-activated wayspots around Pau for the map. Never sent to the browser.
  lightshipApiKey: str(process.env.LIGHTSHIP_API_KEY),

  discord: {
    clientId: str(process.env.CLIENT_ID),
    clientSecret: str(process.env.DISCORD_CLIENT_SECRET),
    // Must EXACTLY match a redirect registered in the Discord Developer Portal.
    redirectUri: str(process.env.OAUTH_REDIRECT_URI) || 'http://localhost:5173/api/auth/callback',
  },

  // Discord user IDs allowed to validate submitted stats (comma-separated).
  adminIds: str(process.env.ADMIN_DISCORD_IDS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const oauthReady = () => Boolean(config.discord.clientId && config.discord.clientSecret);
