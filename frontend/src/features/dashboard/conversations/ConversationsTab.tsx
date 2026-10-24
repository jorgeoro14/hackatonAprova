import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, EmptyState, ErrorState, Pagination, Skeleton, Table, TBody, TD, TH, THead, TR, type Tone } from '@/components/ui'
import { useClientConversations } from '@/lib/api/hooks'
import { formatDateTime, formatPhone } from '@/lib/utils/format'
import type { Conversation } from '@/types/schemas'

export const conversationStatusInfo: Record<Conversation['status'], { label: string; tone: Tone }> = {
  active: { label: 'Ativa', tone: 'info' },
  waiting_confirmation: { label: 'Aguardando confirmação', tone: 'warning' },
  closed: { label: 'Encerrada', tone: 'neutral' },
}

const PAGE_SIZE = 10

export function ConversationsTab({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const list = useClientConversations(clientId, { page, pageSize: PAGE_SIZE })
  const items = list.data?.items ?? []
  const open = (id: string) => navigate(`/dashboard/conversations/${id}`)

  if (list.isError) return <ErrorState onRetry={() => list.refetch()} />
  if (list.isLoading) return <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
  if (items.length === 0) return <EmptyState title="Nenhuma conversa ainda" description="Quando a prefeitura falar com o agente, as conversas aparecem aqui." />

  return (
    <>
      <Table>
        <THead>
          <TR><TH>Contato</TH><TH>Secretaria</TH><TH>Processos tratados</TH><TH className="text-right">Msgs</TH><TH>Última atividade</TH><TH>Status</TH></TR>
        </THead>
        <TBody>
          {items.map((c) => (
            <TR key={c.id} tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === 'Enter' && open(c.id)}>
              <TD>
                <p className="font-medium">{c.contactName}</p>
                <p className="text-xs text-muted">{formatPhone(c.contactPhone)}</p>
              </TD>
              <TD className="text-muted">{c.secretariat}</TD>
              <TD className="max-w-56 truncate text-muted">{c.processesTouched.join(', ') || '—'}</TD>
              <TD className="tabular text-right">{c.messagesCount}</TD>
              <TD className="whitespace-nowrap text-muted">{formatDateTime(c.lastMessageAt)}</TD>
              <TD><Badge tone={conversationStatusInfo[c.status].tone}>{conversationStatusInfo[c.status].label}</Badge></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data!.total} onChange={setPage} />
    </>
  )
}
