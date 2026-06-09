import { Link } from 'react-router-dom';

const GUIDES = [
  {
    title: 'Bien démarrer dans la communauté',
    body: "Rejoins le Discord, choisis ton secteur dans « Salons et rôles » : c'est ce qui fait vivre la carte et te connecte aux dresseurs proches de chez toi. Présente-toi, et n'hésite pas à demander de l'aide pour tes premiers raids.",
  },
  {
    title: 'Les bons coins à raids',
    body: 'Le centre (Place Royale, Parc Beaumont) concentre beaucoup d\'arènes accessibles à pied. Pour les raids légendaires, regarde les sorties annoncées : à plusieurs, on boucle plus facilement les invitations à distance.',
  },
  {
    title: 'Participer à une sortie',
    body: 'Les sorties sont organisées sur le Discord avec la commande /rdv, qui crée un fil dédié. Viens comme tu es : tous les niveaux sont les bienvenus.',
  },
  {
    title: 'Jouer en respectant tout le monde',
    body: 'On joue dans l\'espace public : on reste discrets, on respecte les lieux (commerces, lieux de culte, monuments) et les autres. La communauté, c\'est avant tout de la bonne ambiance.',
  },
];

export default function Guides() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Guides locaux</h1>
        <p>
          Des repères pour bien jouer à Pau. Tu veux en ajouter un ?{' '}
          <Link to="/profil">Propose-le sur le Discord.</Link>
        </p>
      </div>
      <div className="guides">
        {GUIDES.map((g) => (
          <article className="guide" key={g.title}>
            <h2>{g.title}</h2>
            <p>{g.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
