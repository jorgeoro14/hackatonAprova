import { useState } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { Badge, Card, ErrorState, Skeleton } from '@/components/ui'
import { FormProvider, FormularioEditor, makeCtx } from '@/features/chat/formulario/FormularioEditor'
import { ApiError } from '@/lib/api/client'
import { useForm, useProcessForm } from '@/lib/api/hooks'
import { formatDateTime } from '@/lib/utils/format'
import type { Formulario, FormularioLeitura } from '@/types/schemas'
import { SpecificationEvidence } from '@/features/chat/formulario/SpecificationEvidence'
import { ImplementerApproval } from './ImplementerApproval'

const statusInfo = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  em_revisao: { label: 'Em revisão pela prefeitura', tone: 'warning' },
  confirmado: { label: 'Confirmado pela prefeitura', tone: 'success' },
} as const

/** Formulário do agente em modo leitura: o painel do administrador exibe, nunca edita. */
function FormularioSomenteLeitura({ data }: { data: FormularioLeitura }) {
  const { formulario: form, revision, confirmedAt } = data
  const ctx = makeCtx({ orgao: form.orgao, processo: form.processo }, () => undefined, form as Formulario, true)
  const info = statusInfo[form.status]
  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-title text-base font-semibold">
          <ClipboardList size={18} className="text-petrol" /> {form.processo.nome}
        </p>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted">
        Revisão {revision} · atualizado em {formatDateTime(form.atualizadoEm)}
        {confirmedAt && ` · confirmado em ${formatDateTime(confirmedAt)}`} · {form.pendencias.length} pendência(s) · somente leitura
      </p>
      <FormProvider value={ctx}>
        <FormularioEditor form={form as Formulario} />
      </FormProvider>
      <SpecificationEvidence form={form} />
      <ImplementerApproval formId={form.id} revision={revision} ready={form.status !== 'rascunho'} />
    </div>
  )
}

/** Abre pela mensagem `kind: "form"` da conversa. */
export function FormularioLeituraPorId({ formularioId }: { formularioId: string }) {
  const q = useForm(formularioId)
  if (q.isError) return <ErrorState message="Não foi possível carregar o formulário." onRetry={() => q.refetch()} />
  if (!q.data) return <Skeleton className="h-48 w-full" />
  return <FormularioSomenteLeitura data={q.data} />
}

/** Último formulário do processo; some enquanto o agente ainda não emitiu nenhum (404). */
export function FormularioDoProcesso({ processId }: { processId: string }) {
  const q = useProcessForm(processId)
  const [open, setOpen] = useState(true)
  if (q.isError && q.error instanceof ApiError && q.error.status === 404) return null
  if (q.isError) return <ErrorState message="Não foi possível carregar o formulário." onRetry={() => q.refetch()} />
  if (!q.data) return <Skeleton className="h-16" />
  return (
    <section aria-label="Formulário preenchido pelo agente">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between text-sm font-medium uppercase tracking-wide text-muted hover:text-ink"
      >
        Formulário do agente
        <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>
      {open && <Card className="p-0"><FormularioSomenteLeitura data={q.data} /></Card>}
    </section>
  )
}
