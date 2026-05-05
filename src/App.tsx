import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ToolPage from './pages/ToolPage';
import DocsPage from './pages/DocsPage';
import PreProcessingPage from './pages/PreProcessingPage';
import OnboardingPage from './pages/OnboardingPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pages with shared navbar + neural particles */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/tools" element={<PreProcessingPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        {/* Tool has its own header with step indicator */}
        <Route path="/tool" element={<ToolPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
