import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { apiGet, apiPost } from '../api.js';
import { TEAMS } from '../config.js';
import DiscordLogo from '../components/DiscordLogo.jsx';

const STATUS_LABEL = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
};

function Submissions({ items }) {
  if (!items.length) return <p className="empty">Aucune déclaration pour l'instant.</p>;
  return (
    <ul className="sub-list">
      {items.map((s) => (
        <li key={s.id} className={`sub-item sub-${s.status}`}>
          <span className="sub-main">
            Niveau {s.level ?? '—'} · {s.totalXp != null ? s.totalXp.toLocaleString('fr-FR') : '—'} XP
          </span>
          <span className="sub-status">{STATUS_LABEL[s.status] ?? s.status}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Profil() {
  const { user, loading, login } = useAuth();
  const [form, setForm] = useState({ level: '', totalXp: '', team: '' });
  const [subs, setSubs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) apiGet('/api/stats/me').then((d) => setSubs(d.submissions)).catch(() => {});
  }, [user]);

  if (loading) return <div className="page"><p className="empty">Chargement…</p></div>;

  if (!user) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Ton profil</h1>
          <p>Connecte-toi avec Discord pour déclarer tes stats et apparaître au classement.</p>
        </div>
        <button type="button" className="btn-discord" onClick={login}>
          <DiscordLogo /> Se connecter avec Discord
        </button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const payload = {
        level: form.level ? Number(form.level) : null,
        totalXp: form.totalXp ? Number(form.totalXp) : null,
        team: form.team || null,
      };
      await apiPost('/api/stats', payload);
      setMsg({ ok: true, text: 'Stats envoyées ! Un modérateur va les valider.' });
      setForm({ level: '', totalXp: '', team: '' });
      const d = await apiGet('/api/stats/me');
      setSubs(d.submissions);
    } catch (err) {
      setMsg({ ok: false, text: 'Échec de l\'envoi : ' + err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Salut {user.username} 👋</h1>
        <p>Déclare tes stats en jeu pour rejoindre le classement. Une capture de ton profil
          peut t'être demandée pour la validation.</p>
      </div>

      <form className="stat-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="level">Niveau (1–50)</label>
          <input
            id="level" type="number" min="1" max="50" value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="xp">XP total</label>
          <input
            id="xp" type="number" min="0" value={form.totalXp}
            onChange={(e) => setForm({ ...form, totalXp: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="team">Équipe</label>
          <select
            id="team" value={form.team}
            onChange={(e) => setForm({ ...form, team: e.target.value })}
          >
            <option value="">—</option>
            {Object.entries(TEAMS).map(([key, t]) => (
              <option key={key} value={key}>{t.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Envoi…' : 'Déclarer mes stats'}
        </button>
      </form>

      {msg && <p className={msg.ok ? 'form-ok' : 'form-err'}>{msg.text}</p>}

      <h2 className="sub-title">Mes déclarations</h2>
      <Submissions items={subs} />
    </div>
  );
}
