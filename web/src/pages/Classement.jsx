import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api.js';
import { TEAMS } from '../config.js';

const fmtInt = (n) => (n == null ? '—' : n.toLocaleString('fr-FR'));

// Each category is one leaderboard. `live` ones are ranked from data we already
// have; the others show a "coming soon" panel until the stat is collected.
const CATEGORIES = [
  { key: 'level', tab: 'Niveau', col: 'Niveau', live: true, value: (e) => e.level, format: fmtInt },
  { key: 'xp', tab: 'XP', col: 'XP total', live: true, value: (e) => e.totalXp, format: fmtInt },
  { key: 'distance', tab: 'Distance', col: 'km', live: false, note: 'Distance parcourue (médaille Jogger).' },
  { key: 'caught', tab: 'Pokémon attrapés', col: 'Attrapés', live: false, note: 'Nombre de Pokémon attrapés (médaille Collector).' },
  { key: 'eggs', tab: 'Œufs éclos', col: 'Œufs', live: false, note: "Nombre d'œufs éclos (médaille Breeder)." },
  { key: 'battles', tab: 'Combats', col: 'Combats', live: false, note: 'Combats gagnés — catégorie en cours de définition.' },
  { key: 'events', tab: 'Participations', col: 'Events', live: false, note: 'Participations aux sorties et raids organisés via le bot.' },
];

function RankCell({ rank }) {
  if (rank <= 3) return <span className={`medal medal-${rank}`}>{rank}</span>;
  return <>{rank}</>;
}

function Board({ entries, category }) {
  const ranked = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter((e) => category.value(e) != null)
      .sort((a, b) => category.value(b) - category.value(a))
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [entries, category]);

  if (ranked.length === 0) {
    return (
      <p className="empty">
        Aucune stat validée pour ce classement. Sois le premier à déclarer ton profil sur la page{' '}
        <Link to="/profil">Profil</Link>.
      </p>
    );
  }

  return (
    <table className="board">
      <thead>
        <tr>
          <th className="board-rank">#</th>
          <th>Dresseur</th>
          <th>Équipe</th>
          <th className="board-num">{category.col}</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((e) => {
          const team = TEAMS[e.team];
          return (
            <tr key={e.discordId}>
              <td className="board-rank"><RankCell rank={e.rank} /></td>
              <td>{e.ign || 'Dresseur inconnu'}</td>
              <td>
                {team ? (
                  <span className="team-pill" style={{ background: team.color }}>{team.label}</span>
                ) : (
                  <span className="team-pill team-none">—</span>
                )}
              </td>
              <td className="board-num">{category.format(category.value(e))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Classement() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);
  const [catKey, setCatKey] = useState('level');

  useEffect(() => {
    apiGet('/api/leaderboard')
      .then((d) => setEntries(d.entries))
      .catch(() => setError(true));
  }, []);

  const category = CATEGORIES.find((c) => c.key === catKey);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Classements des dresseurs</h1>
        <p>
          Le top de Pau, catégorie par catégorie. Les chiffres sont déclarés par les joueurs
          (capture de profil) puis validés par les modérateurs. Tu veux y figurer ?{' '}
          <Link to="/profil">Déclare tes stats →</Link>
        </p>
      </div>

      <div className="board-tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === catKey}
            className={`board-tab${c.key === catKey ? ' active' : ''}`}
            onClick={() => setCatKey(c.key)}
          >
            {c.tab}
            {!c.live && <span className="soon-tag">bientôt</span>}
          </button>
        ))}
      </div>

      {category.note && <p className="cat-note">{category.note}</p>}

      {error && <p className="empty">Impossible de charger le classement pour le moment.</p>}

      {!error && category.live && entries === null && <p className="empty">Chargement…</p>}

      {!error && category.live && entries && <Board entries={entries} category={category} />}

      {!error && !category.live && (
        <div className="soon-panel">
          <h3>Ce classement arrive bientôt</h3>
          <p>
            Les joueurs pourront déclarer cette stat via une capture de l'écran « Médailles » :
            la lecture sera assistée automatiquement, puis validée par un modérateur avant
            d'apparaître ici.
          </p>
        </div>
      )}
    </div>
  );
}
