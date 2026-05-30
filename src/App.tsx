import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ToolPage from './pages/ToolPage';
import DocsPage from './pages/DocsPage';
import DocViewerPage from './pages/DocViewerPage';
import PreProcessingPage from './pages/PreProcessingPage';
import OnboardingPage from './pages/OnboardingPage';
import AboutPage from './pages/AboutPage';
import NotFoundPage from './pages/NotFoundPage';
import ContactButton from './components/ContactButton';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Pages with shared navbar + neural particles */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:docId" element={<DocViewerPage />} />
          <Route path="/tools" element={<PreProcessingPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Catch-all 404 inside Layout so it gets the navbar */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Tool has its own header with step indicator */}
        <Route path="/tool" element={<ToolPage />} />
      </Routes>

      {/* Persistent floating contact button on every route */}
      <ContactButton />
    </BrowserRouter>
  );
}

export default App;
