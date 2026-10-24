import { useTitle } from '@/lib/utils/useTitle'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge, Card, ErrorState, Skeleton } from '@/components/ui'
import { conversationStatusInfo } from '@/features/dashboard/conversations/ConversationsTab'
import { MessageBubble } from '@/features/chat/MessageBubble'
import { ApiError } from '@/lib/api/client'
import { useConversation } from '@/lib/api/hooks'
import { formatDateTime, formatPhone } from '@/lib/utils/format'

/** Transcrição somente leitura de uma conversa da prefeitura com o agente. */
export function ConversationPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useConversation(id)
  const c = q.data
  useTitle(c ? `Conversa com ${c.contactName}` : 'Conversa')
  const back = c ? `/dashboard/clients/${c.clientId}?tab=conversas` : '/dashboard/clients'

  const notFound = q.error instanceof ApiError && q.error.status === 404
  return (
    <div className="flex flex-col gap-5">
      <Link to={back} onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); navigate(-1) } }} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Voltar
      </Link>

      {q.isError ? (
        <ErrorState message={notFound ? 'Conversa não encontrada.' : undefined} onRetry={notFound ? undefined : () => q.refetch()} />
      ) : !c ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{c.contactName}</h1>
              <p className="mt-1 text-sm text-muted">
                {formatPhone(c.contactPhone)} · {c.secretariat} · iniciada em {formatDateTime(c.startedAt)}
              </p>
            </div>
            <Badge tone={conversationStatusInfo[c.status].tone}>{conversationStatusInfo[c.status].label}</Badge>
          </div>

          {c.processesTouched.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Processos tratados:</span>
              {c.processesTouched.map((p) => <Badge key={p} tone="info">{p}</Badge>)}
            </div>
          )}

          <Card className="bg-bg">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              {c.messages.map((m) => (
                <MessageBubble key={m.id} message={m} showQuickReplies={false} onQuickReply={() => undefined} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
