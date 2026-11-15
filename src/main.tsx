import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import { registerServiceWorker } from './lib/pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateBanner />
    </ErrorBoundary>
  </StrictMode>,
)

registerServiceWorker()
