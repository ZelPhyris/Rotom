/* Community stats from counts.json — same source as the map, same privacy rule:
   a sector only shows its number from minVisiblePlayers (3) players. */

const COLD = [44, 125, 160];
const HOT = [244, 121, 31];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

async function main() {
  const grid = document.getElementById("sectors");
  let data;
  try {
    data = await fetch("counts.json", { cache: "no-store" }).then((r) => r.json());
  } catch {
    grid.innerHTML = '<p class="empty">Impossible de charger les chiffres pour le moment.</p>';
    return;
  }

  const minVisible = data.minVisiblePlayers ?? 3;
  const entries = Object.entries(data.sectors ?? {});
  const maxRef = Math.max(minVisible + 5, ...entries.map(([, c]) => c));
  const heat = (c) => {
    const t = Math.max(0, Math.min(1, (c - minVisible) / (maxRef - minVisible)));
    return `rgb(${lerp(COLD[0], HOT[0], t)},${lerp(COLD[1], HOT[1], t)},${lerp(COLD[2], HOT[2], t)})`;
  };

  let total = 0;
  const cards = entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const visible = count >= minVisible;
      if (visible) total += count;
      const color = visible ? heat(count) : "rgb(120,128,138)";
      const value = visible ? count : "•••";
      const sub = visible ? `joueur${count > 1 ? "s" : ""}` : `moins de ${minVisible} déclarés`;
      return `
        <div class="sector-card">
          <div class="sector-badge" style="background:${color}">${value}</div>
          <div class="sector-info">
            <h3>${name}</h3>
            <p>${sub}</p>
          </div>
        </div>`;
    })
    .join("");

  grid.innerHTML = cards || '<p class="empty">Aucun secteur configuré pour l\'instant.</p>';
  document.getElementById("total").textContent = total;

  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    if (!Number.isNaN(d.getTime())) {
      document.getElementById("updated").textContent =
        "Mis à jour le " + d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    }
  }
}

main();
