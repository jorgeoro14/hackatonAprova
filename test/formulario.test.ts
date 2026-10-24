import { describe, expect, it } from "vitest";
import lapJson from "../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json" with { type: "json" };
import { FormularioImplantacao, lacunas, novoFormulario } from "../src/implantacao/formulario.js";
import { ProcessoModelo } from "../src/knowledge/schemas.js";

const lap = ProcessoModelo.parse(lapJson);
const orgao = { municipio: "Toledo", uf: "PR", orgao: "Secretaria de Meio Ambiente", responsavel: { nome: "Fulano" } };

const mensagens = (dados: unknown) => {
  const r = ProcessoModelo.safeParse(dados);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("ProcessoModelo — referências internas", () => {
  it("acusa despacho que move para etapa sem transição", () => {
    const despachos = [...lapJson.despachos, { id: "pular", nome: "Pular", tipo: "outro", etapa: "triagem", levaPara: "emissao" }];
    expect(mensagens({ ...lapJson, despachos })).toContainEqual(expect.stringMatching(/triagem.*emissao/));
  });

  it("acusa etapa com setor inexistente", () => {
    const setores = lapJson.setores.filter((s) => s.id !== "fiscalizacao_ambiental");
    expect(mensagens({ ...lapJson, setores })).toContainEqual(expect.stringMatching(/fiscalizacao_ambiental/));
  });

  it("acusa variável de texto que não é campo nem do sistema", () => {
    const despachos = [{ ...lapJson.despachos[0], texto: "Olá {{nome_inexistente}}" }];
    expect(mensagens({ ...lapJson, despachos })).toContainEqual(expect.stringMatching(/nome_inexistente/));
  });

  it("acusa campo de destaque do resumo que não está no formulário", () => {
    const resumo = { ...lapJson.resumo, camposDestaque: ["cpf_do_vizinho"] };
    expect(mensagens({ ...lapJson, resumo })).toContainEqual(expect.stringMatching(/cpf_do_vizinho/));
  });
});

describe("formulário de implantação", () => {
  it("nasce do modelo como rascunho válido, com origem e lacunas", () => {
    const f = novoFormulario("f1", lap, orgao, new Date("2026-10-24T12:00:00Z"));
    expect(() => FormularioImplantacao.parse(f)).not.toThrow();
    expect(f.processo.exemplo).toBe(false);
    expect(f.origens.map((o) => o.caminho)).toEqual(expect.arrayContaining(["fluxo", "despachos", "resumo"]));

    const caminhos = f.pendencias.map((p) => p.caminho);
    expect(caminhos).toContain("formulario.secoes.1.campos.2.opcoes"); // tipologia sem opções
    expect(caminhos).toContain("taxas.0.baseLegal"); // lei municipal da taxa
    expect(caminhos).toContain("fluxo.etapas.4.prazoDias"); // análise técnica sem prazo
  });

  it("aponta transição movida por servidor sem despacho", () => {
    const semDeferimento = { ...lap, despachos: lap.despachos.filter((d) => d.id !== "deferimento") };
    expect(lacunas({ processo: semDeferimento, orgao })).toContainEqual(
      expect.objectContaining({ descricao: expect.stringMatching(/"decisao" para "emissao"/) }),
    );
  });
});
