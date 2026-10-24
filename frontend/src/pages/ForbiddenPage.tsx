import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui'

export function ForbiddenPage() {
  return (
    <div className="grid place-items-center px-6 py-24 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <ShieldAlert size={36} className="text-warning" />
        <h1 className="text-xl font-semibold">Sem permissão</h1>
        <p className="text-sm text-muted">Esta área é restrita à head de implantação.</p>
        <Link to="/dashboard"><Button variant="secondary">Voltar ao início</Button></Link>
      </div>
    </div>
  )
}
