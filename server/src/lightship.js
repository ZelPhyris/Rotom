import { config } from './config.js';

// Niantic Spatial (ex-Lightship) VPS Coverage API. This is Niantic's official,
// keyed developer API — not scraping. It returns public, VPS-activated Wayspots
// (the shared source behind Pokémon GO PokéStops/Gyms): name, GPS and a hint
// image. It does NOT label a Wayspot as gym vs PokéStop, so we surface them all
// as generic "spots". Coverage is the VPS-activated subset, not every PokéStop.
//
// Two endpoints, discovered from the open ARDK package (niantic-lightship/ardk-upm):
//   POST {base}/GET_VPS_COVERAGE            -> coverage areas + target ids near a point
//   POST {base}/GET_VPS_LOCALIZATION_TARGETS -> details (name, point, image) for ids
const BASE = 'https://vps-coverage-api.nianticspatial.com/api/json/v1';

// Bounding box covering Pau and its immediate suburbs (Lons, Billère, Bizanos,
// Jurançon, Gélos…). Tiled with overlapping coverage queries, then deduped.
const AREA = { latMin: 43.27, latMax: 43.345, lngMin: -0.43, lngMax: -0.31 };
const STEP_LAT = 0.018; // ~2 km
const STEP_LNG = 0.022; // ~2 km at this latitude
const QUERY_RADIUS_M = 2000; // overlaps neighbouring tiles, no gaps
const BATCH = 200; // target-detail lookups per request
const REFRESH_MS = 24 * 60 * 60 * 1000;

let cache = []; // [{ id, name, lat, lng, imageUrl }]
let updatedAt = null;
let refreshing = null; // in-flight guard so concurrent requests share one fetch

async function post(method, body) {
  const res = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { Authorization: config.lightshipApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} HTTP ${res.status}`);
  return res.json();
}

function gridPoints() {
  const pts = [];
  for (let lat = AREA.latMin; lat <= AREA.latMax + 1e-9; lat += STEP_LAT) {
    for (let lng = AREA.lngMin; lng <= AREA.lngMax + 1e-9; lng += STEP_LNG) {
      pts.push([lat, lng]);
    }
  }
  return pts;
}

async function fetchWayspots() {
  // 1) sweep the grid, collect unique target ids
  const ids = new Set();
  for (const [lat, lng] of gridPoints()) {
    try {
      const cov = await post('GET_VPS_COVERAGE', {
        query_location: { lat_degrees: lat, lng_degrees: lng },
        query_radius_in_meters: QUERY_RADIUS_M,
      });
      for (const a of cov.vps_coverage_area || []) {
        for (const id of a.vps_localization_target_id || []) ids.add(id);
      }
    } catch (err) {
      // a failed tile just means a few missing spots; keep going
      console.error('[lightship] coverage tile failed:', err.message);
    }
  }

  // 2) resolve ids to named, located targets
  const all = [...ids];
  const out = [];
  for (let i = 0; i < all.length; i += BATCH) {
    try {
      const tg = await post('GET_VPS_LOCALIZATION_TARGETS', { query_id: all.slice(i, i + BATCH) });
      for (const t of tg.vps_localization_target || []) {
        const p = t.shape?.point;
        if (!p || p.lat_degrees == null) continue;
        out.push({
          id: t.id,
          name: t.name || '',
          lat: p.lat_degrees,
          lng: p.lng_degrees,
          imageUrl: t.image_url || '',
        });
      }
    } catch (err) {
      console.error('[lightship] targets batch failed:', err.message);
    }
  }
  return out;
}

// Refresh the cache (shared if already in flight). Keeps the previous cache if a
// refresh yields nothing, so a transient API hiccup never blanks the map.
export async function refreshWayspots() {
  if (!config.lightshipApiKey) return cache;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await fetchWayspots();
      if (data.length) {
        cache = data;
        updatedAt = new Date().toISOString();
      }
      return cache;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function getWayspots() {
  return { wayspots: cache, updatedAt };
}

// Initial load on boot + daily refresh, so new VPS-activated spots appear on
// their own without any manual step.
export function startWayspotRefresh() {
  if (!config.lightshipApiKey) {
    console.warn('[lightship] LIGHTSHIP_API_KEY not set — /api/pois will be empty');
    return;
  }
  refreshWayspots().catch((err) => console.error('[lightship] initial refresh failed:', err.message));
  setInterval(() => refreshWayspots().catch(() => {}), REFRESH_MS);
}
