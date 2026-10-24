import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clienteAgenteHttp } from "../src/agente/cliente.js";
import { criarApp } from "../src/app.js";
import type { Banco } from "../src/db/banco.js";
import { modeloDeDemo, semearDemo } from "../src/db/seed.js";
import { carregarBase } from "../src/knowledge/loader.js";
import { agenteFalso } from "./apoio/agente-falso.js";
import { bancoDeTeste } from "./apoio/pglite.js";

/**
 * Ensaio de falhas (E2): o back conversa com o agente por HTTP de verdade, e o "agente" é um servidor
 * local que podemos derrubar, travar ou fazer responder lixo.
 */
const AGORA = new Date("2026-10-24T12:00:00Z");
const base = await carregarBase("knowledge");
const modelo = modeloDeDemo(base)!;
const FONE = "+5545999991111";
const SEGREDO = "segredo-de-teste-123456";

type Comportamento = "ok" | "erro500" | "travado" | "lixo";
let comportamento: Comportamento = "ok";
let servidor: Server;
let urlAgente: string;
const falso = agenteFalso(modelo);

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (d) => (corpo += d));
    req.on("end", async () => {
      if (comportamento === "travado") return; // nunca responde
      if (comportamento === "erro500") return void res.writeHead(500).end("boom");
      if (comportamento === "lixo") return void res.writeHead(200, { "content-type": "application/json" }).end('{"foo":1}');
      const r = await falso.agente.turno(JSON.parse(corpo));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  urlAgente = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => {
  servidor.closeAllConnections();
  servidor.close();
});

const montarApp = (db: Banco, agente = clienteAgenteHttp(urlAgente, { timeoutMs: 400 })) =>
  criarApp(base, { logger: false, agente, limiteChatPorMinuto: 1000, dashboard: { db, segredoJwt: SEGREDO, agora: () => AGORA } });

async function sessao(app: ReturnType<typeof montarApp>) {
  const { registrationToken } = (await app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: FONE } })).json();
  const mun = (await app.inject({ url: "/api/v1/catalog/municipalities?q=toledo" })).json()[0];
  const r = await app.inject({
    method: "POST", url: "/api/v1/chat/register",
    payload: { registrationToken, phone: FONE, name: "Ana", municipality: { id: mun.id }, secretariat: { name: "Meio Ambiente" } },
  });
  return r.json() as { sessionId: string; sessionToken: string };
}
const enviar = (app: ReturnType<typeof montarApp>, s: { sessionId: string; sessionToken: string }, text: string) =>
  app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: { "x-session-token": s.sessionToken }, payload: { text } });
const historico = async (app: ReturnType<typeof montarApp>, s: { sessionId: string; sessionToken: string }) =>
  (await app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: { "x-session-token": s.sessionToken } })).json() as { role: string; text: string }[];

describe("ensaio de falhas: agente fora do ar, lento ou com resposta inválida", () => {
  it("cada falha vira um erro claro, nada se perde e o reenvio funciona sem duplicar", async () => {
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: "x", agora: AGORA, modelo });
    const app = montarApp(db);
    const s = await sessao(app);

    comportamento = "erro500";
    const r500 = await enviar(app, s, "preciso do alvará");
    expect(r500.statusCode).toBe(502);
    expect(r500.json().error).toMatchObject({ code: "AGENT_UNAVAILABLE" });

    comportamento = "lixo";
    const lixo = await enviar(app, s, "preciso do alvará");
    expect(lixo.statusCode).toBe(502);
    expect(lixo.json().error.message).toMatch(/fora do contrato/);

    comportamento = "travado";
    const t0 = Date.now();
    const lento = await enviar(app, s, "preciso do alvará");
    expect(lento.statusCode).toBe(504);
    expect(lento.json().error.code).toBe("AGENT_TIMEOUT");
    expect(Date.now() - t0).toBeLessThan(3000);

    // a conversa só tem a saudação e UMA mensagem do usuário, apesar de 3 tentativas
    expect((await historico(app, s)).map((m) => m.role)).toEqual(["agent", "user"]);
    expect((await db.consultar("SELECT 1 FROM formularios WHERE conversa_id = $1", [s.sessionId])).length).toBe(0);

    comportamento = "ok";
    const ok = await enviar(app, s, "preciso do alvará");
    expect(ok.statusCode).toBe(200);
    expect((await historico(app, s)).map((m) => m.role)).toEqual(["agent", "user", "agent"]);
    // o back não ficou preso: a trava de "uma mensagem por vez" foi liberada a cada falha
    expect((await enviar(app, s, "e o prazo é 30 dias")).statusCode).toBe(200);
  });

  it("agente com a porta fechada: 502 imediato", async () => {
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: "x", agora: AGORA, modelo });
    const app = montarApp(db, clienteAgenteHttp("http://127.0.0.1:1", { timeoutMs: 400 }));
    const s = await sessao(app);
    const r = await enviar(app, s, "oi");
    expect(r.statusCode).toBe(502);
    expect(r.json().error.code).toBe("AGENT_UNAVAILABLE");
  });

  it("sem agente configurado: 503 claro", async () => {
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: "x", agora: AGORA, modelo });
    const app = criarApp(base, { logger: false, dashboard: { db, segredoJwt: SEGREDO, agora: () => AGORA } });
    const s = await sessao(app);
    const r = await enviar(app, s, "oi");
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe("AGENT_UNAVAILABLE");
  });
});

describe("ensaio de falhas: reinício do back e sessões inválidas", () => {
  it("o back reinicia no meio da conversa e a conversa continua (está no banco)", async () => {
    comportamento = "ok";
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: "x", agora: AGORA, modelo });
    const antes = montarApp(db);
    const s = await sessao(antes);
    expect((await enviar(antes, s, "licença ambiental prévia")).statusCode).toBe(200);
    await antes.close();

    const depois = montarApp(db); // processo novo, sem nada em memória
    expect((await historico(depois, s)).map((m) => m.role)).toEqual(["agent", "user", "agent"]);
    const r = await enviar(depois, s, "o prazo é 30 dias"); // 2ª mensagem: o agente já entrega o formulário
    expect(r.statusCode).toBe(200);
    expect(r.json().agentMessage.kind).toBe("form");
    // o formulário em andamento foi devolvido ao agente depois do reinício
    expect(falso.pedidos.at(-1)!.form).not.toBeNull();
  });

  it("token de sessão inválido, adulterado ou de outra sessão: 401", async () => {
    comportamento = "ok";
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: "x", agora: AGORA, modelo });
    const app = montarApp(db);
    const s = await sessao(app);
    for (const token of ["", "xxx", `${s.sessionToken}x`, s.sessionToken.slice(1)]) {
      const r = await app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: { "x-session-token": token } });
      expect(r.statusCode).toBe(401);
    }
    expect((await enviar(app, { sessionId: s.sessionId, sessionToken: "xxx" }, "oi")).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/chat/sessions/nao-e-uuid/messages", headers: { "x-session-token": s.sessionToken } })).statusCode).toBe(401);
  });
});
