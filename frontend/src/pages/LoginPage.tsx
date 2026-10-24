import { useTitle } from '@/lib/utils/useTitle'
import { Navigate } from 'react-router-dom'
import { Card, ThemeToggle } from '@/components/ui'
import { LoginForm } from '@/features/auth/LoginForm'
import { useAuthStore } from '@/lib/api/authStore'
import { ThemeScope } from '@/lib/theme/ThemeScope'

/** Login de implantador e head (username + senha). Segue o tema do dashboard. */
export function LoginPage() {
  useTitle('Entrar')
  const loggedIn = useAuthStore((s) => !!s.token && !!s.user && !!s.expiresAt && new Date(s.expiresAt) > new Date())
  if (loggedIn) return <Navigate to="/dashboard" replace />
  return (
    <ThemeScope className="relative grid place-items-center px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-title text-2xl font-semibold">
          aprova<span className="text-cyan">.</span> <span className="font-normal text-muted">implantação</span>
        </p>
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Entrar</h1>
          <p className="mb-5 mt-1 text-sm text-muted">Acesso para implantadores e head de implantação.</p>
          <LoginForm />
        </Card>
      </div>
    </ThemeScope>
  )
}
