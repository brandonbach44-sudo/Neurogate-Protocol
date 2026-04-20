import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuditProvider } from './lib/audit'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuditProvider>
      <App />
    </AuditProvider>
  </StrictMode>,
)
