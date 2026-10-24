import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'
import { chatApi } from '@/lib/api/endpoints'
import type { Attachment, Message } from '@/types/schemas'

interface Draft {
  text: string
  attachments: Attachment[]
  quickReplyId?: string
}

/** Histórico + envio de mensagens de uma sessão do chat (com mensagem otimista). */
export function useChat(sessionId: string, sessionToken: string) {
  const qc = useQueryClient()
  const key = ['chat', sessionId] as const

  const messages = useQuery({
    queryKey: key,
    queryFn: () => chatApi.messages(sessionId, sessionToken),
    staleTime: Infinity,
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2,
  })

  const send = useMutation({
    mutationFn: (d: Draft) =>
      chatApi.sendMessage(sessionId, sessionToken, {
        text: d.text,
        attachmentIds: d.attachments.map((a) => a.id),
        quickReplyId: d.quickReplyId ?? null,
      }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: key })
      const tmp: Message = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        kind: 'text',
        text: d.text,
        createdAt: new Date().toISOString(),
        attachments: d.attachments,
      }
      qc.setQueryData<Message[]>(key, (old = []) => [...old, tmp])
      return { tmpId: tmp.id }
    },
    onSuccess: ({ userMessage, agentMessage }, _d, ctx) => {
      qc.setQueryData<Message[]>(key, (old = []) => [...old.filter((m) => m.id !== ctx.tmpId), userMessage, agentMessage])
      // Every successful turn can update an already displayed form revision.
      void qc.invalidateQueries({ queryKey: ['chat', 'form'] })
    },
    onError: (_e, _d, ctx) =>
      qc.setQueryData<Message[]>(key, (old = []) => old.filter((m) => m.id !== ctx?.tmpId)),
  })

  const upload = (file: File) => chatApi.uploadAttachment(sessionId, sessionToken, file)

  return { messages, send, upload }
}
