import { beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { emitirToken, hashSenha, verificarToken } from "../src/dashboard/auth.js";
import { resumoMetricas, serieMetrica, statusCliente } from "../src/dashboard/metricas.js";
import { MINUTOS_FLUXO_MANUAL, MINUTOS_MANUAIS_POR_CATEGORIA, REUNIOES_MANUAIS_POR_SECRETARIA } from "../src/dashboard/parametros.js";
import { mudarStatusProcesso } from "../src/dashboard/repositorio.js";
import type { Banco } from "../src/db/banco.js";
import { idDemo, semearDemo } from "../src/db/seed.js";
import type { BaseConhecimento } from "../src/knowledge/loader.js";
import { bancoDeTeste } from "./apoio/pglite.js";

const AGORA = new Date("2026-10-24T12:00:00Z");
const SENHA = "senha-teste";
const SEGREDO = "segredo-de-teste-123456";
const base = { sistema: [], dominios: new Map() } as unknown as BaseConhecimento;

function appCom(db: Banco) {
  return criarApp(base, { logger: false, dashboard: { db, segredoJwt: SEGREDO, agora: () => AGORA } });
}

async function login(app: ReturnType<typeof appCom>, username: string) {
  const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password: SENHA } });
  return { authorization: `Bearer ${r.json().token as string}` };
}

// ids fixos do banco pequeno
const U1 = "00000000-0000-4000-8000-000000000001";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const uuid = (fim: string) => `00000000-0000-4000-8000-0000000000${fim}`;
const S1 = uuid("5a"), S2 = uuid("5b"), S3 = uuid("5c");
const P1 = uuid("a1"), P2 = uuid("a2"), P3 = uuid("a3"), P4 = uuid("a4");

/** Banco mínimo com números conhecidos, para conferir as fórmulas. */
async function bancoPequeno() {
  const db = await bancoDeTeste();
  await db.consultar(`INSERT INTO usuarios (id, nome, username, senha_hash, papel) VALUES ($1, 'Imp', 'imp', $2, 'implementer')`, [U1, hashSenha(SENHA)]);
  await db.executar(`
    INSERT INTO clientes (id, nome, uf, implantador_id, iniciado_em, data_meta)
      VALUES ('${C1}', 'Prefeitura X', 'RS', '${U1}', '2026-10-01T00:00:00Z', '2026-11-20T00:00:00Z');
    INSERT INTO secretarias (id, cliente_id, nome) VALUES ('${S1}', '${C1}', 'Obras'), ('${S2}', '${C1}', 'Saúde'), ('${S3}', '${C1}', 'Fazenda');
    -- p1: validado em 2 dias, 1 ida e volta; p2: confirmado, 3 idas e vindas; p3: em coleta; p4: não iniciado
    INSERT INTO processos (id, cliente_id, secretaria_id, nome, status, idas_e_vindas, primeiro_contato_em, concluido_em, validado_em) VALUES
      ('${P1}', '${C1}', '${S1}', 'Alvará', 'validated', 1, '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z', '2026-10-07T00:00:00Z'),
      ('${P2}', '${C1}', '${S2}', 'Sanitário', 'confirmed', 3, '2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z', NULL),
      ('${P3}', '${C1}', '${S2}', 'Vistoria', 'collecting', 0, '2026-10-20T00:00:00Z', NULL, NULL),
      ('${P4}', '${C1}', '${S3}', 'ITBI', 'not_started', 0, NULL, NULL, NULL);
    INSERT INTO campos_processo (processo_id, chave, rotulo, categoria, valor, status, origem, coletado_em) VALUES
      ('${P1}', 'docs', 'Documentos', 'documento', 'x', 'filled', 'agente', '2026-10-05T10:00:00Z'),
      ('${P1}', 'taxa', 'Taxa', 'taxa', 'x', 'filled', 'agente', '2026-10-05T11:00:00Z'),
      ('${P1}', 'etapas', 'Etapas', 'etapa', 'x', 'filled', 'implantador', '2026-10-05T12:00:00Z'),
      ('${P3}', 'docs', 'Documentos', 'documento', 'x', 'to_validate', 'agente', '2026-10-20T10:00:00Z'),
      ('${P3}', 'prazo', 'Prazo', 'prazo', NULL, 'pending', 'agente', NULL);
    INSERT INTO reunioes (cliente_id, realizada_em, duracao_minutos, notas, registrada_por) VALUES
      ('${C1}', '2026-10-02T14:00:00Z', 60, 'kickoff', '${U1}'),
      ('${C1}', '2026-10-15T14:00:00Z', 30, '', '${U1}');
  `);
  return db;
}

const OUTUBRO = { de: new Date("2026-10-01T00:00:00Z"), ate: new Date("2026-10-25T00:00:00Z") };

describe("métricas — fórmulas", () => {
  let db: Banco;
  beforeAll(async () => {
    db = await bancoPequeno();
  });

  it("resumo com reuniões vs baseline, horas economizadas e tempo de fluxo", async () => {
    const r = await resumoMetricas(db, [C1], OUTUBRO);

    // secretarias com processo em andamento no período: s1 (p1) e s2 (p2, p3)
    const baseline = 2 * REUNIOES_MANUAIS_POR_SECRETARIA;
    expect(r.meetings).toEqual({ value: 2, baseline, deltaPct: Math.round(((2 - baseline) / baseline) * 100) });

    // só itens do agente e não pendentes: documento (p1) + taxa (p1) + documento a validar (p3)
    const m = MINUTOS_MANUAIS_POR_CATEGORIA;
    expect(r.hoursSaved.valueMinutes).toBe(m.documento + m.taxa + m.documento);

    // p1: 05/10 → 07/10 = 2 dias
    expect(r.flowCreation.avgMinutes).toBe(2 * 24 * 60);
    expect(r.flowCreation.baselineMinutes).toBe(MINUTOS_FLUXO_MANUAL);
    expect(r.flowCreation.deltaPct).toBe(Math.round(((2880 - MINUTOS_FLUXO_MANUAL) / MINUTOS_FLUXO_MANUAL) * 100));

    expect(r.processes).toEqual({ total: 4, complete: 2, validated: 1 });
    expect(r.backAndForthsAvg).toBe(2); // média entre p1 (1) e p2 (3)
  });

  it("período sem dados devolve zeros e nulls, sem dividir por zero", async () => {
    const r = await resumoMetricas(db, [C1], { de: new Date("2025-01-01"), ate: new Date("2025-02-01") });
    expect(r.meetings).toEqual({ value: 0, baseline: 0, deltaPct: null });
    expect(r.flowCreation.avgMinutes).toBeNull();
    expect(r.flowCreation.deltaPct).toBeNull();
    expect((await resumoMetricas(db, [], OUTUBRO)).processes.total).toBe(0);
  });

  it("séries por semana começam na segunda e processesComplete é acumulado", async () => {
    const semanas = await serieMetrica(db, [C1], "meetings", OUTUBRO, "week");
    expect(semanas[0]).toEqual({ date: "2026-09-28", value: 1 }); // 01/10/2026 é quinta
    // semanas de 28/09, 05/10, 12/10 e 19/10 (o período termina em 25/10, exclusive)
    expect(semanas.map((p) => p.value)).toEqual([1, 0, 1, 0]);

    const completos = (await serieMetrica(db, [C1], "processesComplete", OUTUBRO, "week")).map((p) => p.value);
    expect(completos).toEqual([0, 1, 2, 2]);

    const fluxo = (await serieMetrica(db, [C1], "flowCreation", OUTUBRO, "week")).map((p) => p.value);
    expect(fluxo).toEqual([null, 2880, null, null]);

    const dias = await serieMetrica(db, [C1], "hoursSaved", OUTUBRO, "day");
    expect(dias).toHaveLength(24);
    expect(dias.find((p) => p.date === "2026-10-05")!.value).toBe(MINUTOS_MANUAIS_POR_CATEGORIA.documento + MINUTOS_MANUAIS_POR_CATEGORIA.taxa);
  });

  it("status do cliente", () => {
    const a = { processesTotal: 100, processesComplete: 50, processesValidated: 10, processesStarted: 60 };
    const inicio = "2026-10-01T00:00:00Z";
    const meta = "2026-11-20T00:00:00Z"; // 50 dias; em 24/10 o esperado é ~46%
    expect(statusCliente(a, inicio, meta, AGORA)).toBe("in_progress");
    expect(statusCliente({ ...a, processesComplete: 20 }, inicio, meta, AGORA)).toBe("at_risk");
    expect(statusCliente(a, inicio, "2026-10-20T00:00:00Z", AGORA)).toBe("at_risk");
    expect(statusCliente({ ...a, processesStarted: 0, processesComplete: 0 }, inicio, meta, AGORA)).toBe("onboarding");
    expect(statusCliente({ ...a, processesComplete: 100, processesValidated: 100 }, inicio, meta, AGORA)).toBe("completed");
  });

  it("mudarStatusProcesso carimba datas e conta idas e vindas", async () => {
    const outro = await bancoPequeno();
    await mudarStatusProcesso(outro, P4, "collecting", new Date("2026-10-21T00:00:00Z"));
    await mudarStatusProcesso(outro, P4, "awaiting_confirmation", new Date("2026-10-22T00:00:00Z"));
    await mudarStatusProcesso(outro, P4, "collecting", new Date("2026-10-22T06:00:00Z")); // prefeitura corrigiu
    await mudarStatusProcesso(outro, P4, "confirmed", new Date("2026-10-23T00:00:00Z"));
    await mudarStatusProcesso(outro, P4, "validated", new Date("2026-10-24T00:00:00Z"));
    const [p] = await outro.consultar("SELECT * FROM processos WHERE id = $1", [P4]);
    expect(p).toMatchObject({
      status: "validated",
      idas_e_vindas: 1,
      primeiro_contato_em: "2026-10-21T00:00:00.000Z",
      concluido_em: "2026-10-23T00:00:00.000Z",
      validado_em: "2026-10-24T00:00:00.000Z",
    });
  });
});

describe("auth", () => {
  it("token expira e rejeita assinatura adulterada", () => {
    const u = { id: "u1", name: "x", username: "x", role: "head" as const };
    const { token } = emitirToken(u, SEGREDO, 10, AGORA);
    expect(verificarToken(token, SEGREDO, AGORA)).toBe("u1");
    expect(verificarToken(token, SEGREDO, new Date(AGORA.getTime() + 11 * 60_000))).toBeUndefined();
    expect(verificarToken(token, "outro-segredo-qualquer", AGORA)).toBeUndefined();
  });
});

describe("API do dashboard (seed de demo)", () => {
  let app: ReturnType<typeof appCom>;
  const id = idDemo;
  beforeAll(async () => {
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: SENHA, agora: AGORA });
    app = appCom(db);
  });

  it("login, me e credenciais inválidas", async () => {
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "maria.silva", password: SENHA } });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toEqual({ id: id("u-maria"), name: "Maria Silva", username: "maria.silva", role: "implementer" });

    const me = await app.inject({ url: "/api/v1/auth/me", headers: { authorization: `Bearer ${r.json().token}` } });
    expect(me.json().id).toBe(id("u-maria"));

    const ruim = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "maria.silva", password: "x" } });
    expect(ruim.statusCode).toBe(401);
    expect(ruim.json().error.code).toBe("INVALID_CREDENTIALS");

    expect((await app.inject({ url: "/api/v1/clients" })).statusCode).toBe(401);
  });

  it("implantador só vê os próprios clientes", async () => {
    const h = await login(app, "maria.silva");
    const clientes = (await app.inject({ url: "/api/v1/clients", headers: h })).json();
    expect(clientes.items.map((c: { id: string }) => c.id).sort()).toEqual([id("m-canoas"), id("m-toledo")].sort());

    expect((await app.inject({ url: `/api/v1/clients/${id("m-joinville")}`, headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/processes/${id("m-joinville-sec1-p1")}`, headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/conversations/${id("m-joinville-sec1-conv1")}`, headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/metrics/summary?implementerId=${id("u-joao")}`, headers: h })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/v1/implementers", headers: h })).statusCode).toBe(403);
    // id que não é uuid: 404, não erro de cast
    expect((await app.inject({ url: "/api/v1/processes/xpto", headers: h })).statusCode).toBe(404);
  });

  it("head vê tudo, filtra por implantador e recebe o time", async () => {
    const h = await login(app, "head");
    const todos = (await app.inject({ url: "/api/v1/clients?pageSize=50", headers: h })).json();
    expect(todos.total).toBe(7);
    const status = new Set(todos.items.map((c: { status: string }) => c.status));
    for (const s of ["onboarding", "in_progress", "completed", "at_risk"]) expect(status).toContain(s);

    const doJoao = (await app.inject({ url: `/api/v1/clients?implementerId=${id("u-joao")}`, headers: h })).json();
    expect(doJoao.total).toBe(2);

    const time = (await app.inject({ url: "/api/v1/implementers", headers: h })).json();
    expect(time).toHaveLength(3);
    expect(time.find((i: { id: string }) => i.id === id("u-ana"))).toMatchObject({ clientsCount: 3, processesTotal: 300 });

    const detalhe = (await app.inject({ url: `/api/v1/implementers/${id("u-ana")}`, headers: h })).json();
    expect(detalhe.clients).toHaveLength(3);
  });

  it("resumo do cliente bate com a soma das secretarias e com o resumo de métricas", async () => {
    const h = await login(app, "head");
    const canoas = id("m-canoas");
    const c = (await app.inject({ url: `/api/v1/clients/${canoas}`, headers: h })).json();
    expect(c.secretariats).toHaveLength(5);
    expect(c.secretariats.reduce((s: number, x: { processesComplete: number }) => s + x.processesComplete, 0)).toBe(c.processesComplete);

    const m = (await app.inject({ url: `/api/v1/metrics/summary?clientId=${canoas}&from=2026-01-01`, headers: h })).json();
    expect(m.processes.total).toBe(c.processesTotal);
    expect(m.processes.complete).toBe(c.processesComplete);
    expect(m.hoursSaved.valueMinutes).toBe(c.hoursSavedMinutes);
    expect(m.meetings.value).toBe(c.meetingsCount);
    expect(m.meetings.value).toBeLessThan(m.meetings.baseline);
  });

  it("processos, detalhe, conversas e mensagens no formato do contrato", async () => {
    const h = await login(app, "maria.silva");
    const canoas = id("m-canoas");
    const procs = (await app.inject({ url: `/api/v1/clients/${canoas}/processes?pageSize=5&secretariat=Secretaria de Obras`, headers: h })).json();
    expect(procs.total).toBe(20);
    expect(procs.items).toHaveLength(5);

    const p = (await app.inject({ url: `/api/v1/processes/${procs.items[0].id}`, headers: h })).json();
    expect(p.fields).toHaveLength(8);
    expect(p.fields[0]).toHaveProperty("status");

    const convs = (await app.inject({ url: `/api/v1/clients/${canoas}/conversations`, headers: h })).json();
    expect(convs.total).toBeGreaterThan(0);
    const conv = (await app.inject({ url: `/api/v1/conversations/${convs.items[0].id}`, headers: h })).json();
    expect(conv.messages.length).toBe(conv.messagesCount);
    expect(conv.processesTouched.length).toBeGreaterThan(0);
    expect(conv.messages.find((m: { kind: string }) => m.kind === "quick_replies").quickReplies).toHaveLength(2);
  });

  it("registra reunião e ela entra na métrica", async () => {
    const h = await login(app, "maria.silva");
    const toledo = id("m-toledo");
    const url = `/api/v1/metrics/summary?clientId=${toledo}&from=2026-01-01`;
    const antes = (await app.inject({ url, headers: h })).json().meetings.value;

    const r = await app.inject({
      method: "POST", url: `/api/v1/clients/${toledo}/meetings`, headers: h,
      payload: { date: "2026-10-23T15:00:00Z", durationMinutes: 45, notes: "Validação" },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ clientId: toledo, durationMinutes: 45, date: "2026-10-23T15:00:00.000Z" });
    expect((await app.inject({ url, headers: h })).json().meetings.value).toBe(antes + 1);

    const invalida = await app.inject({ method: "POST", url: `/api/v1/clients/${toledo}/meetings`, headers: h, payload: { date: "x" } });
    expect(invalida.statusCode).toBe(400);
    expect(invalida.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("timeseries valida a métrica e devolve pontos", async () => {
    const h = await login(app, "head");
    const ok = await app.inject({ url: "/api/v1/metrics/timeseries?metric=processesComplete&from=2026-09-01&to=2026-10-24&granularity=week", headers: h });
    const pontos = ok.json().points as { value: number }[];
    expect(pontos.length).toBeGreaterThan(5);
    expect(pontos.every((p, i) => i === 0 || p.value >= pontos[i - 1]!.value)).toBe(true);
    expect((await app.inject({ url: "/api/v1/metrics/timeseries?metric=xpto", headers: h })).statusCode).toBe(400);
  });
});
