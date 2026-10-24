import { useEffect, useRef } from 'react'
import { LogOut } from 'lucide-react'
import { ApiError } from '@/lib/api/client'
import { ErrorState, Skeleton } from '@/components/ui'
import type { Contact } from '@/types/schemas'
import { Composer } from './Composer'
import { MessageBubble, TypingIndicator } from './MessageBubble'
import { useChat } from './useChat'

interface Props {
  sessionId: string
  sessionToken: string
  contact: Contact
  onExit: () => void
}

export function ChatWindow({ sessionId, sessionToken, contact, onExit }: Props) {
  const { messages, send, upload } = useChat(sessionId, sessionToken)
  const end = useRef<HTMLDivElement>(null)

  // sessão expirada/inválida no back → volta para a identificação
  const invalid = messages.error instanceof ApiError && messages.error.status === 401
  useEffect(() => {
    if (invalid) onExit()
  }, [invalid, onExit])

  const list = messages.data ?? []
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [list.length, send.isPending])

  const lastAgentId = [...list].reverse().find((m) => m.role === 'agent')?.id
  const lastIsAgent = list.at(-1)?.role === 'agent'

  const sendText = (text: string, attachments: Parameters<typeof send.mutate>[0]['attachments'], quickReplyId?: string) =>
    send.mutate({ text, attachments, quickReplyId })

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="font-title text-lg font-semibold leading-tight">
            aprova<span className="text-cyan">.</span> <span className="font-normal text-muted">implantação</span>
          </p>
          <p className="truncate text-xs text-muted">
            {contact.municipality.name} · {contact.secretariat.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          title="Trocar número ou prefeitura"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-soft hover:text-ink"
        >
          <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto bg-bg px-3 py-4 sm:px-4" aria-live="polite">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.isLoading && (
            <>
              <Skeleton className="h-14 w-3/4" />
              <Skeleton className="ml-auto h-10 w-1/2" />
            </>
          )}
          {messages.isError && !invalid && <ErrorState onRetry={() => messages.refetch()} message="Não foi possível carregar a conversa." />}
          {list.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              showQuickReplies={m.id === lastAgentId && lastIsAgent && !send.isPending}
              onQuickReply={(id, label) => sendText(label, [], id)}
            />
          ))}
          {send.isPending && <TypingIndicator />}
          {send.isError && (
            <p role="alert" className="text-center text-sm text-danger">
              Não foi possível enviar a mensagem. Tente novamente.
            </p>
          )}
          <div ref={end} />
        </div>
      </main>

      <div className="mx-auto w-full max-w-2xl">
        <Composer disabled={send.isPending || messages.isLoading} upload={upload} onSend={(t, a) => sendText(t, a)} />
      </div>
    </div>
  )
}
