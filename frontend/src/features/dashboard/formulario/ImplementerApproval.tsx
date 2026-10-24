import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Textarea } from '@/components/ui'
import { formsApi } from '@/lib/api/endpoints'

export function ImplementerApproval({ formId, revision, ready }: { formId: string; revision: number; ready: boolean }) {
  const [text, setText] = useState('')
  const qc = useQueryClient()
  const key = ['form-approval', formId] as const
  const history = useQuery({ queryKey: key, queryFn: () => formsApi.approvals(formId) })
  const approve = useMutation({
    mutationFn: () => formsApi.approve(formId, revision, text.trim()),
    onSuccess: (data) => { qc.setQueryData(key, data); setText('') },
  })
  const current = history.data?.revision === revision && history.data.approved
  return <section className="mt-4 space-y-2 border-t border-line pt-3" aria-label="Revisão do implementador">
    <p className="font-medium">Revisão do implementador · revisão {revision}</p>
    <p className="text-xs text-muted">Registra sua aprovação desta versão. A confirmação da prefeitura é uma etapa separada.</p>
    {current && <p className="text-sm text-success">Esta revisão tem aprovação registrada.</p>}
    {history.isError && <p role="alert" className="text-sm text-danger">Não foi possível recuperar o histórico de aprovações.</p>}
    {history.data?.items.map((item) => <p key={item.id} className="text-xs text-muted">
      Revisão {item.revision} · {item.actorName}: {item.text}
    </p>)}
    {!current && <>
      <Textarea label="Confirmação textual" value={text} onChange={(event) => setText(event.target.value)} placeholder="Descreva sua aprovação da especificação revisada." />
      {approve.isError && <p role="alert" className="text-sm text-danger">{approve.error.message}</p>}
      <Button disabled={!ready || !text.trim()} loading={approve.isPending} onClick={() => approve.mutate()}>Registrar aprovação desta revisão</Button>
    </>}
  </section>
}
