import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { FormularioImplantacao, OrigemInformacao } from "../implantacao/formulario.js";
import type { BaseConhecimento } from "../knowledge/loader.js";
import { ProcessoModelo } from "../knowledge/schemas.js";
import { buscar, type Trecho } from "../knowledge/search.js";
import { aplicarPatch, PatchError } from "./patch.js";
import type { SessaoImplantacao } from "./sessao.js";

export interface ContextoFerramentas {
  sessao: SessaoImplantacao;
  base: BaseConhecimento;
  /** trechos indexados de sistema + domínio da sessão */
  trechos: Trecho[];
}

export interface ResultadoFerramenta {
  conteudo: string;
  erro?: boolean;
}

const nulavel = (type: string) => ({ type: [type, "null"] });

// Todas as ferramentas usam strict: true; campos opcionais são "nulláveis" e obrigatórios no schema.
export const DEFINICOES: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_base",
    description:
      "Busca na base de conhecimento (documentação da Aprova, legislação e processos-modelo do domínio). Use para embasar sugestões e citar normas.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Termos de busca em português." },
        limite: { ...nulavel("integer"), description: "Máximo de trechos (padrão 5)." },
      },
      required: ["consulta", "limite"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_processos_modelo",
    description: "Lista os processos-modelo disponíveis no domínio desta implantação.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "carregar_processo_modelo",
    description:
      "Copia um processo-modelo para o formulário de implantação como ponto de partida e devolve o processo completo. Substitui o processo atual do formulário.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { processo_id: { type: "string" } },
      required: ["processo_id"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_orgao",
    description:
      "Registra ou atualiza os dados do órgão que está implantando. Envie null nos campos que não mudaram.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        municipio: nulavel("string"),
        uf: { ...nulavel("string"), description: "Sigla com 2 letras." },
        orgao: { ...nulavel("string"), description: "Secretaria ou órgão." },
        responsavel_nome: nulavel("string"),
        responsavel_cargo: nulavel("string"),
        responsavel_email: nulavel("string"),
      },
      required: ["municipio", "uf", "orgao", "responsavel_nome", "responsavel_cargo", "responsavel_email"],
      additionalProperties: false,
    },
  },
  {
    name: "alterar_processo",
    description: [
      "Altera o processo do formulário com operações JSON Patch (add, replace, remove) sobre o ProcessoModelo.",
      'Caminhos como "/formulario/secoes/0/campos/-" (adiciona no fim), "/fluxo/etapas/2/prazoDias", "/documentos/1".',
      "valor_json é o valor em JSON (use \"null\" em remove). As operações são aplicadas juntas e o resultado é validado;",
      "se ficar inválido nada é aplicado e os erros são devolvidos. Registre a origem da informação.",
    ].join(" "),
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        operacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "replace", "remove"] },
              path: { type: "string" },
              valor_json: { type: "string" },
            },
            required: ["op", "path", "valor_json"],
            additionalProperties: false,
          },
        },
        origem: { type: "string", enum: ["modelo", "servidor", "legislacao"] },
        observacao: nulavel("string"),
      },
      required: ["operacoes", "origem", "observacao"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_legislacao_local",
    description: "Registra uma lei, decreto ou norma municipal/estadual informada pelo servidor.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { titulo: { type: "string" }, numero: nulavel("string"), url: nulavel("string") },
      required: ["titulo", "numero", "url"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_pendencia",
    description:
      "Registra algo que ainda precisa ser confirmado ou informado (ex.: valor de taxa, lei municipal). Use em vez de inventar.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        caminho: { type: "string", description: 'Onde no processo, ex.: "/taxas/0/baseCalculo".' },
        descricao: { type: "string" },
      },
      required: ["caminho", "descricao"],
      additionalProperties: false,
    },
  },
  {
    name: "resolver_pendencia",
    description: "Remove uma pendência que foi resolvida.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { caminho: { type: "string" } },
      required: ["caminho"],
      additionalProperties: false,
    },
  },
  {
    name: "ver_formulario",
    description: "Mostra o estado atual do formulário de implantação, com pendências e erros de validação.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "concluir_formulario",
    description:
      "Valida o formulário completo e o envia para revisão. Só chame depois de o servidor confirmar a revisão final.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

const Entradas = {
  buscar_base: z.object({ consulta: z.string().min(1), limite: z.number().int().positive().max(20).nullable() }),
  listar_processos_modelo: z.object({}),
  carregar_processo_modelo: z.object({ processo_id: z.string() }),
  registrar_orgao: z.object({
    municipio: z.string().nullable(),
    uf: z.string().nullable(),
    orgao: z.string().nullable(),
    responsavel_nome: z.string().nullable(),
    responsavel_cargo: z.string().nullable(),
    responsavel_email: z.string().nullable(),
  }),
  alterar_processo: z.object({
    operacoes: z
      .array(z.object({ op: z.enum(["add", "replace", "remove"]), path: z.string(), valor_json: z.string() }))
      .min(1),
    origem: OrigemInformacao,
    observacao: z.string().nullable(),
  }),
  registrar_legislacao_local: z.object({ titulo: z.string().min(1), numero: z.string().nullable(), url: z.string().nullable() }),
  registrar_pendencia: z.object({ caminho: z.string(), descricao: z.string().min(1) }),
  resolver_pendencia: z.object({ caminho: z.string() }),
  ver_formulario: z.object({}),
  concluir_formulario: z.object({}),
} satisfies Record<string, z.ZodType>;

type NomeFerramenta = keyof typeof Entradas;

const ok = (dados: unknown): ResultadoFerramenta => ({ conteudo: JSON.stringify(dados) });
const falha = (mensagem: string, detalhes?: unknown): ResultadoFerramenta => ({
  conteudo: JSON.stringify({ erro: mensagem, ...(detalhes === undefined ? {} : { detalhes }) }),
  erro: true,
});

const resumirIssues = (issues: z.core.$ZodIssue[]) =>
  issues.map((i) => `/${i.path.join("/")}: ${i.message}`);

/** Monta o FormularioImplantacao a partir do rascunho e valida. */
export function montarFormulario(sessao: SessaoImplantacao) {
  const { rascunho } = sessao;
  return FormularioImplantacao.safeParse({
    id: sessao.id,
    status: rascunho.status,
    dominio: sessao.dominio,
    modeloBase: rascunho.modeloBase,
    orgao: {
      municipio: rascunho.orgao.municipio,
      uf: rascunho.orgao.uf,
      orgao: rascunho.orgao.orgao,
      responsavel: rascunho.orgao.responsavel ?? {},
    },
    legislacaoLocal: rascunho.legislacaoLocal,
    processo: rascunho.processo,
    origens: rascunho.origens,
    pendencias: rascunho.pendencias,
    atualizadoEm: sessao.atualizadaEm,
  });
}

export function executarFerramenta(nome: string, input: unknown, ctx: ContextoFerramentas): ResultadoFerramenta {
  if (!(nome in Entradas)) return falha(`ferramenta desconhecida: ${nome}`);
  const parsed = Entradas[nome as NomeFerramenta].safeParse(input);
  if (!parsed.success) return falha("entrada inválida", resumirIssues(parsed.error.issues));

  const { sessao, base, trechos } = ctx;
  const { rascunho } = sessao;
  const dominio = base.dominios.get(sessao.dominio);
  if (!dominio) return falha(`domínio ${sessao.dominio} não carregado`);

  switch (nome as NomeFerramenta) {
    case "buscar_base": {
      const { consulta, limite } = parsed.data as z.infer<typeof Entradas.buscar_base>;
      return ok(buscar(trechos, consulta, limite ?? 5).map(({ origem, fonte, titulo, texto }) => ({ origem, fonte, titulo, texto })));
    }

    case "listar_processos_modelo":
      return ok(dominio.processos.map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao })));

    case "carregar_processo_modelo": {
      const { processo_id } = parsed.data as z.infer<typeof Entradas.carregar_processo_modelo>;
      const modelo = dominio.processos.find((p) => p.id === processo_id);
      if (!modelo) return falha(`processo-modelo "${processo_id}" não existe`, dominio.processos.map((p) => p.id));
      rascunho.processo = structuredClone(modelo);
      rascunho.modeloBase = modelo.id;
      rascunho.origens.push({ caminho: "/", origem: "modelo", observacao: `carregado de ${modelo.id}` });
      return ok(rascunho.processo);
    }

    case "registrar_orgao": {
      const d = parsed.data as z.infer<typeof Entradas.registrar_orgao>;
      const o = rascunho.orgao;
      if (d.municipio !== null) o.municipio = d.municipio;
      if (d.uf !== null) o.uf = d.uf.toUpperCase();
      if (d.orgao !== null) o.orgao = d.orgao;
      const r = { ...(o.responsavel ?? { nome: "" }) };
      if (d.responsavel_nome !== null) r.nome = d.responsavel_nome;
      if (d.responsavel_cargo !== null) r.cargo = d.responsavel_cargo;
      if (d.responsavel_email !== null) r.email = d.responsavel_email;
      o.responsavel = r;
      return ok(o);
    }

    case "alterar_processo": {
      const { operacoes, origem, observacao } = parsed.data as z.infer<typeof Entradas.alterar_processo>;
      if (!rascunho.processo) return falha("nenhum processo carregado; use carregar_processo_modelo primeiro");

      let ops;
      try {
        ops = operacoes.map((o) => ({ op: o.op, path: o.path, value: o.op === "remove" ? undefined : JSON.parse(o.valor_json) }));
      } catch (e) {
        return falha(`valor_json inválido: ${(e as Error).message}`);
      }

      let novo: unknown;
      try {
        novo = aplicarPatch(rascunho.processo, ops);
      } catch (e) {
        if (e instanceof PatchError) return falha(e.message);
        throw e;
      }

      const validado = ProcessoModelo.safeParse(novo);
      if (!validado.success) return falha("o processo ficaria inválido; nada foi alterado", resumirIssues(validado.error.issues));

      rascunho.processo = validado.data;
      for (const o of operacoes) {
        rascunho.origens.push({ caminho: o.path, origem, ...(observacao ? { observacao } : {}) });
      }
      return ok({ aplicado: operacoes.length });
    }

    case "registrar_legislacao_local": {
      const { titulo, numero, url } = parsed.data as z.infer<typeof Entradas.registrar_legislacao_local>;
      rascunho.legislacaoLocal.push({ titulo, ...(numero ? { numero } : {}), ...(url ? { url } : {}) });
      return ok(rascunho.legislacaoLocal);
    }

    case "registrar_pendencia": {
      const p = parsed.data as z.infer<typeof Entradas.registrar_pendencia>;
      rascunho.pendencias = rascunho.pendencias.filter((x) => x.caminho !== p.caminho);
      rascunho.pendencias.push(p);
      return ok(rascunho.pendencias);
    }

    case "resolver_pendencia": {
      const { caminho } = parsed.data as z.infer<typeof Entradas.resolver_pendencia>;
      const antes = rascunho.pendencias.length;
      rascunho.pendencias = rascunho.pendencias.filter((x) => x.caminho !== caminho);
      if (rascunho.pendencias.length === antes) return falha(`não há pendência em ${caminho}`);
      return ok(rascunho.pendencias);
    }

    case "ver_formulario": {
      const r = montarFormulario(sessao);
      return ok({ rascunho, valido: r.success, erros: r.success ? [] : resumirIssues(r.error.issues) });
    }

    case "concluir_formulario": {
      const r = montarFormulario({ ...sessao, rascunho: { ...rascunho, status: "em_revisao" } });
      if (!r.success) return falha("formulário incompleto", resumirIssues(r.error.issues));
      rascunho.status = "em_revisao";
      return ok({ status: "em_revisao", pendencias: rascunho.pendencias });
    }
  }
}
