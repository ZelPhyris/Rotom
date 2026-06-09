import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Carte from './pages/Carte.jsx';
import Classement from './pages/Classement.jsx';
import Communaute from './pages/Communaute.jsx';
import Guides from './pages/Guides.jsx';
import Profil from './pages/Profil.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/carte" element={<Carte />} />
          <Route path="/classement" element={<Classement />} />
          <Route path="/communaute" element={<Communaute />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
