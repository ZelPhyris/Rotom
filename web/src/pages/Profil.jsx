import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { apiGet } from '../api.js';
import { TEAMS, DISCORD_INVITE } from '../config.js';
import DiscordLogo from '../components/DiscordLogo.jsx';

const fmtInt = (n) => (n == null ? '—' : n.toLocaleString('fr-FR'));
const fmtKm = (n) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

function avatarUrl(user) {
  if (!user?.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`;
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Profil() {
  const { user, loading, login } = useAuth();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    if (user) apiGet('/api/profile/me').then((d) => setProfile(d.profile)).catch(() => setProfile(null));
  }, [user]);

  if (loading) {
    return <div className="page"><p className="empty">Chargement…</p></div>;
  }

  if (!user) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Ton profil</h1>
          <p>Connecte-toi avec Discord pour voir tes stats et apparaître au classement.</p>
        </div>
        <button type="button" className="btn-discord" onClick={login}>
          <DiscordLogo /> Se connecter avec Discord
        </button>
      </div>
    );
  }

  const team = profile ? TEAMS[profile.team] : null;
  const hasStats =
    profile &&
    [profile.level, profile.totalXp, profile.pokedex, profile.distance, profile.pokestops].some((v) => v != null);

  const stats = [
    { lab: 'Niveau', val: profile?.level ?? '—' },
    { lab: 'XP total', val: fmtInt(profile?.totalXp) },
    { lab: 'Distance', val: fmtKm(profile?.distance) },
    { lab: 'Pokémon attrapés', val: fmtInt(profile?.pokedex) },
    { lab: 'PokéStops', val: fmtInt(profile?.pokestops) },
  ];
  const updated = fmtDate(profile?.updatedAt);

  return (
    <div className="page">
      <div className="profile-header">
        <img className="profile-avatar" src={avatarUrl(user)} alt="" width="72" height="72" />
        <div>
          <h1 className="profile-name">{profile?.ign || user.username}</h1>
          <p className="profile-sub">
            {profile?.ign ? `${user.username} · ` : ''}Dresseur de la communauté POGO PAU
          </p>
        </div>
      </div>

      {profile === undefined ? (
        <p className="empty">Chargement de tes stats…</p>
      ) : hasStats ? (
        <>
          <div className="trainer-card">
            <div className="trainer-stat">
              {team ? (
                <img
                  className="trainer-team-logo"
                  src={`/teams/${profile.team}.webp`}
                  alt={team.label}
                  title={team.label}
                  width="40"
                  height="40"
                />
              ) : (
                <span className="trainer-num">—</span>
              )}
              <span className="trainer-lab">{team ? team.label : 'Équipe'}</span>
            </div>
            {stats.map((s) => (
              <div className="trainer-stat" key={s.lab}>
                <span className="trainer-num">{s.val}</span>
                <span className="trainer-lab">{s.lab}</span>
              </div>
            ))}
          </div>

          <p className="profile-meta">
            <span className={`board-status ${profile.classement ? 'is-in' : 'is-out'}`}>
              {profile.classement ? 'Inscrit au classement' : 'Pas au classement'}
            </span>
            {updated && <span className="profile-updated">Mis à jour le {updated}</span>}
          </p>
        </>
      ) : (
        <div className="trainer-card">
          <p className="empty" style={{ margin: 0 }}>
            Aucune stat enregistrée pour l'instant — déclare-les via le bot pour entrer au classement.
          </p>
        </div>
      )}

      <div className="declare-box">
        <h2>Déclarer ou mettre à jour mes stats</h2>
        <p>
          La déclaration se fait sur Discord : le <strong>bot t'envoie un message privé</strong>, tu
          réponds avec les <strong>captures de ton profil et de tes médailles</strong>, et il
          enregistre tout puis met à jour le classement.
        </p>
        <a className="btn-primary" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
          Ouvrir le Discord
        </a>
      </div>
    </div>
  );
}
