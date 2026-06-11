import { leaderboard } from '../db.js';
import { avatarUrlsFor } from '../discord.js';

export async function leaderboardRoutes(app) {
  app.get('/api/leaderboard', async (request) => {
    const limit = Math.min(Number(request.query.limit) || 100, 200);
    const entries = await leaderboard(limit);
    const avatars = await avatarUrlsFor(entries.map((e) => e.discordId));
    return {
      entries: entries.map((e) => ({ ...e, avatarUrl: avatars.get(e.discordId) ?? null })),
    };
  });
}
