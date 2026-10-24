import { Button } from '@/components/ui'
import type { Formulario } from '@/types/schemas'

/** Source-backed specification shared by municipal and implementer views. */
export function SpecificationEvidence({ form }: { form: Formulario }) {
  const evidence = new Map((form.evidenciasLegais ?? []).map((item) => [item.id, item]))
  const citations = form.citacoesRequisitos ?? []
  const changes = form.alteracoesCampos ?? []
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(form, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `especificacao-${form.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return (
    <details className="my-3 rounded-xl border border-line p-3">
      <summary className="cursor-pointer font-medium">Especificação, alterações e referências legais</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p>{changes.length} alteração(ões) de campos · {citations.length} referência(s) vinculada(s)</p>
        {changes.map((change) => <details key={change.fieldId}>
          <summary>{({ add_field: 'Incluído', update_field: 'Alterado', remove_field: 'Removido' })[change.action]}: {change.fieldId}</summary>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ antes: change.before, depois: change.after }, null, 2)}</pre>
        </details>)}
        {citations.length === 0 && <p>Nenhuma exigência legal foi vinculada a um artigo verificável nesta especificação.</p>}
        {citations.map((citation, index) => {
          const source = evidence.get(citation.evidenceId)
          return <article key={`${citation.evidenceId}-${index}`} className="rounded-lg border border-line p-2">
            <p className="font-medium">{citation.requirement}</p>
            <p className="text-xs text-muted">Campo ou seção: {citation.caminho}</p>
            <blockquote className="my-2 border-l-2 border-cyan pl-2">{citation.quote}</blockquote>
            {source && <a className="underline" href={source.sourceUrl} target="_blank" rel="noreferrer">{source.documentId} · {source.article} · fonte oficial</a>}
            <p className="text-xs text-muted">Fundamento e aplicabilidade sujeitos à revisão humana.</p>
          </article>
        })}
        <p className="text-xs text-muted">O JSON representa a última revisão salva. Edições locais ainda não enviadas não estão incluídas.</p>
        <Button variant="ghost" onClick={download}>Baixar especificação JSON</Button>
      </div>
    </details>
  )
}
