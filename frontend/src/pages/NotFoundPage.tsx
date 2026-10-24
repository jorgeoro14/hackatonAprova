import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui'
import { ThemeScope } from '@/lib/theme/ThemeScope'
import { useTitle } from '@/lib/utils/useTitle'

export function NotFoundPage() {
  useTitle('Página não encontrada')
  return (
    <ThemeScope fixed="light" className="grid place-items-center px-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <SearchX size={36} className="text-muted" />
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted">O endereço não existe ou foi movido.</p>
        <Link to="/"><Button>Ir para o início</Button></Link>
      </div>
    </ThemeScope>
  )
}
