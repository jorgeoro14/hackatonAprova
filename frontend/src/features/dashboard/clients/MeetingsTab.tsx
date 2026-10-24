import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, EmptyState, ErrorState, Input, Modal, Skeleton, Table, TBody, TD, TH, THead, TR, Textarea } from '@/components/ui'
import { useAddMeeting, useMeetings } from '@/lib/api/hooks'
import { formatDate, formatDuration } from '@/lib/utils/format'

const today = () => new Date().toISOString().slice(0, 10)

export function MeetingsTab({ clientId }: { clientId: string }) {
  const meetings = useMeetings(clientId)
  const add = useAddMeeting(clientId)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today())
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')

  const minutes = Number(duration)
  const valid = !!date && Number.isFinite(minutes) && minutes > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    add.mutate(
      { date, durationMinutes: Math.round(minutes), notes: notes.trim() || undefined },
      { onSuccess: () => { setOpen(false); setNotes(''); setDuration('60') } },
    )
  }

  const list = [...(meetings.data ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Cada reunião registrada entra no indicador de reuniões. Quanto menos, melhor.</p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={16} /> Registrar reunião</Button>
      </div>

      {meetings.isError ? (
        <ErrorState onRetry={() => meetings.refetch()} />
      ) : meetings.isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <EmptyState title="Nenhuma reunião registrada" description="Isso é bom: a coleta está acontecendo pelo chat." />
      ) : (
        <Table>
          <THead><TR><TH>Data</TH><TH>Duração</TH><TH>Observações</TH></TR></THead>
          <TBody>
            {list.map((m) => (
              <TR key={m.id}><TD className="whitespace-nowrap">{formatDate(m.date)}</TD><TD className="tabular whitespace-nowrap">{formatDuration(m.durationMinutes)}</TD><TD className="text-muted">{m.notes || '—'}</TD></TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal open={open} title="Registrar reunião" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Duração (min)" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} error={!valid ? 'Informe uma duração válida.' : undefined} />
          </div>
          <Textarea label="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {add.isError && <p role="alert" className="text-sm text-danger">{add.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={add.isPending} disabled={!valid}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
