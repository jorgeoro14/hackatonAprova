import { useAuthStore } from '@/lib/api/authStore'
import { EmptyState } from '@/components/ui'
import { useScope } from '@/features/dashboard/filters'

/** Placeholders até as tasks T12–T16; já mostram o escopo ativo. */
function Placeholder({ title, task }: { title: string; task: string }) {
  const user = useAuthStore((s) => s.user)!
  const scope = useScope()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <EmptyState
        title={`${title} (${task})`}
        description={`${user.name} · ${user.role === 'head' ? 'vê todos os implantadores' : 'vê só os seus clientes'} · ${scope.from} → ${scope.to}${scope.implementerId ? ` · implantador ${scope.implementerId}` : ''}`}
      />
    </div>
  )
}

export const TeamPage = () => <Placeholder title="Time" task="T16" />
