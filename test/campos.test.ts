import { describe, expect, it } from "vitest";
import lapJson from "../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json" with { type: "json" };
import { categoriaDoCaminho, formularioParaCampos } from "../src/dashboard/campos.js";
import { novoFormulario } from "../src/implantacao/formulario.js";
import { ProcessoModelo } from "../src/knowledge/schemas.js";

const lap = ProcessoModelo.parse(lapJson);
const orgao = { municipio: "Toledo", uf: "PR", orgao: "Secretaria de Meio Ambiente", responsavel: { nome: "Fulano" } };
const AGORA = new Date("2026-10-24T12:00:00Z");
const rascunho = () => novoFormulario("f1", lap, orgao, AGORA);

describe("formularioParaCampos", () => {
  it("um item por bloco do formulário, com a categoria da tabela", () => {
    const campos = formularioParaCampos(rascunho());
    const porCategoria = (c: string) => campos.filter((x) => x.categoria === c && !x.chave.endsWith("prazoDias")).length;
    const campoForm = lap.formulario.secoes.reduce((s, x) => s + x.campos.length, 0);

    expect(porCategoria("documento")).toBe(lap.documentos.length);
    expect(campos.filter((x) => x.categoria === "taxa")).toHaveLength(lap.taxas.length);
    expect(porCategoria("etapa")).toBe(lap.fluxo.etapas.length);
    expect(porCategoria("setor")).toBe(lap.setores.length);
    expect(porCategoria("campo_formulario")).toBe(campoForm);
    expect(campos.find((x) => x.chave === "fluxo.prazoTotalDias")).toMatchObject({ categoria: "prazo", valor: "180 dias" });
    expect(campos.find((x) => x.chave === "baseLegal.0")).toMatchObject({ categoria: "base_legal", valor: "lei-6938-1981" });
    expect(campos.find((x) => x.chave === "documentoFinal")?.categoria).toBe("outro");
    // nunca null: o painel mostra o valor como texto
    expect(campos.every((c) => typeof c.valor === "string")).toBe(true);
    expect(campos.every((c) => c.origem === "agente")).toBe(true);
  });

  it("rascunho: pendências marcam o item certo ou viram item pendente; o resto fica a validar", () => {
    const form = rascunho();
    const campos = formularioParaCampos(form);
    const por = (chave: string) => campos.find((c) => c.chave === chave);

    // a taxa da LAP não tem lei municipal: a taxa segue a validar e a base legal entra como pendente à parte
    expect(form.pendencias.map((p) => p.caminho)).toContain("taxas.0.baseLegal");
    expect(por("taxas.0")?.status).toBe("to_validate");
    expect(por("taxas.0.baseLegal")).toMatchObject({ categoria: "base_legal", status: "pending", valor: "", coletadoEm: null });

    // etapa interna sem prazo: a etapa segue a validar, o prazo é que está pendente
    const analise = lap.fluxo.etapas.findIndex((e) => e.id === "analise");
    expect(por(`fluxo.etapas.${analise}`)?.status).toBe("to_validate");
    expect(por(`fluxo.etapas.${analise}.prazoDias`)).toMatchObject({ categoria: "prazo", status: "pending" });

    // toda pendência aparece em algum item pendente
    const pendentes = campos.filter((c) => c.status === "pending");
    for (const p of form.pendencias) {
      expect(pendentes.some((c) => c.chave === p.caminho || p.caminho.startsWith(`${c.chave}.`))).toBe(true);
    }
    expect(campos.filter((c) => c.status !== "pending").every((c) => c.status === "to_validate" && c.coletadoEm === AGORA.toISOString())).toBe(true);
  });

  it("pendência abaixo do item e da mesma categoria marca o próprio item", () => {
    const form = { ...rascunho(), pendencias: [{ caminho: "taxas.0.baseCalculo", descricao: "sem base" }] };
    const campos = formularioParaCampos(form);
    expect(campos.find((c) => c.chave === "taxas.0")?.status).toBe("pending");
    expect(campos.filter((c) => c.status === "pending")).toHaveLength(1);
  });

  it("confirmado e sem pendências: tudo preenchido, carimbado com a data informada", () => {
    const form = { ...rascunho(), status: "confirmado" as const, pendencias: [] };
    const campos = formularioParaCampos(form, "2026-10-25T00:00:00.000Z");
    expect(campos.every((c) => c.status === "filled" && c.coletadoEm === "2026-10-25T00:00:00.000Z")).toBe(true);
  });

  it("categoria pelo caminho", () => {
    expect(categoriaDoCaminho("documentos.2")).toBe("documento");
    expect(categoriaDoCaminho("taxas.0.baseCalculo")).toBe("taxa");
    expect(categoriaDoCaminho("taxas.0.baseLegal")).toBe("base_legal");
    expect(categoriaDoCaminho("fluxo.etapas.3")).toBe("etapa");
    expect(categoriaDoCaminho("fluxo.etapas.3.prazoDias")).toBe("prazo");
    expect(categoriaDoCaminho("fluxo.prazoTotalDias")).toBe("prazo");
    expect(categoriaDoCaminho("fluxo.transicoes.1")).toBe("despacho");
    expect(categoriaDoCaminho("setores.1")).toBe("setor");
    expect(categoriaDoCaminho("despachos.0.texto")).toBe("despacho");
    expect(categoriaDoCaminho("formulario.secoes.0.campos.1.opcoes")).toBe("campo_formulario");
    expect(categoriaDoCaminho("legislacaoLocal.0")).toBe("base_legal");
    expect(categoriaDoCaminho("resumo.camposDestaque")).toBe("outro");
  });
});
