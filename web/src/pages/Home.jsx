import { Link } from 'react-router-dom';
import { DISCORD_INVITE } from '../config.js';
import Icon from '../components/Icons.jsx';

const FEATURES = [
  { to: '/carte', icon: 'map', title: 'La carte des secteurs', text: 'Visualise où la communauté joue, secteur par secteur, sans jamais exposer une adresse.' },
  { to: '/classement', icon: 'trophy', title: 'Le classement', text: 'Le top des dresseurs par niveau et XP en jeu, validé par les modérateurs.' },
  { to: '/communaute', icon: 'users', title: 'La communauté', text: 'Les chiffres vivants de Pau : combien on est, où, et à quel rythme on joue.' },
  { to: '/guides', icon: 'book', title: 'Les guides', text: 'Bien démarrer, trouver les bons spots à raids, participer à une sortie.' },
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

      <section className="intro" id="apropos">
        <div className="intro-inner">
          <figure className="intro-photo">
            <div className="intro-frame">
              <img src="/pau.jpg" alt="Le kiosque à musique du parc Beaumont, à Pau" loading="lazy" />
            </div>
            <figcaption className="intro-credit">
              Kiosque à musique, parc Beaumont, Pau — © Adrien Basse-Cathalinat / Ville de Pau
            </figcaption>
          </figure>
          <div className="intro-text">
            <h2>C'est quoi, POGO PAU ?</h2>
            <p>
              Avant tout, c'est la <strong>communauté des dresseurs Pokémon GO de Pau</strong> et de ses
              environs. Ici, on joue ensemble plutôt que chacun dans son coin : sorties sur le terrain,
              <strong> raids</strong> montés à plusieurs, échanges et coups de main entre joueurs de tous niveaux,
              dans la bonne humeur.
            </p>
            <p>
              Pour faciliter tout ça, un bot Discord et ce site accompagnent la communauté au quotidien :
              on y organise les <strong>sorties et les raids</strong>, on suit le{' '}
              <strong>classement</strong> des dresseurs et on garde le lien entre tout le monde. Débutant ou
              vétéran, il y a toujours quelqu'un avec qui jouer près de chez toi.
            </p>
          </div>
        </div>
      </section>

      <section className="cards-section">
        <div className="cards">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="card">
              <div className="card-emoji">
                <Icon name={f.icon} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
