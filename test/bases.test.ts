import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { secoesDaNorma, sincronizarBases } from "../src/bases/sincronizar.js";
import { emitirToken, hashSenha, type Usuario } from "../src/dashboard/auth.js";
import type { Banco } from "../src/db/banco.js";
import { carregarBase, type BaseConhecimento } from "../src/knowledge/loader.js";
import { bancoDeTeste } from "./apoio/pglite.js";

const AGORA = new Date("2026-10-24T12:00:00Z");
const SEGREDO = "segredo-de-teste-123456";

let db: Banco;
let base: BaseConhecimento;
let app: ReturnType<typeof criarApp>;
let auth: { authorization: string };
let authOutro: { authorization: string };
const ids = { cliente: "", clienteAlheio: "", conversa: "", conversaAlheia: "" };

/** Primeira linha do resultado (INSERT ... RETURNING ou SELECT de uma linha). */
async function inserir<T = { id: string }>(sql: string, params: unknown[]) {
  const [r] = await db.consultar<T>(sql, params);
  return r!;
}

async function novoUsuario(username: string): Promise<Usuario> {
  const { id } = await inserir(
    "INSERT INTO usuarios (nome, username, senha_hash, papel) VALUES ($1, $2, $3, 'implementer') RETURNING id",
    [username, username, hashSenha("x")],
  );
  return { id, name: username, username, role: "implementer" };
}

async function novoCliente(implantador: string, telefone: string) {
  const { id: cliente } = await inserir(
    "INSERT INTO clientes (nome, uf, implantador_id, iniciado_em, data_meta) VALUES ('Prefeitura', 'RS', $1, $2, $3) RETURNING id",
    [implantador, "2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z"],
  );
  const { id: contato } = await inserir("INSERT INTO contatos (nome, telefone, cliente_id) VALUES ('Servidor', $1, $2) RETURNING id", [
    telefone,
    cliente,
  ]);
  const { id: conversa } = await inserir("INSERT INTO conversas (cliente_id, contato_id) VALUES ($1, $2) RETURNING id", [cliente, contato]);
  return { cliente, conversa };
}

beforeAll(async () => {
  db = await bancoDeTeste();
  base = await carregarBase(resolve("knowledge"));

  const eu = await novoUsuario("maria");
  const outro = await novoUsuario("joao");
  const meu = await novoCliente(eu.id, "+5551900000001");
  const alheio = await novoCliente(outro.id, "+5551900000002");
  Object.assign(ids, { cliente: meu.cliente, conversa: meu.conversa, clienteAlheio: alheio.cliente, conversaAlheia: alheio.conversa });

  auth = { authorization: `Bearer ${emitirToken(eu, SEGREDO, 60, AGORA).token}` };
  authOutro = { authorization: `Bearer ${emitirToken(outro, SEGREDO, 60, AGORA).token}` };

  app = criarApp(base, { logger: false, dashboard: { db, segredoJwt: SEGREDO, agora: () => AGORA } });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.fechar();
});

const novoAgente = (dados: Record<string, unknown>, headers = auth, cliente = ids.cliente) =>
  app.inject({ method: "POST", url: `/api/v1/clients/${cliente}/agents`, headers, payload: dados });

describe("sincronização do knowledge/ com o banco", () => {
  it("separa relevância e texto integral", () => {
    const md = "# T\n\n## Relevância para a implantação\n\n- ponto\n\n## Texto integral\n\n> fonte\n\nArt. 1º";
    expect(secoesDaNorma(md)).toEqual({ relevancia: "- ponto", texto: "> fonte\n\nArt. 1º" });
  });

  it("espelha bases e normas ao subir a aplicação", async () => {
    const { n } = await inserir<{ n: number }>("SELECT count(*) AS n FROM normas", []);
    const total = [...base.dominios.values()].reduce((s, d) => s + d.legislacao.length, 0);
    expect(n).toBe(total);
  });

  it("é idempotente", async () => {
    const r = await sincronizarBases(db, base, AGORA);
    expect(r.bases).toBe(base.dominios.size);
    const { n } = await inserir<{ n: number }>("SELECT count(*) AS n FROM bases_normas", []);
    expect(n).toBe(base.dominios.size);
  });
});

describe("catálogo de bases (tela de criação do agente)", () => {
  it("exige login", async () => {
    expect((await app.inject({ url: "/api/v1/norm-bases" })).statusCode).toBe(401);
  });

  it("lista temáticas prontas primeiro e transversais por último", async () => {
    const bases = (await app.inject({ url: "/api/v1/norm-bases", headers: auth })).json();
    expect(bases[0]).toMatchObject({ id: "planejamento-urbano", maturity: "ready", crossCutting: false, normCount: 8 });
    expect(bases[0].processTypes).toContain("Aprovação de loteamento");
    expect(bases.at(-1)).toMatchObject({ id: "governo-digital", crossCutting: true });
  });

  it("detalha a base com guia e normas, e a norma com relevância e texto", async () => {
    const pu = (await app.inject({ url: "/api/v1/norm-bases/planejamento-urbano", headers: auth })).json();
    expect(pu.guide).toContain("Consulta prévia de viabilidade");
    expect(pu.norms.map((n: { id: string }) => n.id)).toContain("lei-6766-1979");

    const norma = (await app.inject({ url: "/api/v1/norm-bases/planejamento-urbano/norms/lei-6766-1979", headers: auth })).json();
    expect(norma.relevance).toContain("**90 dias**");
    expect(norma.text).toContain("Art. 16");
    expect((await app.inject({ url: "/api/v1/norm-bases/nao-existe", headers: auth })).statusCode).toBe(404);
  });
});

describe("agentes de WhatsApp", () => {
  let agenteId = "";

  it("cria com a base escolhida e inclui as transversais sozinho", async () => {
    const r = await novoAgente({
      name: "Agente Planejamento",
      whatsappNumber: "+55 (51) 99999-0000",
      status: "active",
      normBaseIds: ["planejamento-urbano"],
    });
    expect(r.statusCode).toBe(201);
    const agente = r.json();
    agenteId = agente.id;
    expect(agente).toMatchObject({ clientId: ids.cliente, whatsappNumber: "+5551999990000", status: "active", conversationCount: 0 });
    expect(agente.normBases).toEqual([
      expect.objectContaining({ id: "planejamento-urbano", selection: "selected", maturity: "ready" }),
      expect.objectContaining({ id: "governo-digital", selection: "automatic" }),
    ]);
  });

  it("valida a escolha de bases e o WhatsApp", async () => {
    const soTransversal = await novoAgente({ name: "X", normBaseIds: ["governo-digital"] });
    expect(soTransversal.statusCode).toBe(400);
    expect(soTransversal.json().error.message).toMatch(/base temática/);

    expect((await novoAgente({ name: "X", normBaseIds: ["nao-existe"] })).statusCode).toBe(400);
    expect((await novoAgente({ name: "X", normBaseIds: [] })).statusCode).toBe(400);
    expect((await novoAgente({ name: "X", status: "active", normBaseIds: ["obras"] })).statusCode).toBe(400);
    expect((await novoAgente({ name: "X", whatsappNumber: "123", normBaseIds: ["obras"] })).statusCode).toBe(400);
    expect((await novoAgente({ name: "X", whatsappNumber: "5551999990000", normBaseIds: ["obras"] })).statusCode).toBe(409);
  });

  it("não deixa mexer em agente ou cliente de outro implantador", async () => {
    expect((await novoAgente({ name: "X", normBaseIds: ["obras"] }, auth, ids.clienteAlheio)).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/agents/${agenteId}`, headers: authOutro })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/v1/agents/nao-e-uuid", headers: auth })).statusCode).toBe(404);
  });

  it("troca as bases do agente", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: `/api/v1/agents/${agenteId}`,
      headers: auth,
      payload: { normBaseIds: ["planejamento-urbano", "obras"] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().normBases.map((b: { id: string }) => b.id).sort()).toEqual(["governo-digital", "obras", "planejamento-urbano"]);

    const lista = (await app.inject({ url: `/api/v1/clients/${ids.cliente}/agents`, headers: auth })).json();
    expect(lista).toHaveLength(1);
  });

  it("liga a conversa de WhatsApp ao agente", async () => {
    const r = await app.inject({ method: "PUT", url: `/api/v1/conversations/${ids.conversa}/agent`, headers: auth, payload: { agentId: agenteId } });
    expect(r.json()).toEqual({ conversationId: ids.conversa, agentId: agenteId });
    expect((await app.inject({ url: `/api/v1/agents/${agenteId}`, headers: auth })).json().conversationCount).toBe(1);

    const alheia = await app.inject({
      method: "PUT",
      url: `/api/v1/conversations/${ids.conversaAlheia}/agent`,
      headers: auth,
      payload: { agentId: agenteId },
    });
    expect(alheia.statusCode).toBe(404);
  });

  it("entrega ao agente o conhecimento das bases dele", async () => {
    const k = (await app.inject({ url: `/api/v1/agents/${agenteId}/knowledge`, headers: auth })).json();
    const pu = k.bases.find((b: { id: string }) => b.id === "planejamento-urbano");
    expect(pu.guide).toContain("Reurb");
    expect(pu.norms.find((n: { id: string }) => n.id === "lei-13465-2017").relevance).toContain("180 dias");
    expect(k.bases.map((b: { id: string }) => b.id)).toContain("governo-digital");
  });

  it("base que sai do knowledge/ fica indisponível sem quebrar o agente", async () => {
    const semObras = { ...base, dominios: new Map([...base.dominios].filter(([id]) => id !== "obras")) };
    const r = await sincronizarBases(db, semObras, AGORA);
    expect(r.indisponiveis).toEqual(["obras"]);

    const agente = (await app.inject({ url: `/api/v1/agents/${agenteId}`, headers: auth })).json();
    expect(agente.normBases.find((b: { id: string }) => b.id === "obras")).toMatchObject({ available: false });
    const catalogo = (await app.inject({ url: "/api/v1/norm-bases", headers: auth })).json();
    expect(catalogo.map((b: { id: string }) => b.id)).not.toContain("obras");

    await sincronizarBases(db, base, AGORA); // volta ao normal
  });
});
