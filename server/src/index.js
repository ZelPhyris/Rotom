import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { initSchema } from './db.js';
import { authRoutes } from './auth.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { statsRoutes } from './routes/stats.js';
import { poisRoutes } from './routes/pois.js';
import { startWayspotRefresh } from './lightship.js';

const app = Fastify({ logger: true });

await app.register(cookie, { secret: config.sessionSecret });
await app.register(authRoutes);
await app.register(leaderboardRoutes);
await app.register(statsRoutes);
await app.register(poisRoutes);

app.get('/api/health', async () => ({ ok: true, service: 'pogo-pau-server' }));

await initSchema();

// Warm the Pokémon GO spots cache and keep it fresh in the background.
startWayspotRefresh();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
