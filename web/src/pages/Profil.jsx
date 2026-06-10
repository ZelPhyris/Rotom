import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { apiGet } from '../api.js';
import { TEAMS, DISCORD_INVITE } from '../config.js';
import DiscordLogo from '../components/DiscordLogo.jsx';

const STATUS_LABEL = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
};

const fmtXp = (n) => (n == null ? '—' : n.toLocaleString('fr-FR'));

function avatarUrl(user) {
  if (!user?.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`;
}

function Submissions({ items }) {
  if (items === null) return <p className="empty">Chargement…</p>;
  if (!items.length) return <p className="empty">Aucune déclaration pour l'instant.</p>;
  return (
    <ul className="sub-list">
      {items.map((s) => (
        <li key={s.id} className={`sub-item sub-${s.status}`}>
          <span className="sub-main">
            Niveau {s.level ?? '—'} · {fmtXp(s.totalXp)} XP
          </span>
          <span className="sub-status">{STATUS_LABEL[s.status] ?? s.status}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Profil() {
  const { user, loading, login } = useAuth();
  const [subs, setSubs] = useState(null);

  useEffect(() => {
    if (user) apiGet('/api/stats/me').then((d) => setSubs(d.submissions)).catch(() => setSubs([]));
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

  const approved = (subs || []).find((s) => s.status === 'approved');
  const team = approved ? TEAMS[approved.team] : null;

  return (
    <div className="page">
      <div className="profile-header">
        <img className="profile-avatar" src={avatarUrl(user)} alt="" width="72" height="72" />
        <div>
          <h1 className="profile-name">{user.username}</h1>
          <p className="profile-sub">Dresseur de la communauté POGO PAU</p>
        </div>
      </div>

      <div className="trainer-card">
        {approved ? (
          <>
            <div className="trainer-stat">
              <span className="trainer-num">{approved.level ?? '—'}</span>
              <span className="trainer-lab">Niveau</span>
            </div>
            <div className="trainer-stat">
              <span className="trainer-num">{fmtXp(approved.totalXp)}</span>
              <span className="trainer-lab">XP total</span>
            </div>
            <div className="trainer-stat">
              {team ? (
                <span className="team-pill" style={{ background: team.color }}>{team.label}</span>
              ) : (
                <span className="team-pill team-none">—</span>
              )}
              <span className="trainer-lab">Équipe</span>
            </div>
          </>
        ) : (
          <p className="empty" style={{ margin: 0 }}>
            Aucune stat validée pour l'instant — déclare-les via le bot pour entrer au classement.
          </p>
        )}
      </div>

      <div className="declare-box">
        <h2>Déclarer ou mettre à jour mes stats</h2>
        <p>
          La déclaration se fait sur Discord : le <strong>bot t'envoie un message privé</strong>, tu
          réponds avec les <strong>captures de ton profil et de tes médailles</strong>, et il
          enregistre tout puis met à jour le classement une fois validé par un modérateur.
        </p>
        <a className="btn-primary" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
          Ouvrir le Discord
        </a>
      </div>

      <h2 className="sub-title">Mes déclarations</h2>
      <Submissions items={subs} />
    </div>
  );
}
