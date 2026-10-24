import type { FormularioImplantacao } from "../implantacao/formulario.js";
import type { CategoriaCampo } from "./parametros.js";
import type { CampoProcesso } from "./repositorio.js";

/**
 * Converte o FormularioImplantacao em itens de regra (linhas de campos_processo), a base das horas economizadas.
 * A chave é o caminho no processo (o mesmo das pendências, ex.: "taxas.0"); legislacaoLocal fica fora do processo.
 *
 * - status: "pending" se alguma pendência cai no item (no próprio caminho, acima ou abaixo dele);
 *   senão "filled" com o formulário confirmado e "to_validate" antes disso.
 * - Pendência que não corresponde a nenhum item vira um item pendente (valor "") da categoria do caminho.
 * - origem: tudo o que está no formulário passou pelo agente (modelo, servidor ou legislação) → "agente".
 */
export function formularioParaCampos(form: FormularioImplantacao, coletadoEm = form.atualizadoEm): CampoProcesso[] {
  const p = form.processo;
  const itens: Omit<CampoProcesso, "status" | "origem" | "coletadoEm">[] = [];
  const add = (chave: string, categoria: CategoriaCampo, rotulo: string, valor: string) => itens.push({ chave, categoria, rotulo, valor });

  p.documentos.forEach((d, i) => add(`documentos.${i}`, "documento", `Documento: ${d.nome}`, d.obrigatorio ? "obrigatório" : "opcional"));
  p.taxas.forEach((t, i) => add(`taxas.${i}`, "taxa", `Taxa: ${t.nome}`, t.baseCalculo ?? ""));
  p.fluxo.etapas.forEach((e, i) => {
    add(`fluxo.etapas.${i}`, "etapa", `Etapa: ${e.nome}`, e.responsavel);
    if (e.prazoDias !== undefined) add(`fluxo.etapas.${i}.prazoDias`, "prazo", `Prazo: ${e.nome}`, dias(e.prazoDias, e.contagemPrazo));
  });
  if (p.fluxo.prazoTotalDias !== undefined) add("fluxo.prazoTotalDias", "prazo", "Prazo total", dias(p.fluxo.prazoTotalDias));
  p.setores.forEach((s, i) => add(`setores.${i}`, "setor", `Setor: ${s.nome}`, s.tipo));
  p.despachos.forEach((d, i) => add(`despachos.${i}`, "despacho", `Despacho: ${d.nome}`, d.tipo));
  p.formulario.secoes.forEach((s, i) =>
    s.campos.forEach((c, j) => add(`formulario.secoes.${i}.campos.${j}`, "campo_formulario", `Campo: ${c.rotulo}`, c.tipo)),
  );
  p.baseLegal.forEach((id, i) => add(`baseLegal.${i}`, "base_legal", "Base legal", id));
  form.legislacaoLocal.forEach((l, i) =>
    add(`legislacaoLocal.${i}`, "base_legal", `Legislação local: ${l.titulo}`, l.numero ?? l.titulo),
  );
  if (p.resumo) add("resumo", "outro", "Apresentação no Portal", p.resumo.apresentacao);
  if (p.documentoFinal) add("documentoFinal", "outro", "Documento final", p.documentoFinal.nome);

  // a pendência marca o item do próprio caminho, os itens abaixo dela e o item acima dela se for da mesma categoria
  // (ex.: "taxas.0.baseCalculo" marca a taxa; "taxas.0.baseLegal" vira um item de base legal pendente à parte)
  const cobre = (it: (typeof itens)[number], caminho: string) =>
    it.chave === caminho ||
    it.chave.startsWith(`${caminho}.`) ||
    (caminho.startsWith(`${it.chave}.`) && categoriaDoCaminho(caminho) === it.categoria);
  const statusOk = form.status === "confirmado" ? "filled" : "to_validate";

  const campos: CampoProcesso[] = itens.map((it) => {
    const pendente = form.pendencias.some((pd) => cobre(it, pd.caminho));
    return { ...it, status: pendente ? "pending" : statusOk, origem: "agente", coletadoEm: pendente ? null : coletadoEm };
  });

  const vistas = new Set(campos.map((c) => c.chave));
  for (const pd of form.pendencias) {
    if (vistas.has(pd.caminho) || itens.some((it) => cobre(it, pd.caminho))) continue;
    vistas.add(pd.caminho);
    campos.push({
      chave: pd.caminho,
      categoria: categoriaDoCaminho(pd.caminho),
      rotulo: pd.descricao,
      valor: "",
      status: "pending",
      origem: "agente",
      coletadoEm: null,
    });
  }
  return campos;
}

const dias = (n: number, contagem?: "corridos" | "uteis") => `${n} dias${contagem === "uteis" ? " úteis" : ""}`;

/** Categoria pela tabela da D2 (docs/metricas-dashboard.md), a partir do caminho no processo. */
export function categoriaDoCaminho(caminho: string): CategoriaCampo {
  if (/prazo(Total)?Dias$/.test(caminho)) return "prazo";
  if (/(^|\.)baseLegal(\.|$)/.test(caminho) || caminho.startsWith("legislacaoLocal")) return "base_legal";
  const [raiz, sub] = caminho.split(".");
  switch (raiz) {
    case "documentos": return "documento";
    case "taxas": return "taxa";
    case "setores": return "setor";
    case "despachos": return "despacho";
    case "formulario": return "campo_formulario";
    // transição sem despacho que a dispare (lacunas) é um despacho faltando
    case "fluxo": return sub === "etapas" ? "etapa" : sub === "transicoes" ? "despacho" : "outro";
    default: return "outro";
  }
}
