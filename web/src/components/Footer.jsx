import { DISCORD_INVITE, GITHUB_URL } from '../config.js';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span>Rotom — communauté Pokémon GO de Pau</span>
        <div className="footer-links">
          <a href={DISCORD_INVITE} target="_blank" rel="noreferrer">
            Discord
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
