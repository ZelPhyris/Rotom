import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Page introuvable</h1>
        <p>Cette page n'existe pas (ou plus).</p>
      </div>
      <Link className="btn-primary" to="/">
        Retour à l'accueil
      </Link>
    </div>
  );
}
