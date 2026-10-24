import { getResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)

/**
 * Inicia os mocks. Usa Service Worker; se o navegador não suportar (ex.: painéis
 * embutidos), cai para um interceptador de fetch com os mesmos handlers.
 */
export async function startMocks() {
  try {
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  } catch {
    const realFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const req = new Request(input, init)
      return (await getResponse(handlers, req)) ?? realFetch(input, init)
    }
    console.warn('[mocks] Service Worker indisponível — usando interceptador de fetch.')
  }
}
