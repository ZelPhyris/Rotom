/* Rotom — interactive sector map for the Pau Pokemon GO community.
   Loads the zone geometry (sectors.geojson) and live counts (counts.json),
   paints each zone on a heat scale, and keeps individual addresses private:
   a sector only reveals its number once it reaches the anonymity threshold. */

const COLD = [44, 125, 160];
const HOT = [244, 121, 31];
const MUTED = [120, 128, 138];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

// area-weighted centroid of a [lng,lat] ring, returned as [lat,lng] for Leaflet
function centroid(ring) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return [ring[0][1], ring[0][0]];
  return [cy / (6 * a), cx / (6 * a)];
}

async function main() {
  const [geo, data] = await Promise.all([
    fetch("sectors.geojson").then((r) => r.json()),
    fetch("counts.json", { cache: "no-store" }).then((r) => r.json()),
  ]);

  const minVisible = data.minVisiblePlayers ?? 3;
  const counts = data.sectors ?? {};
  const values = Object.values(counts);
  const maxRef = Math.max(minVisible + 5, ...values);

  const heat = (c) => {
    const t = Math.max(0, Math.min(1, (c - minVisible) / (maxRef - minVisible)));
    return [lerp(COLD[0], HOT[0], t), lerp(COLD[1], HOT[1], t), lerp(COLD[2], HOT[2], t)];
  };

  const map = L.map("map", { zoomControl: true, scrollWheelZoom: true });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: "basemap",
  }).addTo(map);

  const layer = L.geoJSON(geo, {
    style: (f) => {
      const c = counts[f.properties.name] ?? 0;
      const visible = c >= minVisible;
      const col = visible ? heat(c) : MUTED;
      return {
        color: rgb(col),
        weight: 3,
        opacity: 0.95,
        fillColor: rgb(col),
        fillOpacity: 0.42,
      };
    },
    onEachFeature: (f, lyr) => {
      const name = f.properties.name;
      const c = counts[name] ?? 0;
      const visible = c >= minVisible;
      const body = visible
        ? `<span class="count">${c} joueur${c > 1 ? "s" : ""} actif${c > 1 ? "s" : ""}</span>`
        : `<span class="count">En éveil — moins de ${minVisible} joueurs déclarés</span>`;
      lyr.bindPopup(`<div class="popup"><h3>${name}</h3>${body}</div>`);
      lyr.on("mouseover", () => lyr.setStyle({ fillOpacity: 0.6 }));
      lyr.on("mouseout", () => layer.resetStyle(lyr));
    },
  }).addTo(map);

  map.fitBounds(layer.getBounds(), { padding: [40, 40] });

  // count badges, drawn on top of the zones
  for (const f of geo.features) {
    const name = f.properties.name;
    const c = counts[name] ?? 0;
    const visible = c >= minVisible;
    const col = visible ? heat(c) : MUTED;
    const [lat, lng] = centroid(f.geometry.coordinates[0]);

    const html = `
      <div class="badge-wrap">
        <div class="badge${visible ? "" : " muted"}" style="background:${rgb(col)}">${
      visible ? c : "•••"
    }</div>
        <div class="badge-label">${name}</div>
      </div>`;

    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({ className: "badge-icon", html, iconSize: [0, 0] }),
    }).addTo(map);
  }

  const total = values.filter((c) => c >= minVisible).reduce((a, c) => a + c, 0);
  document.getElementById("total").textContent = total;

  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    if (!Number.isNaN(d.getTime())) {
      document.getElementById("updated").textContent =
        "· mis à jour le " + d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    }
  }
}

main().catch((err) => {
  console.error(err);
  document.getElementById("map").innerHTML =
    '<p style="padding:24px;color:#fff">Impossible de charger la carte. Réessaie dans un instant.</p>';
});
