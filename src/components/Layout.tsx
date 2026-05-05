import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import NeuralParticles from './NeuralParticles';

export default function Layout() {
  return (
    <div
      className="min-h-screen relative"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 40%, #f1f5f9 100%)',
      }}
    >
      <NeuralParticles />
      <Navbar />
      <main className="relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
