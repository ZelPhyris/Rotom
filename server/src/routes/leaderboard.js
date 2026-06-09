import { leaderboard } from '../db.js';

export async function leaderboardRoutes(app) {
  app.get('/api/leaderboard', async (request) => {
    const limit = Math.min(Number(request.query.limit) || 100, 200);
    const entries = await leaderboard(limit);
    return { entries };
  });
}
