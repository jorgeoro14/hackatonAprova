import { useEffect } from 'react'

/** Título da aba por tela (leitores de tela anunciam a mudança de página). */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Aprova Implantação`
  }, [title])
}
