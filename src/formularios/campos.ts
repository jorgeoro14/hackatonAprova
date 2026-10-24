import type { CategoriaCampo } from "../dashboard/parametros.js";
import type { FormularioImplantacao } from "../implantacao/formulario.js";

export interface CampoColetado {
  chave: string;
  rotulo: string;
  categoria: CategoriaCampo;
  /** "" quando pendente */
  valor: string;
  status: "filled" | "pending";
}

/** Categoria de um caminho do processo (ex.: "taxas.0.baseCalculo"), pela tabela do plano (D2). */
export function categoriaDoCaminho(caminho: string): CategoriaCampo {
  const [bloco, , sub] = caminho.split(".");
  switch (bloco) {
    case "documentos": return "documento";
    case "taxas": return "taxa";
    case "setores": return "setor";
    case "despachos": return "despacho";
    case "formulario": return "campo_formulario";
    case "baseLegal": return "base_legal";
    case "fluxo": return caminho === "fluxo.prazoTotalDias" || sub === "prazoDias" ? "prazo" : "etapa";
    default: return "outro";
  }
}

const lista = (xs: string[]) => xs.join("; ");

/**
 * Converte o formulário em itens de regra coletados (linhas de campos_processo).
 * Cada item preenchido vira um campo; cada pendência vira um campo pendente (valor vazio).
 * `chave` é estável entre revisões para o upsert por (processo, chave).
 */
export function formularioParaCampos(form: Pick<FormularioImplantacao, "processo" | "legislacaoLocal" | "pendencias">): CampoColetado[] {
  const p = form.processo;
  const out: CampoColetado[] = [];
  const add = (chave: string, rotulo: string, valor: string | undefined, categoria = categoriaDoCaminho(chave)) => {
    if (valor !== undefined && valor !== "") out.push({ chave, rotulo, categoria, valor, status: "filled" });
  };

  add("resumo.apresentacao", "Apresentação no Portal", p.resumo?.apresentacao);
  add("resumo.quemPodeSolicitar", "Quem pode solicitar", p.resumo?.quemPodeSolicitar);
  add("resumo.abertura", "Abertura", p.resumo?.abertura.join(", "));

  p.formulario.secoes.forEach((s, i) =>
    s.campos.forEach((c, j) => add(`formulario.secoes.${i}.campos.${j}`, `Campo: ${c.rotulo}`, `${s.titulo} · ${c.tipo}${c.obrigatorio ? " · obrigatório" : ""}`)),
  );
  p.documentos.forEach((d, i) => add(`documentos.${i}`, `Documento: ${d.nome}`, d.obrigatorio ? "obrigatório" : "opcional"));
  p.taxas.forEach((t, i) => add(`taxas.${i}`, `Taxa: ${t.nome}`, t.baseCalculo ?? "base de cálculo a definir"));
  p.setores.forEach((s, i) => add(`setores.${i}`, `Setor: ${s.nome}`, s.tipo));
  p.fluxo.etapas.forEach((e, i) => {
    add(`fluxo.etapas.${i}`, `Etapa: ${e.nome}`, `${e.tipo} · responsável: ${e.responsavel}`);
    if (e.prazoDias !== undefined) add(`fluxo.etapas.${i}.prazoDias`, `Prazo da etapa: ${e.nome}`, `${e.prazoDias} dias`);
  });
  if (p.fluxo.prazoTotalDias !== undefined) add("fluxo.prazoTotalDias", "Prazo total", `${p.fluxo.prazoTotalDias} dias`);
  p.despachos.forEach((d, i) => add(`despachos.${i}`, `Despacho: ${d.nome}`, d.tipo));
  if (p.documentoFinal) add("documentoFinal", "Documento final", p.documentoFinal.nome);
  if (p.baseLegal.length) add("baseLegal", "Base legal", lista(p.baseLegal));
  form.legislacaoLocal.forEach((l, i) => add(`legislacaoLocal.${i}`, "Legislação local", [l.titulo, l.numero].filter(Boolean).join(" · "), "base_legal"));

  for (const pend of form.pendencias) {
    out.push({ chave: `pendencia.${pend.caminho}`, rotulo: pend.descricao, categoria: categoriaDoCaminho(pend.caminho), valor: "", status: "pending" });
  }
  return out;
}
