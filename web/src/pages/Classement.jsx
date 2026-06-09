import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api.js';
import { TEAMS } from '../config.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmtXp = (xp) => (xp == null ? '—' : xp.toLocaleString('fr-FR'));

export default function Classement() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiGet('/api/leaderboard')
      .then((d) => setEntries(d.entries))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Classement des dresseurs</h1>
        <p>
          Le top de Pau par niveau et XP en jeu. Les chiffres sont déclarés par les joueurs
          (capture de profil) puis validés par les modérateurs. Tu veux y figurer ?{' '}
          <Link to="/profil">Déclare tes stats →</Link>
        </p>
      </div>

      {error && <p className="empty">Impossible de charger le classement pour le moment.</p>}
      {!error && entries === null && <p className="empty">Chargement du classement…</p>}
      {!error && entries && entries.length === 0 && (
        <p className="empty">
          Aucune stat validée pour l'instant. Sois le premier à déclarer ton profil sur la page{' '}
          <Link to="/profil">Profil</Link>.
        </p>
      )}

      {entries && entries.length > 0 && (
        <table className="board">
          <thead>
            <tr>
              <th className="board-rank">#</th>
              <th>Dresseur</th>
              <th>Équipe</th>
              <th className="board-num">Niveau</th>
              <th className="board-num">XP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const team = TEAMS[e.team];
              return (
                <tr key={e.discordId}>
                  <td className="board-rank">{MEDALS[e.rank - 1] ?? e.rank}</td>
                  <td>{e.ign || 'Dresseur inconnu'}</td>
                  <td>
                    {team ? (
                      <span className="team-pill" style={{ background: team.color }}>
                        {team.label}
                      </span>
                    ) : (
                      <span className="team-pill team-none">—</span>
                    )}
                  </td>
                  <td className="board-num">{e.level ?? '—'}</td>
                  <td className="board-num">{fmtXp(e.totalXp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
