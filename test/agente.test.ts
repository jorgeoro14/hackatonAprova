import type Anthropic from "@anthropic-ai/sdk";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AgenteImplantacao, type CriarMensagem } from "../src/agente/agente.js";
import { executarFerramenta, montarFormulario, type ContextoFerramentas } from "../src/agente/ferramentas.js";
import { aplicarPatch, PatchError } from "../src/agente/patch.js";
import { SessoesEmMemoria } from "../src/agente/sessao.js";
import { criarApp } from "../src/app.js";
import { carregarBase, type BaseConhecimento } from "../src/knowledge/loader.js";
import { indexar } from "../src/knowledge/search.js";

let base: BaseConhecimento;
beforeAll(async () => {
  base = await carregarBase(resolve("knowledge"));
});

/** Posição de uma etapa da LAP de exemplo, para os testes não dependerem da ordem no arquivo. */
function etapa(id: string): number {
  const lap = base.dominios.get("meio-ambiente")!.processos.find((p) => p.id === "licenca-ambiental-previa")!;
  const i = lap.fluxo.etapas.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`etapa ${id} não existe na LAP`);
  return i;
}

async function contexto(): Promise<ContextoFerramentas> {
  const sessao = await new SessoesEmMemoria().criar("meio-ambiente");
  return { sessao, base, trechos: indexar(base, "meio-ambiente") };
}

const ORGAO_COMPLETO = {
  municipio: "Florianópolis",
  uf: "sc",
  orgao: "Secretaria Municipal de Meio Ambiente",
  responsavel_nome: "Ana Souza",
  responsavel_cargo: null,
  responsavel_email: "ana@exemplo.gov.br",
};

/** Mensagem falsa da API com os blocos informados. */
function mensagem(
  stop_reason: Anthropic.Beta.BetaStopReason,
  content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[],
): Anthropic.Beta.BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "teste", stop_reason, content } as unknown as Anthropic.Beta.BetaMessage;
}

/** Cliente falso que devolve as respostas em ordem e guarda os parâmetros recebidos. */
function roteiro(respostas: Anthropic.Beta.BetaMessage[]) {
  const chamadas: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const criar: CriarMensagem = async (params) => {
    chamadas.push(structuredClone(params));
    const r = respostas.shift();
    if (!r) throw new Error("roteiro acabou");
    return r;
  };
  return { criar, chamadas };
}

describe("aplicarPatch", () => {
  it("adiciona no fim, substitui e remove sem alterar o original", () => {
    const doc = { a: [1, 2], b: { c: "x" } };
    const novo = aplicarPatch(doc, [
      { op: "add", path: "/a/-", value: 3 },
      { op: "replace", path: "/b/c", value: "y" },
      { op: "remove", path: "/a/0" },
    ]);
    expect(novo).toEqual({ a: [2, 3], b: { c: "y" } });
    expect(doc).toEqual({ a: [1, 2], b: { c: "x" } });
  });

  it("rejeita caminho inexistente", () => {
    expect(() => aplicarPatch({ a: [] }, [{ op: "replace", path: "/a/0", value: 1 }])).toThrow(PatchError);
    expect(() => aplicarPatch({ a: 1 }, [{ op: "remove", path: "/x" }])).toThrow(PatchError);
  });
});

describe("ferramentas", () => {
  it("carrega o processo-modelo e registra a origem", async () => {
    const ctx = await contexto();
    const r = executarFerramenta("carregar_processo_modelo", { processo_id: "licenca-ambiental-previa" }, ctx);
    expect(r.erro).toBeFalsy();
    expect(ctx.sessao.rascunho.modeloBase).toBe("licenca-ambiental-previa");
    expect(ctx.sessao.rascunho.origens[0]).toMatchObject({ caminho: "/", origem: "modelo" });
  });

  it("altera o processo quando o resultado é válido", async () => {
    const ctx = await contexto();
    executarFerramenta("carregar_processo_modelo", { processo_id: "licenca-ambiental-previa" }, ctx);
    const campo = { id: "num_funcionarios", rotulo: "Número de funcionários", tipo: "numero", obrigatorio: false };
    const r = executarFerramenta(
      "alterar_processo",
      {
        operacoes: [
          { op: "add", path: "/formulario/secoes/1/campos/-", valor_json: JSON.stringify(campo) },
          { op: "replace", path: `/fluxo/etapas/${etapa("triagem")}/prazoDias`, valor_json: "15" },
        ],
        origem: "servidor",
        observacao: null,
      },
      ctx,
    );
    expect(r.erro).toBeFalsy();
    const p = ctx.sessao.rascunho.processo!;
    expect(p.formulario.secoes[1]?.campos.at(-1)?.id).toBe("num_funcionarios");
    expect(p.fluxo.etapas[etapa("triagem")]?.prazoDias).toBe(15);
    expect(ctx.sessao.rascunho.origens.filter((o) => o.origem === "servidor")).toHaveLength(2);
  });

  it("não aplica nada se o processo ficaria inválido", async () => {
    const ctx = await contexto();
    executarFerramenta("carregar_processo_modelo", { processo_id: "licenca-ambiental-previa" }, ctx);
    const antes = structuredClone(ctx.sessao.rascunho.processo);
    const r = executarFerramenta(
      "alterar_processo",
      {
        operacoes: [
          { op: "replace", path: `/fluxo/etapas/${etapa("triagem")}/prazoDias`, valor_json: "20" },
          { op: "add", path: "/formulario/secoes/0/campos/-", valor_json: '{"id":"x","rotulo":"X","tipo":"inexistente","obrigatorio":true}' },
        ],
        origem: "servidor",
        observacao: null,
      },
      ctx,
    );
    expect(r.erro).toBe(true);
    expect(ctx.sessao.rascunho.processo).toEqual(antes);
  });

  it("recusa remover etapa usada em transições", async () => {
    const ctx = await contexto();
    executarFerramenta("carregar_processo_modelo", { processo_id: "licenca-ambiental-previa" }, ctx);
    const r = executarFerramenta(
      "alterar_processo",
      { operacoes: [{ op: "remove", path: `/fluxo/etapas/${etapa("vistoria")}`, valor_json: "null" }], origem: "servidor", observacao: null },
      ctx,
    );
    expect(r.erro).toBe(true);
    expect(r.conteudo).toMatch(/vistoria/);
  });

  it("valida a entrada da ferramenta", async () => {
    const ctx = await contexto();
    expect(executarFerramenta("carregar_processo_modelo", {}, ctx).erro).toBe(true);
    expect(executarFerramenta("nao_existe", {}, ctx).erro).toBe(true);
  });

  it("só conclui quando o formulário está completo", async () => {
    const ctx = await contexto();
    expect(executarFerramenta("concluir_formulario", {}, ctx).erro).toBe(true);

    executarFerramenta("carregar_processo_modelo", { processo_id: "licenca-ambiental-previa" }, ctx);
    executarFerramenta("registrar_orgao", ORGAO_COMPLETO, ctx);
    executarFerramenta("registrar_pendencia", { caminho: "/taxas/0/baseCalculo", descricao: "Confirmar lei da taxa" }, ctx);

    const r = executarFerramenta("concluir_formulario", {}, ctx);
    expect(r.erro).toBeFalsy();
    expect(ctx.sessao.rascunho.status).toBe("em_revisao");
    expect(ctx.sessao.rascunho.orgao.uf).toBe("SC");

    const form = montarFormulario(ctx.sessao);
    expect(form.success).toBe(true);
    expect(form.data?.pendencias).toHaveLength(1);
  });
});

describe("AgenteImplantacao", () => {
  it("executa as ferramentas pedidas e devolve o texto final", async () => {
    const { criar, chamadas } = roteiro([
      mensagem("tool_use", [
        { type: "text", text: "Vou carregar o modelo." },
        { type: "tool_use", id: "t1", name: "carregar_processo_modelo", input: { processo_id: "licenca-ambiental-previa" } },
        { type: "tool_use", id: "t2", name: "registrar_orgao", input: ORGAO_COMPLETO },
      ]),
      mensagem("end_turn", [{ type: "text", text: "A Aprova tem um fluxo de LAP assim. Faz sentido pra você?" }]),
    ]);
    const agente = new AgenteImplantacao(criar, base, { modelo: "claude-opus-5-5" });
    const sessao = await new SessoesEmMemoria().criar("meio-ambiente");

    const r = await agente.responder(sessao, "Somos a SMMA de Florianópolis e queremos digitalizar a LAP.");

    expect(r.motivoParada).toBe("end_turn");
    expect(r.texto).toContain("Faz sentido");
    expect(r.ferramentas.map((f) => f.nome)).toEqual(["carregar_processo_modelo", "registrar_orgao"]);
    expect(sessao.rascunho.modeloBase).toBe("licenca-ambiental-previa");

    // histórico: user, assistant(tool_use), user(2 resultados numa mensagem), assistant
    expect(sessao.mensagens.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const resultados = sessao.mensagens[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(resultados.map((b) => b.tool_use_id)).toEqual(["t1", "t2"]);

    const params = chamadas[0]!;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.tools?.length).toBeGreaterThan(5);
    // o system prompt inclui a base fixa e o domínio
    const system = params.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system[0]?.text).toContain("roteiro-de-implantacao");
    expect(system[1]?.text).toContain("licenca-ambiental-previa");
  });

  it("devolve erro ao modelo quando a ferramenta falha, sem interromper", async () => {
    const { criar, chamadas } = roteiro([
      mensagem("tool_use", [{ type: "tool_use", id: "t1", name: "carregar_processo_modelo", input: { processo_id: "nao-existe" } }]),
      mensagem("end_turn", [{ type: "text", text: "Não achei esse modelo." }]),
    ]);
    const agente = new AgenteImplantacao(criar, base, { modelo: "m" });
    const sessao = await new SessoesEmMemoria().criar("meio-ambiente");
    const r = await agente.responder(sessao, "oi");

    expect(r.ferramentas[0]?.erro).toBe(true);
    const ultima = chamadas[1]!.messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(ultima[0]?.is_error).toBe(true);
  });

  it("não executa ferramentas de uma resposta cortada e mantém o histórico válido", async () => {
    const { criar } = roteiro([
      mensagem("max_tokens", [{ type: "tool_use", id: "t1", name: "registrar_orgao", input: { municipio: "Flo" } }]),
    ]);
    const agente = new AgenteImplantacao(criar, base, { modelo: "m" });
    const sessao = await new SessoesEmMemoria().criar("meio-ambiente");
    const r = await agente.responder(sessao, "oi");

    expect(r.motivoParada).toBe("max_tokens");
    expect(r.ferramentas).toHaveLength(0);
    expect(sessao.rascunho.orgao).toEqual({});
    const ultima = sessao.mensagens.at(-1)!;
    expect(ultima.role).toBe("user");
    expect((ultima.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]?.tool_use_id).toBe("t1");
  });
});

describe("API de implantações", () => {
  it("cria a implantação, conversa e devolve o formulário", async () => {
    const { criar } = roteiro([
      mensagem("tool_use", [{ type: "tool_use", id: "t1", name: "carregar_processo_modelo", input: { processo_id: "licenca-ambiental-previa" } }]),
      mensagem("end_turn", [{ type: "text", text: "Carreguei o modelo de LAP." }]),
    ]);
    const app = criarApp(base, {
      logger: false,
      agente: new AgenteImplantacao(criar, base, { modelo: "m" }),
      sessoes: new SessoesEmMemoria(),
    });

    expect((await app.inject({ method: "POST", url: "/implantacoes", payload: { dominio: "x" } })).statusCode).toBe(400);

    const criada = await app.inject({ method: "POST", url: "/implantacoes", payload: { dominio: "meio-ambiente" } });
    expect(criada.statusCode).toBe(201);
    const { id } = criada.json();

    const msg = await app.inject({ method: "POST", url: `/implantacoes/${id}/mensagens`, payload: { texto: "Quero a LAP" } });
    expect(msg.statusCode).toBe(200);
    expect(msg.json()).toMatchObject({ resposta: "Carreguei o modelo de LAP.", valido: false });
    expect(msg.json().rascunho.modeloBase).toBe("licenca-ambiental-previa");

    const estado = await app.inject({ url: `/implantacoes/${id}` });
    expect(estado.json().conversa).toEqual([
      { autor: "servidor", texto: "Quero a LAP" },
      { autor: "agente", texto: "Carreguei o modelo de LAP." },
    ]);

    expect((await app.inject({ url: "/implantacoes/nao-existe/formulario" })).statusCode).toBe(404);
  });
});
