import { Link } from 'react-router-dom';
import { DISCORD_INVITE } from '../config.js';

const FEATURES = [
  { to: '/carte', emoji: '🗺️', title: 'La carte des secteurs', text: 'Visualise où la communauté joue, secteur par secteur, sans jamais exposer une adresse.' },
  { to: '/classement', emoji: '🏆', title: 'Le classement', text: 'Le top des dresseurs par niveau et XP en jeu, validé par les modérateurs.' },
  { to: '/communaute', emoji: '👥', title: 'La communauté', text: 'Les chiffres vivants de Pau : combien on est, où, et à quel rythme on joue.' },
  { to: '/guides', emoji: '📘', title: 'Les guides', text: 'Bien démarrer, trouver les bons spots à raids, participer à une sortie.' },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-badge">Communauté Pokémon GO · Pau</span>
          <h1>On n'est jamais seul à jouer près de chez soi.</h1>
          <p className="hero-lead">
            POGO PAU rassemble les dresseurs de Pau : une carte des secteurs, un classement,
            les sorties et tout ce qu'il faut pour jouer ensemble.
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
              Rejoindre le Discord
            </a>
            <Link className="btn-ghost" to="/carte">
              Voir la carte
            </Link>
          </div>
          <div className="team-dots">
            <span><i className="m" /> Sagesse</span>
            <span><i className="v" /> Bravoure</span>
            <span><i className="i" /> Intuition</span>
          </div>
        </div>
      </section>

      <section className="cards-section">
        <div className="cards">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="card">
              <div className="card-emoji">{f.emoji}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="about" id="apropos">
        <div className="about-inner">
          <h2>C'est quoi, POGO PAU ?</h2>
          <p>
            POGO PAU est l'outil de la communauté Pokémon GO de <strong>Pau</strong> : un bot Discord et
            ce site, pensés pour que personne ne joue dans son coin. On y voit où sont les autres
            dresseurs, on organise des sorties et on suit la progression de chacun.
          </p>
          <p>
            La vie privée passe avant tout : <strong>aucune adresse</strong> n'est affichée, et un
            secteur ne révèle son nombre de joueurs qu'à partir d'un certain seuil.
          </p>
        </div>
      </section>
    </>
  );
}
