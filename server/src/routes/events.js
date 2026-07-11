import { config } from '../config.js';
import { fetchGuildScheduledEvents } from '../discord.js';
import { syncGuildEvents, getSiteEvents } from '../db.js';

// Refresh the local snapshot at most this often, so page loads don't hammer the
// Discord API (well under rate limits). Completed events are captured as long as
// the page is visited around the time they wrap up.
const TTL = 2 * 60 * 1000; // 2 minutes
let lastSync = 0;
let syncing = null;

async function refreshIfStale() {
  if (!config.botToken || !config.guildId) return;
  if (Date.now() - lastSync < TTL) return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const events = await fetchGuildScheduledEvents(config.guildId);
      if (events) {
        await syncGuildEvents(config.guildId, events);
        lastSync = Date.now();
      }
    } catch (err) {
      console.error('[events] Sync failed:', err?.message ?? err);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export async function eventsRoutes(app) {
  // Public, read-only community events (Discord scheduled events). Snapshots are
  // persisted on each refresh so past events survive after Discord drops them.
  app.get('/api/events', async () => {
    await refreshIfStale();
    if (!config.guildId) return { upcoming: [], active: [], past: [] };
    return getSiteEvents(config.guildId);
  });
}
