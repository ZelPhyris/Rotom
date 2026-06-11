import { requireUser, requireAdmin } from '../auth.js';
import { submitStats, mySubmissions, pendingStats, reviewStats, profileStats } from '../db.js';

const isInt = (v, min, max) =>
  Number.isInteger(v) && v >= min && v <= max;

export async function statsRoutes(app) {
  // Submit a new in-game stats line for review. Requires login.
  app.post('/api/stats', { preHandler: requireUser }, async (request, reply) => {
    const b = request.body ?? {};

    const level = b.level === undefined || b.level === null ? null : Number(b.level);
    const totalXp = b.totalXp === undefined || b.totalXp === null ? null : Number(b.totalXp);

    if (level !== null && !isInt(level, 1, 50)) {
      return reply.code(400).send({ error: 'invalid_level' });
    }
    if (totalXp !== null && (!Number.isFinite(totalXp) || totalXp < 0)) {
      return reply.code(400).send({ error: 'invalid_total_xp' });
    }
    if (level === null && totalXp === null) {
      return reply.code(400).send({ error: 'nothing_to_submit' });
    }

    const result = await submitStats(request.user.id, {
      level,
      totalXp,
      team: typeof b.team === 'string' ? b.team : null,
      pokedexCaught: b.pokedexCaught != null ? Number(b.pokedexCaught) : null,
      distanceKm: b.distanceKm != null ? Number(b.distanceKm) : null,
      screenshotUrl: typeof b.screenshotUrl === 'string' ? b.screenshotUrl : null,
    });

    return { id: Number(result.id), status: result.status };
  });

  // The caller's own submission history.
  app.get('/api/stats/me', { preHandler: requireUser }, async (request) => {
    return { submissions: await mySubmissions(request.user.id) };
  });

  // The caller's own in-game profile (stats the bot recorded).
  app.get('/api/profile/me', { preHandler: requireUser }, async (request) => {
    return { profile: await profileStats(request.user.id) };
  });

  // --- Moderation ---
  app.get('/api/admin/pending', { preHandler: requireAdmin }, async () => {
    return { pending: await pendingStats() };
  });

  app.post('/api/admin/review/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number(request.params.id);
    const status = request.body?.status;
    if (!Number.isInteger(id) || (status !== 'approved' && status !== 'rejected')) {
      return reply.code(400).send({ error: 'invalid_review' });
    }
    const ok = await reviewStats(id, status, request.user.id);
    if (!ok) return reply.code(409).send({ error: 'already_reviewed_or_missing' });
    return { ok: true };
  });
}
