import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <BrowserRouter>
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
