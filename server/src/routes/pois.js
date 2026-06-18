import { getWayspots, refreshWayspots } from '../lightship.js';

export async function poisRoutes(app) {
  // Public, read-only list of Pokémon GO spots (VPS-activated Wayspots) around
  // Pau, served from the in-memory cache the lightship module keeps warm.
  app.get('/api/pois', async () => {
    let data = getWayspots();
    if (!data.wayspots.length) {
      await refreshWayspots();
      data = getWayspots();
    }
    return data;
  });
}
