import { Component, type ReactNode } from 'react'

/** Evita tela branca se algo quebrar na renderização. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Algo deu errado</h1>
          <p style={{ color: '#5e6466' }}>Recarregue a página para continuar.</p>
          <button type="button" onClick={() => location.reload()} style={{ marginTop: 12, padding: '8px 16px' }}>Recarregar</button>
        </div>
      </div>
    )
  }
}
