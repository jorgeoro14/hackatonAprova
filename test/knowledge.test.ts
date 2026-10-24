import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { carregarBase, KnowledgeError } from "../src/knowledge/loader.js";
import { buscar, indexar } from "../src/knowledge/search.js";

const KB = resolve("knowledge");

describe("base de conhecimento", () => {
  it("carrega e valida a base do repositório", async () => {
    const base = await carregarBase(KB);
    expect(base.sistema.length).toBeGreaterThan(0);
    const ma = base.dominios.get("meio-ambiente");
    expect(ma?.processos.map((p) => p.id)).toContain("licenca-ambiental-previa");
    expect(ma?.legislacao.length).toBeGreaterThan(0);
  });

  it("acusa baseLegal que não existe no domínio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kb-"));
    await cp(KB, dir, { recursive: true });
    const arquivo = join(dir, "dominios/meio-ambiente/processos/quebrado.json");
    const { default: lap } = await import("../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json", {
      with: { type: "json" },
    });
    await writeFile(arquivo, JSON.stringify({ ...lap, id: "quebrado", baseLegal: ["lei-inexistente"] }));

    await expect(carregarBase(dir)).rejects.toThrow(KnowledgeError);
    await expect(carregarBase(dir)).rejects.toThrow(/lei-inexistente/);
  });

  it("acusa transição para etapa inexistente", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kb-"));
    await mkdir(join(dir, "dominios/x/processos"), { recursive: true });
    await writeFile(join(dir, "dominios/x/dominio.json"), JSON.stringify({ id: "x", nome: "X", descricao: "x" }));
    await writeFile(
      join(dir, "dominios/x/processos/p.json"),
      JSON.stringify({
        id: "p",
        nome: "P",
        dominio: "x",
        descricao: "p",
        publicoAlvo: ["cidadao"],
        formulario: { secoes: [{ titulo: "S", campos: [{ id: "a", rotulo: "A", tipo: "texto", obrigatorio: true }] }] },
        fluxo: { etapas: [{ id: "e1", nome: "E1", tipo: "protocolo", responsavel: "R" }], transicoes: [{ de: "e1", para: "e9" }] },
      }),
    );
    await expect(carregarBase(dir)).rejects.toThrow(/e9/);
  });

  it("busca encontra a norma de prazos de validade", async () => {
    const base = await carregarBase(KB);
    const [primeiro] = buscar(indexar(base, "meio-ambiente"), "validade da licença de operação");
    expect(primeiro?.fonte).toBe("resolucao-conama-237-1997");
  });
});

describe("API", () => {
  it("lista domínios e devolve o processo-modelo", async () => {
    const app = criarApp(await carregarBase(KB), { logger: false });
    const dominios = await app.inject({ url: "/dominios" });
    expect(dominios.json()).toEqual([expect.objectContaining({ id: "meio-ambiente", totalProcessos: 1 })]);

    const processo = await app.inject({ url: "/dominios/meio-ambiente/processos/licenca-ambiental-previa" });
    expect(processo.statusCode).toBe(200);
    expect(processo.json().fluxo.etapas.length).toBeGreaterThan(0);

    expect((await app.inject({ url: "/busca" })).statusCode).toBe(400);
  });
});
