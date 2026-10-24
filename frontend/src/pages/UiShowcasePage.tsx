import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLogin, useMetricsSummary } from '@/lib/api/hooks'
import { ThemeScope } from '@/lib/theme/ThemeScope'
import { formatDelta, formatDuration } from '@/lib/utils/format'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, Select, Skeleton,
  Table, TBody, TD, TH, THead, Tabs, TR, Textarea, ThemeToggle,
} from '@/components/ui'

/** Só em dev (/ui): galeria dos componentes e teste da camada de API com mocks. */
export function UiShowcasePage() {
  const [tab, setTab] = useState<'a' | 'b'>('a')
  const [open, setOpen] = useState(false)
  const login = useLogin()
  const summary = useMetricsSummary({})

  return (
    <ThemeScope className="p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Componentes UI</h1>
          <div className="flex items-center gap-3">
            <Link to="/chat" className="text-sm text-petrol underline">Chat (claro)</Link>
            <ThemeToggle />
          </div>
        </header>

        <Card>
          <CardHeader title="Botões e badges" />
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Perigo</Button>
            <Button loading>Carregando</Button>
            <Badge>Neutro</Badge><Badge tone="info">Info</Badge><Badge tone="success">Sucesso</Badge>
            <Badge tone="warning">Alerta</Badge><Badge tone="danger">Erro</Badge>
          </div>
        </Card>

        <Card>
          <CardHeader title="Campos" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Telefone" placeholder="(51) 99999-8888" hint="Usado para identificar sua prefeitura" />
            <Input label="Com erro" error="Campo obrigatório" defaultValue="" />
            <Select label="Secretaria" placeholder="Selecione" options={[{ value: '1', label: 'Obras' }, { value: '2', label: 'Meio Ambiente' }]} />
            <Textarea label="Observações" placeholder="Digite…" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Tabela e tabs" />
          <Tabs tabs={[{ id: 'a', label: 'Clientes' }, { id: 'b', label: 'Processos' }]} value={tab} onChange={setTab} />
          <div className="mt-4">
            <Table>
              <THead><TR><TH>Prefeitura</TH><TH>Status</TH><TH className="text-right">Processos</TH></TR></THead>
              <TBody>
                <TR><TD>Canoas</TD><TD><Badge tone="success">Em andamento</Badge></TD><TD className="tabular text-right">72 / 100</TD></TR>
                <TR><TD>São Leopoldo</TD><TD><Badge tone="danger">Em risco</Badge></TD><TD className="tabular text-right">18 / 100</TD></TR>
              </TBody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Estados" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Abrir modal</Button>} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <EmptyState title="Nada por aqui" description="Ainda não há conversas." />
            <ErrorState onRetry={() => undefined} />
          </div>
        </Card>

        <Card>
          <CardHeader title="API (mocks MSW)" description="Entra como head e lê /metrics/summary" />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" loading={login.isPending} onClick={() => login.mutate({ username: 'head', password: 'demo123' })}>
              Login head/demo123
            </Button>
            {login.data && <Badge tone="success">Logado: {login.data.user.name}</Badge>}
            {summary.isError && <Badge tone="warning">/metrics sem login → {summary.error.message}</Badge>}
            {summary.data && (
              <span className="tabular text-sm">
                Reuniões {summary.data.meetings.value} ({summary.data.meetings.deltaPct === null ? '—' : formatDelta(summary.data.meetings.deltaPct)}) · Economia {formatDuration(summary.data.hoursSaved.valueMinutes)} · Fluxo {formatDuration(summary.data.flowCreation.avgMinutes)}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => summary.refetch()}>Recarregar métricas</Button>
        </Card>
      </div>

      <Modal open={open} title="Exemplo de modal" onClose={() => setOpen(false)}>
        <p className="text-sm text-muted">Fecha com ESC, clique fora ou no X.</p>
      </Modal>
    </ThemeScope>
  )
}
