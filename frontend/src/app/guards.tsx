import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/api/authStore'
import type { Role } from '@/types/schemas'
import { ForbiddenPage } from '@/pages/ForbiddenPage'

const isExpired = (expiresAt: string | null) => !expiresAt || new Date(expiresAt).getTime() <= Date.now()

/** Exige login válido; senão manda para /login guardando a rota de origem. */
export function RequireAuth() {
  const { token, user, expiresAt } = useAuthStore()
  const location = useLocation()
  if (!token || !user || isExpired(expiresAt)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

/** Restringe uma rota a um papel (a segurança real é do back; aqui só a UI). */
export function RequireRole({ role }: { role: Role }) {
  const user = useAuthStore((s) => s.user)
  return user?.role === role ? <Outlet /> : <ForbiddenPage />
}
