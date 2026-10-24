import { z } from "zod";
import { ProcessoModelo } from "../knowledge/schemas.js";
import { FieldDifference, LegalEvidenceRecord, RequirementCitation } from "../../contracts/implantation-evidence.js";

/**
 * Saída do agente: o formulário de implantação de UM tipo de processo para um órgão.
 * Parte de um ProcessoModelo e registra a origem de cada decisão e o que ainda está pendente.
 * O implantador só revisa: tudo que ele precisa para parametrizar o processo na Aprova está em `processo`.
 *
 * Blocos que o implantador parametriza:
 * - resumo: como o serviço aparece no Portal e na caixa de entrada;
 * - formulario, documentos, taxas: o que o requerente preenche, anexa e paga;
 * - setores + fluxo: etapas, quem responde por cada uma, prazos e transições;
 * - despachos: modelos de despacho por etapa, cada um ligado a uma transição;
 * - documentoFinal: o que é emitido no deferimento.
 */

export const OrigemInformacao = z.enum(["modelo", "servidor", "legislacao"]);

export const Orgao = z.object({
  municipio: z.string().min(1),
  uf: z.string().length(2),
  orgao: z.string().min(1),
  responsavel: z.object({
    nome: z.string().min(1),
    cargo: z.string().optional(),
    email: z.email().optional(),
  }),
});

export const Pendencia = z.object({
  /** caminho no processo, ex.: "taxas.0.baseCalculo" */
  caminho: z.string(),
  descricao: z.string().min(1),
});

export const RegistroOrigem = z.object({
  caminho: z.string(),
  origem: OrigemInformacao,
  observacao: z.string().optional(),
});

export const FormularioImplantacao = z.object({
  id: z.string(),
  status: z.enum(["rascunho", "em_revisao", "confirmado"]),
  dominio: z.string(),
  /** id do processo-modelo usado como ponto de partida */
  modeloBase: z.string().optional(),
  orgao: Orgao,
  /** leis/decretos municipais informados pelo servidor durante a conversa */
  legislacaoLocal: z.array(z.object({ titulo: z.string(), numero: z.string().optional(), url: z.url().optional() })).default([]),
  processo: ProcessoModelo,
  origens: z.array(RegistroOrigem).default([]),
  pendencias: z.array(Pendencia).default([]),
  evidenciasLegais: z.array(LegalEvidenceRecord).default([]),
  citacoesRequisitos: z.array(RequirementCitation).default([]),
  alteracoesCampos: z.array(FieldDifference).default([]),
  atualizadoEm: z.iso.datetime(),
});

export type Orgao = z.infer<typeof Orgao>;
export type Pendencia = z.infer<typeof Pendencia>;
export type FormularioImplantacao = z.infer<typeof FormularioImplantacao>;

const BLOCOS = ["resumo", "formulario", "documentos", "taxas", "setores", "fluxo", "despachos", "documentoFinal"] as const;

/** Rascunho a partir de um processo-modelo: todo bloco nasce com origem "modelo", a confirmar com o servidor. */
export function novoFormulario(id: string, modelo: ProcessoModelo, orgao: Orgao, agora = new Date()): FormularioImplantacao {
  const processo = structuredClone({ ...modelo, exemplo: false });
  const formulario: FormularioImplantacao = {
    id,
    status: "rascunho",
    dominio: modelo.dominio,
    modeloBase: modelo.id,
    orgao,
    legislacaoLocal: [],
    processo,
    origens: BLOCOS.filter((b) => processo[b] !== undefined).map((caminho) => ({ caminho, origem: "modelo" as const })),
    pendencias: [],
    evidenciasLegais: [],
    citacoesRequisitos: [],
    alteracoesCampos: [],
    atualizadoEm: agora.toISOString(),
  };
  return { ...formulario, pendencias: lacunas(formulario) };
}

/**
 * Lacunas que impedem o implantador de parametrizar o processo sem voltar ao órgão.
 * Não substitui as pendências registradas na conversa; é recalculada a cada atualização.
 */
export function lacunas({ processo: p, orgao }: Pick<FormularioImplantacao, "processo" | "orgao">): Pendencia[] {
  const out: Pendencia[] = [];
  const add = (caminho: string, descricao: string) => out.push({ caminho, descricao });

  if (!p.resumo) add("resumo", "Falta o texto de apresentação do serviço no Portal.");
  else if (p.resumo.camposDestaque.length === 0) add("resumo.camposDestaque", "Defina quais campos identificam o processo na caixa de entrada.");

  p.formulario.secoes.forEach((s, i) =>
    s.campos.forEach((c, j) => {
      if ((c.tipo === "selecao" || c.tipo === "multipla_escolha") && !c.opcoes?.length) {
        add(`formulario.secoes.${i}.campos.${j}.opcoes`, `Campo "${c.rotulo}" é de seleção mas não tem opções.`);
      }
    }),
  );

  p.taxas.forEach((t, i) => {
    if (!t.baseCalculo) add(`taxas.${i}.baseCalculo`, `Taxa "${t.nome}" sem base de cálculo.`);
    if (t.baseLegal.length === 0) add(`taxas.${i}.baseLegal`, `Taxa "${t.nome}" sem lei que a institui em ${orgao.municipio}.`);
  });

  const setores = new Map(p.setores.map((s) => [s.id, s]));
  p.fluxo.etapas.forEach((e, i) => {
    if (setores.get(e.responsavel)?.tipo === "interno" && e.prazoDias === undefined) {
      add(`fluxo.etapas.${i}.prazoDias`, `Etapa "${e.nome}" sem prazo.`);
    }
  });

  // toda saída de etapa movida por um servidor precisa de um despacho que a dispare
  const comDespacho = new Set(p.despachos.filter((d) => d.levaPara).map((d) => `${d.etapa}>${d.levaPara}`));
  const etapas = new Map(p.fluxo.etapas.map((e) => [e.id, e]));
  p.fluxo.transicoes.forEach((t, i) => {
    const origem = etapas.get(t.de);
    if (origem && setores.get(origem.responsavel)?.tipo === "interno" && !comDespacho.has(`${t.de}>${t.para}`)) {
      add(`fluxo.transicoes.${i}`, `Nenhum despacho leva de "${t.de}" para "${t.para}".`);
    }
  });

  p.despachos.forEach((d, i) => {
    if (d.visivelRequerente && !d.texto) add(`despachos.${i}.texto`, `Despacho "${d.nome}" é visível ao requerente e não tem texto-base.`);
    if (d.exigeAssinatura && !d.assinante) add(`despachos.${i}.assinante`, `Despacho "${d.nome}" exige assinatura mas não diz quem assina.`);
  });

  if (!p.documentoFinal) add("documentoFinal", "Falta definir o documento emitido no deferimento (ou confirmar que não há).");
  else if (!p.documentoFinal.assinante) add("documentoFinal.assinante", "Documento final sem assinante.");

  return out;
}
