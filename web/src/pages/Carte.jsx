import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Free, key-less dark vector basemap — smooth and on-theme with the dark site.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

// Robust raster fallback (CARTO dark, no key, no glyphs/sprites/heavy worker)
// used if the vector style fails to load in the browser.
const RASTER_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap, &copy; CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b0d12' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

// Heat ramp (turbo-like), tuned to read well on a dark canvas: cool blue for
// quiet sectors, warm red for the busiest ones.
const RAMP = [
  [0.0, [59, 130, 246]], // blue
  [0.33, [34, 211, 238]], // cyan
  [0.66, [251, 191, 36]], // amber
  [1.0, [242, 85, 99]], // red
];
const MUTED = [99, 110, 126];

// Counts come from /counts.json (written by the bot, kept across deploys). In
// local dev that file is absent, so we fall back to a small sample so the map
// still looks alive.
const FALLBACK_COUNTS = {
  minVisiblePlayers: 3,
  sectors: { 'Pau Centre': 9, 'Pau Université': 5, 'Pau Le Hameau': 3, Lons: 12, Billère: 2 },
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

function rampColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, c0] = RAMP[i - 1];
    const [t1, c1] = RAMP[i];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

// area-weighted centroid of a [lng,lat] ring, returned as [lng,lat]
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (6 * a), cy / (6 * a)];
}

const fmtUpdated = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return 'Mis à jour le ' + d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function Carte() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [meta, setMeta] = useState({ total: 0, updated: '', minVisible: 3 });

  // Pokémon GO spots (VPS-activated Wayspots) served by our API + display toggle.
  const [spots, setSpots] = useState([]);
  const [showSpots, setShowSpots] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // ---- map + sectors (created once) ----
  useEffect(() => {
    let cancelled = false;
    let markers = [];
    let resizeObs = null;

    // Size the MapLibre container explicitly (viewport minus the real navbar
    // height). Relying on CSS height/min-height left it at 0 height in some
    // browsers, collapsing the canvas — setting the measured element directly,
    // in normal flow, removes any parent/child height-resolution ambiguity.
    function sizePage() {
      const navH = document.querySelector('.navbar')?.offsetHeight || 64;
      const h = Math.max(460, window.innerHeight - navH);
      if (containerRef.current) containerRef.current.style.height = `${h}px`;
    }
    sizePage();
    window.addEventListener('resize', sizePage);

    // Add the sector source, paint layers, badges and popups once a style loads.
    function wire(map, geo, minVisible) {
      map.addSource('sectors', { type: 'geojson', data: geo });

      map.addLayer({
        id: 'sectors-fill',
        type: 'fill',
        source: 'sectors',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case', ['boolean', ['get', 'visible'], false], 0.32, 0.14],
        },
      });
      map.addLayer({
        id: 'sectors-glow',
        type: 'line',
        source: 'sectors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 6 },
      });
      map.addLayer({
        id: 'sectors-line',
        type: 'line',
        source: 'sectors',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.2, 'line-opacity': 0.9 },
      });

      map.on('mousemove', 'sectors-fill', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'sectors-fill', () => (map.getCanvas().style.cursor = ''));
      map.on('click', 'sectors-fill', (e) => {
        const p = e.features[0].properties;
        const isVisible = p.visible === 'true' || p.visible === true;
        const body = isVisible
          ? `<span class="map-pop-count">${p.count} joueur${p.count > 1 ? 's' : ''} actif${p.count > 1 ? 's' : ''}</span>`
          : `<span class="map-pop-soon">En éveil — moins de ${minVisible} joueurs déclarés</span>`;
        new maplibregl.Popup({ className: 'map-pop', closeButton: false, offset: 14 })
          .setLngLat(e.lngLat)
          .setHTML(`<h3>${esc(p.name)}</h3>${body}`)
          .addTo(map);
      });

      for (const f of geo.features) {
        const p = f.properties;
        const [lng, lat] = centroid(f.geometry.coordinates[0]);
        const el = document.createElement('div');
        el.className = `sector-badge${p.visible ? '' : ' muted'}`;
        el.style.setProperty('--c', p.color);
        el.innerHTML = `<span class="sb-num">${p.visible ? p.count : '•••'}</span><span class="sb-name">${esc(p.name)}</span>`;
        markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
      }

      setLoading(false);
    }

    function start(style, geo, minVisible, bounds, fitPadding, isFallback) {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        bounds,
        fitBoundsOptions: { padding: fitPadding },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

      // Guard against the canvas being created at 0×0 (container not measured
      // yet at init): keep it sized to its box, and refit once we have a size.
      resizeObs?.disconnect();
      resizeObs = new ResizeObserver(() => map.resize());
      resizeObs.observe(containerRef.current);
      requestAnimationFrame(() => !cancelled && map.resize());

      // Some basemap styles reference pattern/icon images that aren't in their
      // sprite (e.g. "wood-pattern"). Supply a transparent placeholder so this
      // stays a harmless no-op instead of an error event.
      map.on('styleimagemissing', (e) => {
        if (!map.hasImage(e.id)) {
          map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
        }
      });

      let loaded = false;
      map.on('load', () => {
        if (cancelled) return;
        loaded = true;
        map.resize();
        map.fitBounds(bounds, { padding: fitPadding, animate: false });
        wire(map, geo, minVisible);
        setMapReady(true);
      });

      map.on('error', (e) => {
        const msg = e?.error?.message || '';
        // eslint-disable-next-line no-console
        console.error('[carte] map error:', e?.error || e);
        // Ignore non-fatal hiccups: anything once the style is up, plus missing
        // sprite images, which are cosmetic and must not tear the map down.
        if (cancelled || loaded || /could not be loaded|image|sprite/i.test(msg)) return;
        // Genuine failure before the style loaded.
        markers.forEach((m) => m.remove());
        markers = [];
        map.remove();
        mapRef.current = null;
        setMapReady(false);
        if (!isFallback) {
          // Vector style failed — retry once with the robust raster basemap.
          start(RASTER_STYLE, geo, minVisible, bounds, fitPadding, true);
        } else {
          setErrMsg(msg || 'La carte ne peut pas être affichée sur cet appareil.');
          setLoading(false);
        }
      });
    }

    async function init() {
      const [geo, counts] = await Promise.all([
        fetch('/sectors.geojson').then((r) => r.json()),
        fetch('/counts.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => FALLBACK_COUNTS),
      ]);
      if (cancelled) return;

      // Pokémon GO spots load independently so a slow/empty API never blocks the map.
      fetch('/api/pois', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => !cancelled && setSpots(Array.isArray(d.wayspots) ? d.wayspots : []))
        .catch(() => {});

      const minVisible = counts.minVisiblePlayers ?? 3;
      const sectorCounts = counts.sectors ?? {};
      const values = Object.values(sectorCounts);
      const maxRef = Math.max(minVisible + 5, ...values, 1);

      // Decorate each feature with its computed colour + count so the paint
      // layers and badges can read straight from feature properties.
      for (const f of geo.features) {
        const name = f.properties.name;
        const c = sectorCounts[name] ?? 0;
        const visible = c >= minVisible;
        const t = (c - minVisible) / (maxRef - minVisible);
        const col = visible ? rampColor(t) : MUTED;
        f.properties.count = c;
        f.properties.visible = visible;
        f.properties.color = rgb(col);
      }

      const total = values.filter((c) => c >= minVisible).reduce((a, c) => a + c, 0);
      setMeta({ total, updated: fmtUpdated(counts.updatedAt), minVisible });

      // bounds covering every sector
      const bounds = new maplibregl.LngLatBounds();
      for (const f of geo.features) {
        for (const ring of f.geometry.coordinates) for (const pt of ring) bounds.extend(pt);
      }

      // leave room for the overlay panel (left on desktop, bottom on mobile)
      const narrow = window.innerWidth < 760;
      const fitPadding = narrow
        ? { top: 40, bottom: 230, left: 30, right: 30 }
        : { top: 70, bottom: 70, left: 360, right: 70 };

      start(MAP_STYLE, geo, minVisible, bounds, fitPadding, false);
    }

    init().catch((err) => {
      if (!cancelled) {
        setErrMsg(err?.message || 'Impossible de charger la carte.');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resize', sizePage);
      resizeObs?.disconnect();
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ---- Pokémon GO spots: a GPU circle layer (scales to hundreds of points) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const fc = {
      type: 'FeatureCollection',
      features: spots.map((w) => ({
        type: 'Feature',
        properties: { name: w.name, image: w.imageUrl || '' },
        geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
      })),
    };

    if (map.getSource('spots')) {
      map.getSource('spots').setData(fc);
    } else {
      map.addSource('spots', { type: 'geojson', data: fc });
      map.addLayer({
        id: 'spots-circles',
        type: 'circle',
        source: 'spots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 4.5, 17, 8],
          'circle-color': '#38bdf8',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
          'circle-opacity': 0.92,
        },
      });

      map.on('mouseenter', 'spots-circles', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'spots-circles', () => (map.getCanvas().style.cursor = ''));
      map.on('click', 'spots-circles', (e) => {
        const f = e.features[0];
        const p = f.properties;
        const img = p.image
          ? `<img class="map-pop-img" src="${esc(p.image)}=w220-h150-c" alt="" loading="lazy" />`
          : '';
        new maplibregl.Popup({ className: 'map-pop', closeButton: false, offset: 12 })
          .setLngLat(f.geometry.coordinates.slice())
          .setHTML(
            `<h3>${esc(p.name || 'Spot')}</h3><span class="map-pop-kind map-pop-stop">Spot Pokémon GO</span>${img}`,
          )
          .addTo(map);
      });
    }

    map.setLayoutProperty('spots-circles', 'visibility', showSpots ? 'visible' : 'none');
  }, [mapReady, spots, showSpots]);

  return (
    <div className="map-page">
      <div ref={containerRef} className="map-canvas" aria-label="Carte des secteurs de jeu" />

      <div className="map-panel">
        <div className="map-panel-head">
          <span className="map-kicker">Communauté</span>
          <h1>Carte des secteurs</h1>
          <p>
            Où la communauté joue à Pau. Chaque secteur se colore selon le nombre de dresseurs
            actifs — du plus calme au plus animé.
          </p>
        </div>

        <div className="map-legend">
          <span>calme</span>
          <span className="map-legend-bar" aria-hidden="true" />
          <span>animé</span>
        </div>

        <div className="map-stats">
          <strong>{meta.total}</strong>
          <span>joueurs actifs visibles</span>
        </div>

        <p className="map-note">
          Un secteur n'affiche son compteur qu'à partir de <strong>{meta.minVisible} joueurs</strong>{' '}
          pour préserver l'anonymat.
          {meta.updated && <span className="map-updated">{meta.updated}</span>}
        </p>

        <div className="map-layers">
          <label className="map-layer">
            <input type="checkbox" checked={showSpots} onChange={(e) => setShowSpots(e.target.checked)} />
            <span className="poi-dot poi-stop" aria-hidden="true" />
            Spots Pokémon GO <em>({spots.length})</em>
          </label>
          <p className="map-layer-note">PokéStops &amp; arènes (Wayspots Niantic VPS).</p>
        </div>
      </div>

      {loading && !errMsg && <div className="map-loading">Chargement de la carte…</div>}
      {errMsg && (
        <div className="map-loading">
          <span>Impossible d'afficher la carte.</span>
          <code className="map-err-detail">{errMsg}</code>
        </div>
      )}
    </div>
  );
}
