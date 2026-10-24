import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { Button, ErrorState, Skeleton } from '@/components/ui'
import { chatApi } from '@/lib/api/endpoints'
import type { FormularioEdits, Message } from '@/types/schemas'
import { FormProvider, FormularioEditor, countPendentes, makeCtx } from './FormularioEditor'

interface Props {
  sessionId: string
  sessionToken: string
  formularioId: string
}

/** Formulário já preenchido pelo agente: a prefeitura edita o que estiver errado e confirma uma vez. */
export function FormularioCard({ sessionId, sessionToken, formularioId }: Props) {
  const qc = useQueryClient()
  const key = ['chat', 'form', formularioId] as const
  const q = useQuery({ queryKey: key, queryFn: () => chatApi.getFormulario(sessionId, sessionToken, formularioId), staleTime: Infinity })
  const [draft, setDraft] = useState<FormularioEdits | null>(null)

  useEffect(() => {
    if (q.data && !draft) setDraft({ orgao: q.data.orgao, processo: q.data.processo })
  }, [q.data, draft])

  const submit = useMutation({
    mutationFn: (edits: FormularioEdits) => chatApi.submitFormulario(sessionId, sessionToken, formularioId, edits),
    onSuccess: ({ formulario, agentMessage }) => {
      qc.setQueryData(key, formulario)
      qc.setQueryData<Message[]>(['chat', sessionId], (old = []) => [...old, agentMessage])
    },
  })

  if (q.isError) return <ErrorState message="Não foi possível carregar o formulário." onRetry={() => q.refetch()} />
  if (!q.data || !draft) return <Skeleton className="h-48 w-full" />

  const form = q.data
  const sent = form.status === 'confirmado'
  const ctx = makeCtx(draft, setDraft, form, sent || submit.isPending)
  const pend = countPendentes(ctx)

  return (
    <div className="w-full rounded-2xl border border-cyan/60 bg-soft/40 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-title text-base font-semibold">
          <ClipboardList size={18} className="text-petrol" /> {form.processo.nome}
        </p>
        {!sent && pend > 0 && <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">{pend} {pend === 1 ? 'pendência' : 'pendências'}</span>}
      </div>
      {!sent && <p className="mb-3 text-sm text-muted">Confira o que preenchi e corrija qualquer campo clicando nele. Quando estiver certo, envie ao time.</p>}

      <FormProvider value={ctx}>
        <FormularioEditor form={form} />
      </FormProvider>

      <div className="mt-4 flex flex-col gap-2">
        {submit.isError && <p role="alert" className="text-sm text-danger">{submit.error.message}</p>}
        {sent ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 size={18} /> Enviado ao time de implantação</p>
        ) : (
          <>
            {pend > 0 && <p className="text-xs text-muted">Ainda há campos sem informação. Você pode enviar assim mesmo e o time completa depois.</p>}
            <Button size="lg" loading={submit.isPending} onClick={() => submit.mutate(draft)}>Confirmar e enviar ao time</Button>
          </>
        )}
      </div>
    </div>
  )
}
