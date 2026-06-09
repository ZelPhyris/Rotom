/* Shared navbar + footer for every page, injected once so the markup lives in
   a single place. Each page includes <header id="site-nav"></header> (and
   optionally <footer id="site-footer"></footer>); this fills them and marks the
   active link. Runs before auth.js, which then wires the login button. */

const DISCORD_INVITE = "https://discord.gg/"; // TODO: replace with the real Pau server invite
const GITHUB_URL = "https://github.com/ZelPhyris/Rotom";

const PAGES = [
  { href: "index.html", label: "Accueil" },
  { href: "carte.html", label: "Carte" },
  { href: "sorties.html", label: "Sorties" },
  { href: "communaute.html", label: "Communauté" },
  { href: "guides.html", label: "Guides" },
];

const DISCORD_SVG = `<svg viewBox="0 -28.5 256 256" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193a161.094 161.094 0 0 0 13.853-22.529 134.41 134.41 0 0 1-21.823-10.611c1.832-1.355 3.624-2.772 5.356-4.23 42.123 19.702 87.89 19.702 129.51 0 1.752 1.458 3.544 2.875 5.355 4.23a134.012 134.012 0 0 1-21.863 10.63 161.57 161.57 0 0 0 13.852 22.51c21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.359ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z"/></svg>`;

// current page filename ("" or "/" -> index.html)
const current = (() => {
  const f = location.pathname.split("/").pop();
  return f && f.endsWith(".html") ? f : "index.html";
})();

function navbarHTML() {
  const links = PAGES.map(
    (p) => `<a href="${p.href}"${p.href === current ? ' class="active"' : ""}>${p.label}</a>`,
  ).join("");
  return `
    <a class="brand" href="index.html">
      <span class="dot"></span>
      <span class="brand-text">Rotom<small>Pau · Pokémon GO</small></span>
    </a>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false">&#9776;</button>
    <nav class="nav-links" id="nav-links">${links}</nav>
    <div class="nav-right">
      <button type="button" class="btn-discord" id="login-btn" hidden>${DISCORD_SVG} Se connecter</button>
      <div class="user-menu" id="user-menu" hidden>
        <img id="user-avatar" class="avatar" alt="" width="32" height="32" />
        <span id="user-name" class="user-name"></span>
        <button type="button" class="logout-btn" id="logout-btn">Déconnexion</button>
      </div>
    </div>`;
}

function footerHTML() {
  return `
    <div class="footer-inner">
      <span>Rotom — communauté Pokémon GO de Pau</span>
      <nav class="footer-links">
        <a href="index.html#apropos">À propos</a>
        <a href="${DISCORD_INVITE}" target="_blank" rel="noopener">Discord</a>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </div>`;
}

const nav = document.getElementById("site-nav");
if (nav) {
  nav.className = "navbar";
  nav.innerHTML = navbarHTML();
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  toggle?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

const foot = document.getElementById("site-footer");
if (foot) {
  foot.className = "site-footer";
  foot.innerHTML = footerHTML();
}

// expose invite for page CTAs
window.ROTOM = { DISCORD_INVITE, GITHUB_URL };
