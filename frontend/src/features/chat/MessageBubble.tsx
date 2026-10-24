import { FileText } from 'lucide-react'
import type { Message } from '@/types/schemas'
import { cn } from '@/lib/utils/cn'
import { useChatSession } from './ChatContext'
import { FormularioCard } from './formulario/FormularioCard'
import { Markdown } from './Markdown'

const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

interface Props {
  message: Message
  /** Só a última mensagem do agente mostra as respostas rápidas. */
  showQuickReplies: boolean
  onQuickReply: (id: string, label: string) => void
}

export function MessageBubble({ message, showQuickReplies, onQuickReply }: Props) {
  const mine = message.role === 'user'
  return (
    <div className={cn('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
          mine ? 'rounded-br-md bg-cyan text-on-cyan' : 'rounded-bl-md border border-line bg-surface text-ink',
        )}
      >
        {message.text && <Markdown text={message.text} />}

        {message.attachments.length > 0 && (
          <ul className={cn('flex flex-col gap-1.5', message.text && 'mt-2')}>
            {message.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-sm">
                <FileText size={16} className="shrink-0" />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 opacity-70">{kb(a.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}

      </div>

      {message.kind === 'form' && message.formularioId && <FormCardSlot formularioId={message.formularioId} />}

      {showQuickReplies && message.kind === 'quick_replies' && (
        <div className="flex flex-wrap gap-2">
          {message.quickReplies?.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => onQuickReply(q.id, q.label)}
              className="rounded-full border border-cyan bg-surface px-3.5 py-1.5 text-sm font-medium text-petrol transition hover:bg-soft"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
      <span className="px-1 text-[11px] text-muted">{time(message.createdAt)}</span>
    </div>
  )
}

function FormCardSlot({ formularioId }: { formularioId: string }) {
  const { sessionId, sessionToken } = useChatSession()
  return <FormularioCard sessionId={sessionId} sessionToken={sessionToken} formularioId={formularioId} />
}

export function TypingIndicator() {
  return (
    <div className="flex items-start" aria-live="polite" aria-label="O assistente está digitando">
      <div className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  )
}
