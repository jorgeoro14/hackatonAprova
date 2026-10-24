import { createContext, useContext, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import type { Formulario, FormularioEdits } from '@/types/schemas'
import { getPath, isEmpty, setPath } from './path'

interface Ctx {
  draft: FormularioEdits
  pendentes: Set<string>
  readOnly: boolean
  set: (path: string, value: unknown) => void
  update: (path: string, fn: (list: unknown[]) => unknown[]) => void
}
const FormCtx = createContext<Ctx>(null!)

/** Estado do rascunho editável + helpers por caminho. */
export function makeCtx(draft: FormularioEdits, setDraft: (d: FormularioEdits) => void, form: Formulario, readOnly: boolean): Ctx {
  return {
    draft,
    readOnly,
    pendentes: new Set(form.pendencias.map((p) => `processo.${p.caminho}`)),
    set: (path, value) => setDraft(setPath(draft, path, value)),
    update: (path, fn) => setDraft(setPath(draft, path, fn((getPath(draft, path) as unknown[]) ?? []))),
  }
}
export const FormProvider = FormCtx.Provider

/** Campos que ainda estão pendentes (listados pelo agente) e continuam vazios. */
export function countPendentes(c: Ctx) {
  return [...c.pendentes].filter((p) => isEmpty(getPath(c.draft, p))).length
}

const origemLabel = { modelo: 'Do modelo', servidor: 'Você informou', legislacao: 'Da legislação' } as const

function Block({ title, hint, prefix, children, origens }: { title: string; hint?: string; prefix?: string; children: ReactNode; origens: Formulario['origens'] }) {
  const tags = [...new Set(origens.filter((o) => prefix && o.caminho.startsWith(prefix)).map((o) => o.origem))]
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        <div className="flex gap-1.5">{tags.map((t) => <Badge key={t} tone={t === 'servidor' ? 'success' : 'info'}>{origemLabel[t]}</Badge>)}</div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** Input ligado ao rascunho por caminho; mostra "Falta informar" nos pendentes vazios. */
function Txt({ path, label, long, type = 'text', placeholder }: { path: string; label: string; long?: boolean; type?: 'text' | 'number' | 'email'; placeholder?: string }) {
  const { draft, set, pendentes, readOnly } = useContext(FormCtx)
  const raw = getPath(draft, path)
  const value = raw == null ? '' : String(raw)
  const error = pendentes.has(path) && isEmpty(raw) ? 'Falta informar' : undefined
  const common = { label, value, error, disabled: readOnly, placeholder }
  return long ? (
    <Textarea {...common} className="" onChange={(e) => set(path, e.target.value)} />
  ) : (
    <Input
      {...common}
      type={type}
      onChange={(e) => set(path, type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
    />
  )
}

function Check({ path, label }: { path: string; label: string }) {
  const { draft, set, readOnly } = useContext(FormCtx)
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" disabled={readOnly} checked={!!getPath(draft, path)} onChange={(e) => set(path, e.target.checked)} className="h-4 w-4 accent-[var(--cyan)]" />
      {label}
    </label>
  )
}

function Row({ children, onRemove, name }: { children: ReactNode; onRemove?: () => void; name: string }) {
  const { readOnly } = useContext(FormCtx)
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line/70 p-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">{children}</div>
      {onRemove && !readOnly && (
        <Button variant="ghost" size="sm" aria-label={`Remover ${name}`} onClick={onRemove} className="mt-6 px-2"><Trash2 size={16} /></Button>
      )}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { readOnly } = useContext(FormCtx)
  if (readOnly) return null
  return <Button variant="secondary" size="sm" className="w-fit" onClick={onClick}><Plus size={16} /> {label}</Button>
}

const tiposCampo = [
  ['texto', 'Texto curto'], ['texto_longo', 'Texto longo'], ['numero', 'Número'], ['moeda', 'Valor (R$)'], ['data', 'Data'],
  ['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['cpf_cnpj', 'CPF ou CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['cep', 'CEP'],
  ['endereco', 'Endereço'], ['selecao', 'Escolha uma opção'], ['multipla_escolha', 'Várias opções'], ['sim_nao', 'Sim ou não'], ['anexo', 'Anexo'], ['coordenadas', 'Coordenadas'],
].map(([value, label]) => ({ value, label }))

export function FormularioEditor({ form }: { form: Formulario }) {
  const { draft, set, update, readOnly } = useContext(FormCtx)
  const p = draft.processo
  const o = form.origens

  return (
    <div className="flex flex-col gap-4">
      <Block title="Dados do órgão" prefix="orgao" origens={o}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Txt path="orgao.municipio" label="Município" />
          <Txt path="orgao.orgao" label="Secretaria / órgão" />
          <Txt path="orgao.responsavel.nome" label="Responsável" />
          <Txt path="orgao.responsavel.cargo" label="Cargo" />
          <Txt path="orgao.responsavel.email" label="E-mail" type="email" />
        </div>
      </Block>

      {p.resumo && (
        <Block title="Resumo do serviço" prefix="resumo" origens={o}>
          <Txt path="processo.resumo.apresentacao" label="Como o serviço aparece no Portal" long />
          <Txt path="processo.resumo.quemPodeSolicitar" label="Quem pode solicitar" long />
          <Select
            label="Abertura"
            disabled={readOnly}
            value={p.resumo.abertura.join(',')}
            onChange={(e) => set('processo.resumo.abertura', e.target.value.split(','))}
            options={[
              { value: 'externo', label: 'Externo (Portal)' },
              { value: 'interno', label: 'Interno' },
              { value: 'externo,interno', label: 'Externo e interno' },
            ]}
          />
        </Block>
      )}

      <Block title="Formulário do requerente" hint="O que o cidadão ou empresa preenche ao pedir o serviço" prefix="formulario" origens={o}>
        {p.formulario.secoes.map((sec, si) => (
          <div key={si} className="flex flex-col gap-2">
            <Txt path={`processo.formulario.secoes.${si}.titulo`} label={`Seção ${si + 1}`} />
            {sec.campos.map((c, ci) => {
              const base = `processo.formulario.secoes.${si}.campos.${ci}`
              return (
                <Row key={ci} name={c.rotulo} onRemove={() => update(`processo.formulario.secoes.${si}.campos`, (l) => l.filter((_, i) => i !== ci))}>
                  <Txt path={`${base}.rotulo`} label="Nome do campo" />
                  <Select label="Tipo" disabled={readOnly} value={c.tipo} onChange={(e) => set(`${base}.tipo`, e.target.value)} options={tiposCampo} />
                  <Txt path={`${base}.ajuda`} label="Texto de ajuda" />
                  <div className="flex items-end pb-2"><Check path={`${base}.obrigatorio`} label="Obrigatório" /></div>
                </Row>
              )
            })}
            <AddButton label="Adicionar campo" onClick={() => update(`processo.formulario.secoes.${si}.campos`, (l) => [...l, { id: `campo_${Date.now()}`, rotulo: '', tipo: 'texto', obrigatorio: false }])} />
          </div>
        ))}
      </Block>

      <Block title="Documentos exigidos" prefix="documentos" origens={o}>
        {p.documentos.map((d, i) => (
          <Row key={i} name={d.nome} onRemove={() => update('processo.documentos', (l) => l.filter((_, k) => k !== i))}>
            <Txt path={`processo.documentos.${i}.nome`} label="Documento" />
            <div className="flex items-end pb-2"><Check path={`processo.documentos.${i}.obrigatorio`} label="Obrigatório" /></div>
          </Row>
        ))}
        <AddButton label="Adicionar documento" onClick={() => update('processo.documentos', (l) => [...l, { id: `doc_${Date.now()}`, nome: '', obrigatorio: true }])} />
      </Block>

      <Block title="Taxas" hint="Deixe vazio se o serviço não tem cobrança" prefix="taxas" origens={o}>
        {p.taxas.map((t, i) => (
          <Row key={i} name={t.nome} onRemove={() => update('processo.taxas', (l) => l.filter((_, k) => k !== i))}>
            <Txt path={`processo.taxas.${i}.nome`} label="Nome da taxa" />
            <Txt path={`processo.taxas.${i}.baseCalculo`} label="Como é calculada" long />
          </Row>
        ))}
        <AddButton label="Adicionar taxa" onClick={() => update('processo.taxas', (l) => [...l, { nome: '', baseCalculo: '', baseLegal: [] }])} />
      </Block>

      <Block title="Fluxo do processo" hint="Etapas pelas quais o pedido passa" prefix="fluxo" origens={o}>
        {p.fluxo.etapas.map((e, i) => (
          <Row key={e.id} name={e.nome} onRemove={() => update('processo.fluxo.etapas', (l) => l.filter((_, k) => k !== i))}>
            <Txt path={`processo.fluxo.etapas.${i}.nome`} label={`Etapa ${i + 1}`} />
            <Txt path={`processo.fluxo.etapas.${i}.responsavel`} label="Quem faz" />
            <Txt path={`processo.fluxo.etapas.${i}.prazoDias`} label="Prazo (dias)" type="number" />
          </Row>
        ))}
        <div className="max-w-52"><Txt path="processo.fluxo.prazoTotalDias" label="Prazo total (dias)" type="number" /></div>
        {p.fluxo.transicoes.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Caminhos entre as etapas ({p.fluxo.transicoes.length})</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {p.fluxo.transicoes.map((t, i) => (
                <li key={i}>{nome(p, t.de)} → {nome(p, t.para)}{t.condicao ? ` (${t.condicao})` : ''}</li>
              ))}
            </ul>
          </details>
        )}
      </Block>

      {p.documentoFinal && (
        <Block title="Documento final" hint="O que o requerente recebe ao final" prefix="documentoFinal" origens={o}>
          <div className={cn('grid gap-3 sm:grid-cols-2')}>
            <Txt path="processo.documentoFinal.nome" label="Nome do documento" />
            <Txt path="processo.documentoFinal.assinante" label="Quem assina" />
            <Txt path="processo.documentoFinal.validadeMaximaMeses" label="Validade (meses)" type="number" />
          </div>
        </Block>
      )}
    </div>
  )
}

const nome = (p: FormularioEdits['processo'], id: string) => p.fluxo.etapas.find((e) => e.id === id)?.nome ?? id
