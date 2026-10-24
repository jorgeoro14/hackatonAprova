import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { carregarBase } from "../src/knowledge/loader.js";

const base = await carregarBase(resolve("knowledge"));
const app = criarApp(base, { logger: false });
const get = (url: string) => app.inject({ url });

describe("três portas da base", () => {
  it("base da Aprova: lista e devolve documento com fontes", async () => {
    const ids = (await get("/sistema")).json().map((d: { id: string }) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["visao-geral", "tramitacao", "pode-e-nao-pode"]));

    const doc = (await get("/sistema/tramitacao")).json();
    expect(doc.conteudo).toMatch(/Encaminhar/);
    expect(doc.fontes.length).toBeGreaterThan(0);
    expect((await get("/sistema/nao-existe")).statusCode).toBe(404);
  });

  it("legislação: lista e devolve norma com conteúdo", async () => {
    const normas = (await get("/dominios/meio-ambiente/legislacao")).json();
    expect(normas.map((n: { id: string }) => n.id)).toContain("resolucao-conama-237-1997");
    const norma = (await get("/dominios/meio-ambiente/legislacao/resolucao-conama-237-1997")).json();
    expect(norma.conteudo.length).toBeGreaterThan(0);
  });

  it("processos de referência: lista", async () => {
    const processos = (await get("/dominios/meio-ambiente/processos")).json();
    expect(processos).toContainEqual(expect.objectContaining({ id: "licenca-ambiental-previa" }));
  });

  it("busca filtra por camada", async () => {
    const r = (await get("/busca?q=assinatura%20em%20lote&camada=sistema")).json();
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((t: { origem: string }) => t.origem === "sistema")).toBe(true);

    expect((await get("/busca?q=prazo&camada=legislacao")).statusCode).toBe(400);
    expect((await get("/busca?q=prazo&camada=xyz")).statusCode).toBe(400);
    const leis = (await get("/busca?q=validade%20licen%C3%A7a&camada=legislacao&dominio=meio-ambiente")).json();
    expect(leis.every((t: { origem: string }) => t.origem === "legislacao")).toBe(true);
  });
});
