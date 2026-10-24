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
      <Sidebar role={role} open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </ThemeScope>
  )
}
