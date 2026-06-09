import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { NAV } from '../config.js';
import { useAuth } from '../auth.jsx';
import DiscordLogo from './DiscordLogo.jsx';

function avatarUrl(user) {
  if (!user?.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
}

export default function Navbar() {
  const { user, loading, login, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="navbar">
      <Link to="/" className="brand" onClick={() => setOpen(false)}>
        <span className="dot" />
        <span className="brand-text">
          Rotom
          <small>Pokémon GO · Pau</small>
        </span>
      </Link>

      <nav className={`nav-links${open ? ' open' : ''}`}>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="nav-right">
        {loading ? null : user ? (
          <div className="user-menu">
            <img className="avatar" src={avatarUrl(user)} alt="" width="28" height="28" />
            <span className="user-name">{user.username}</span>
            <button type="button" className="logout-btn" onClick={logout}>
              Déconnexion
            </button>
          </div>
        ) : (
          <button type="button" className="btn-discord" onClick={login}>
            <DiscordLogo />
            Se connecter
          </button>
        )}
      </div>

      <button
        type="button"
        className="nav-toggle"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
    </header>
  );
}
