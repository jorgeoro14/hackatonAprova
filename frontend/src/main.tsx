import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@/styles/index.css'

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    try {
      const { worker } = await import('@/lib/mocks/browser')
      await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
    } catch (e) {
      // ex.: navegador sem suporte a Service Worker — a UI abre, mas sem API simulada
      console.warn('[mocks] MSW não iniciou:', e)
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
