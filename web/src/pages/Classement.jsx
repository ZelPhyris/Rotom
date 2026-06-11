import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api.js';
import { TEAMS } from '../config.js';

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';
const fmtInt = (n) => (n == null ? '—' : n.toLocaleString('fr-FR'));
const fmtKm = (n) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

const TIER = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const medalSrc = (cat, tier) => `/medals/${cat.medal}-${tier}.${cat.medalExt}`;

// Each category is one leaderboard with its own Pokémon GO medal. `live` ones
// are ranked from the in-game stats the bot records (pogo_profiles); the others
// show a "coming soon" panel until that stat is collected.
const CATEGORIES = [
  {
    key: 'experience',
    tab: 'Maître dresseurs',
    col: 'Niveau · XP',
    live: true,
    medal: 'experience',
    medalExt: 'png',
    value: (e) => e.totalXp,
    render: (e) => (
      <span className="board-xp">
        <span className="board-xp-lvl">Niv. {e.level ?? '—'}</span>
        <span className="board-xp-xp">{fmtInt(e.totalXp)} XP</span>
      </span>
    ),
  },
  { key: 'distance', tab: 'Distance', col: 'Distance', live: true, medal: 'jogger', medalExt: 'webp', value: (e) => e.distance, format: fmtKm },
  { key: 'caught', tab: 'Pokémon attrapés', col: 'Attrapés', live: true, medal: 'collector', medalExt: 'webp', value: (e) => e.pokedex, format: fmtInt },
  { key: 'pokestops', tab: 'PokéStops', col: 'PokéStops', live: true, medal: 'backpacker', medalExt: 'webp', value: (e) => e.pokestops, format: fmtInt },
  { key: 'eggs', tab: 'Œufs éclos', col: 'Œufs', live: false, medal: 'breeder', medalExt: 'webp', note: "Nombre d'œufs éclos (médaille Éleveur)." },
];

function RankCell({ rank, category }) {
  // Podium (1-3) gets the category medal in gold/silver/bronze; everyone else
  // gets a grey Poké Ball with their number.
  if (rank <= 3) {
    return (
      <img
        className="rank-badge"
        src={medalSrc(category, TIER[rank])}
        alt={`${rank}e place`}
        width="46"
        height="46"
        loading="lazy"
      />
    );
  }
  return (
    <span className="rank-ball" aria-label={`${rank}e place`}>
      <span className="rank-num">{rank}</span>
    </span>
  );
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
        Aucune stat pour ce classement. Sois le premier en déclarant ton profil au bot depuis la page{' '}
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
          <th className="board-num">{category.col}</th>
          <th className="board-team-col" aria-label="Équipe" />
        </tr>
      </thead>
      <tbody>
        {ranked.map((e) => {
          const team = TEAMS[e.team];
          return (
            <tr key={e.discordId}>
              <td className="board-rank"><RankCell rank={e.rank} category={category} /></td>
              <td>
                <span className="board-player">
                  <img
                    className="board-avatar"
                    src={e.avatarUrl || DEFAULT_AVATAR}
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                  />
                  {e.ign || 'Dresseur'}
                </span>
              </td>
              <td className="board-num">
                {category.render ? category.render(e) : category.format(category.value(e))}
              </td>
              <td className="board-team">
                {team && (
                  <img
                    className="team-logo"
                    src={`/teams/${e.team}.webp`}
                    alt={team.label}
                    title={team.label}
                    width="36"
                    height="36"
                    loading="lazy"
                  />
                )}
              </td>
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
  const [catKey, setCatKey] = useState('experience');

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
          Le top de Pau, catégorie par catégorie. Les chiffres proviennent des stats que le bot
          enregistre depuis tes captures de profil. Tu veux y figurer ?{' '}
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
            <img className="board-tab-medal" src={medalSrc(c, 'gold')} alt="" width="20" height="20" />
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
