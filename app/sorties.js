/* Renders upcoming community outings from events.json.
   The bot can write this file from the /rdv command so the site stays in sync. */

const TYPES = {
  raid: { label: "Raid", className: "tag-raid" },
  balade: { label: "Balade", className: "tag-balade" },
  communaute: { label: "Community Day", className: "tag-communaute" },
};

const fmtDate = (d) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function card(ev) {
  const d = new Date(ev.date);
  const type = TYPES[ev.type] ?? { label: ev.type ?? "Sortie", className: "tag-default" };
  const day = !Number.isNaN(d.getTime()) ? fmtDate(d) : "Date à venir";
  const time = !Number.isNaN(d.getTime()) ? fmtTime(d) : "";
  return `
    <article class="event-card">
      <div class="event-date">
        <span class="event-day">${day}</span>
        ${time ? `<span class="event-time">${time}</span>` : ""}
      </div>
      <div class="event-body">
        <div class="event-head">
          <h3>${ev.title ?? "Sortie"}</h3>
          <span class="tag ${type.className}">${type.label}</span>
        </div>
        <p class="event-meta">${[ev.place, ev.sector].filter(Boolean).join(" · ")}</p>
        ${ev.description ? `<p class="event-desc">${ev.description}</p>` : ""}
      </div>
    </article>`;
}

async function main() {
  const list = document.getElementById("events");
  let data;
  try {
    data = await fetch("events.json", { cache: "no-store" }).then((r) => r.json());
  } catch {
    list.innerHTML = '<p class="empty">Impossible de charger les sorties pour le moment.</p>';
    return;
  }

  const now = Date.now();
  const upcoming = (data.events ?? [])
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return Number.isNaN(t) || t >= now;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) {
    list.innerHTML =
      '<p class="empty">Aucune sortie prévue pour l\'instant. Propose la tienne sur le Discord avec la commande <code>/rdv</code> !</p>';
    return;
  }
  list.innerHTML = upcoming.map(card).join("");
}

main();
