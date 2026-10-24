import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/lib/api/authStore'
import { ThemeScope } from '@/lib/theme/ThemeScope'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/** Casca do dashboard: escuro por padrão, com toggle; menu muda conforme o papel. */
export function DashboardLayout() {
  const role = useAuthStore((s) => s.user!.role)
  const [menu, setMenu] = useState(false)
  return (
    <ThemeScope className="flex">
      <a href="#conteudo" className="sr-only z-50 rounded-lg bg-cyan px-3 py-2 text-on-cyan focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Pular para o conteúdo</a>
      <Sidebar role={role} open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenu(true)} />
        <main id="conteudo" tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">
          <Outlet />
        </main>
      </div>
    </ThemeScope>
  )
}
