import { beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { emitirToken, hashSenha, verificarToken } from "../src/dashboard/auth.js";
import lapJson from "../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json" with { type: "json" };
import { formularioParaCampos } from "../src/dashboard/campos.js";
import { resumoMetricas, serieMetrica, statusCliente } from "../src/dashboard/metricas.js";
import {
  MINUTOS_FLUXO_MANUAL,
  MINUTOS_MANUAIS_POR_CATEGORIA,
  minutosManuais,
  REUNIOES_MANUAIS_POR_SECRETARIA,
} from "../src/dashboard/parametros.js";
import { gravarCamposProcesso, mudarStatusProcesso } from "../src/dashboard/repositorio.js";
import { novoFormulario } from "../src/implantacao/formulario.js";
import { ProcessoModelo } from "../src/knowledge/schemas.js";
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

/** Nenhum valor da resposta pode vir null (política de "sem dado", D1). */
function semNull(valor: unknown, caminho = "$"): void {
  expect(valor, caminho).not.toBeNull();
  if (Array.isArray(valor)) valor.forEach((v, i) => semNull(v, `${caminho}[${i}]`));
  else if (typeof valor === "object") for (const [k, v] of Object.entries(valor as object)) semNull(v, `${caminho}.${k}`);
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

  it("período sem dados devolve zeros com a contagem de amostras, sem null e sem dividir por zero", async () => {
    const r = await resumoMetricas(db, [C1], { de: new Date("2025-01-01"), ate: new Date("2025-02-01") });
    expect(r.meetings).toEqual({ value: 0, baseline: 0, deltaPct: 0 });
    expect(r.flowCreation).toEqual({ avgMinutes: 0, baselineMinutes: MINUTOS_FLUXO_MANUAL, deltaPct: 0, samples: 0 });
    semNull(r);
    const vazio = await resumoMetricas(db, [], OUTUBRO);
    expect(vazio.processes.total).toBe(0);
    expect(vazio.backAndForthsAvg).toBe(0);
    semNull(vazio);
  });

  it("séries por semana começam na segunda e processesComplete é acumulado", async () => {
    const semanas = await serieMetrica(db, [C1], "meetings", OUTUBRO, "week");
    expect(semanas[0]).toEqual({ date: "2026-09-28", value: 1 }); // 01/10/2026 é quinta
    // semanas de 28/09, 05/10, 12/10 e 19/10 (o período termina em 25/10, exclusive)
    expect(semanas.map((p) => p.value)).toEqual([1, 0, 1, 0]);

    const completos = (await serieMetrica(db, [C1], "processesComplete", OUTUBRO, "week")).map((p) => p.value);
    expect(completos).toEqual([0, 1, 2, 2]);

    const fluxo = await serieMetrica(db, [C1], "flowCreation", OUTUBRO, "week");
    expect(fluxo.map((p) => p.value)).toEqual([0, 2880, 0, 0]);
    expect(fluxo.map((p) => p.samples)).toEqual([0, 1, 0, 0]);

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

describe("métricas — fluxo real (formulário → campos → status)", () => {
  // usuários e clientes deste cenário
  const HEAD = uuid("e1"), U2 = uuid("e2"), C2 = uuid("c2");
  const lap = ProcessoModelo.parse(lapJson);
  const orgao = { municipio: "Prefeitura X", uf: "RS", orgao: "Meio Ambiente", responsavel: { nome: "Fulano" } };
  const m = MINUTOS_MANUAIS_POR_CATEGORIA;
  const t = (s: string) => new Date(s);
  const PERIODO = "from=2026-10-05&to=2026-10-24"; // [05/10, 25/10)

  // p1 confirmado sem pendências: todos os itens contam
  const prazos = lap.fluxo.etapas.filter((e) => e.prazoDias !== undefined).length + (lap.fluxo.prazoTotalDias ? 1 : 0);
  const minutosP1 =
    lap.documentos.length * m.documento + lap.taxas.length * m.taxa + lap.fluxo.etapas.length * m.etapa + prazos * m.prazo +
    lap.setores.length * m.setor + lap.despachos.length * m.despacho +
    lap.formulario.secoes.reduce((s, x) => s + x.campos.length, 0) * m.campo_formulario +
    lap.baseLegal.length * m.base_legal + 2 * m.outro; // resumo e documento final
  // p2 em rascunho: só os itens fora das pendências
  const rascunhoP2 = formularioParaCampos(novoFormulario("f2", lap, orgao, t("2026-10-20T08:30:00Z")));
  const minutosP2 = rascunhoP2.filter((c) => c.status !== "pending").reduce((s, c) => s + minutosManuais(c.categoria), 0);
  // p1: 1º contato 05/10 09:00, validado pelo painel em AGORA (24/10 12:00)
  const fluxoP1 = (AGORA.getTime() - Date.parse("2026-10-05T09:00:00Z")) / 60_000;

  let app: ReturnType<typeof appCom>;
  let imp: { authorization: string };

  beforeAll(async () => {
    const db = await bancoDeTeste();
    await db.consultar(
      `INSERT INTO usuarios (id, nome, username, senha_hash, papel) VALUES
         ($1, 'Imp', 'imp', $4, 'implementer'), ($2, 'Head', 'chefe', $4, 'head'), ($3, 'Sem Clientes', 'vazio', $4, 'implementer')`,
      [U1, HEAD, U2, hashSenha(SENHA)],
    );
    await db.executar(`
      INSERT INTO clientes (id, nome, uf, implantador_id, iniciado_em, data_meta) VALUES
        ('${C1}', 'Prefeitura X', 'RS', '${U1}', '2026-10-01T00:00:00Z', '2026-11-20T00:00:00Z'),
        ('${C2}', 'Prefeitura Sem Processos', 'SC', '${U1}', '2026-10-01T00:00:00Z', '2026-12-20T00:00:00Z');
      INSERT INTO secretarias (id, cliente_id, nome) VALUES ('${S1}', '${C1}', 'Meio Ambiente'), ('${S2}', '${C1}', 'Obras');
      INSERT INTO processos (id, cliente_id, secretaria_id, nome, status) VALUES
        ('${P1}', '${C1}', '${S1}', 'LAP', 'not_started'),
        ('${P2}', '${C1}', '${S2}', 'LAP Obras', 'not_started'),
        ('${P3}', '${C1}', '${S2}', 'ITBI', 'not_started');
      -- bordas: domingo 23:59:59 e segunda 00:00 caem em semanas diferentes; a de 04/10 fica antes do período
      INSERT INTO reunioes (cliente_id, realizada_em, duracao_minutos, notas, registrada_por) VALUES
        ('${C1}', '2026-10-04T23:59:59Z', 60, '', '${U1}'),
        ('${C1}', '2026-10-11T23:59:59Z', 60, '', '${U1}'),
        ('${C1}', '2026-10-12T00:00:00Z', 60, '', '${U1}');
    `);

    // p1: coleta, form apresentado, prefeitura corrige (1 ida e volta), reapresentado e confirmado
    await mudarStatusProcesso(db, P1, "collecting", t("2026-10-05T09:00:00Z"));
    const rascunhoP1 = novoFormulario("f1", lap, orgao, t("2026-10-05T10:00:00Z"));
    await gravarCamposProcesso(db, P1, formularioParaCampos(rascunhoP1));
    await mudarStatusProcesso(db, P1, "awaiting_confirmation", t("2026-10-06T09:00:00Z"));
    await mudarStatusProcesso(db, P1, "collecting", t("2026-10-06T15:00:00Z"));
    await mudarStatusProcesso(db, P1, "awaiting_confirmation", t("2026-10-07T09:00:00Z"));
    const confirmado = { ...rascunhoP1, status: "confirmado" as const, pendencias: [], atualizadoEm: "2026-10-08T09:00:00.000Z" };
    await gravarCamposProcesso(db, P1, formularioParaCampos(confirmado));
    await mudarStatusProcesso(db, P1, "confirmed", t("2026-10-08T09:00:00Z"));

    // p2: só começou a coleta
    await mudarStatusProcesso(db, P2, "collecting", t("2026-10-20T08:00:00Z"));
    await gravarCamposProcesso(db, P2, rascunhoP2);

    app = appCom(db);
    imp = await login(app, "imp");
    // p1: o implantador leva ao dev e valida pelo painel
    for (const status of ["sent_to_dev", "validated"]) {
      const r = await app.inject({ method: "POST", url: `/api/v1/processes/${P1}/status`, headers: imp, payload: { status } });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ id: P1, status });
    }
  });

  it("resumo: reuniões vs baseline, horas por categoria, tempo de fluxo, completos e idas e vindas", async () => {
    const r = (await app.inject({ url: `/api/v1/metrics/summary?clientId=${C1}&${PERIODO}`, headers: imp })).json();
    expect(r.meetings).toEqual({ value: 2, baseline: 2 * REUNIOES_MANUAIS_POR_SECRETARIA, deltaPct: -67 });
    expect(r.hoursSaved.valueMinutes).toBe(minutosP1 + minutosP2);
    expect(r.flowCreation).toEqual({
      avgMinutes: fluxoP1,
      baselineMinutes: MINUTOS_FLUXO_MANUAL,
      deltaPct: Math.round(((fluxoP1 - MINUTOS_FLUXO_MANUAL) / MINUTOS_FLUXO_MANUAL) * 100),
      samples: 1,
    });
    expect(r.processes).toEqual({ total: 3, complete: 1, validated: 1 });
    expect(r.backAndForthsAvg).toBe(1);
    semNull(r);

    // "to" só com data inclui o dia; antes de 20/10 o p2 ainda não tinha itens
    const ate19 = (await app.inject({ url: `/api/v1/metrics/summary?clientId=${C1}&from=2026-10-05&to=2026-10-19`, headers: imp })).json();
    expect(ate19.hoursSaved.valueMinutes).toBe(minutosP1);
    expect(ate19.flowCreation.samples).toBe(0);
  });

  it("processo validado pelo painel fica 100% preenchido e carimbado", async () => {
    const p = (await app.inject({ url: `/api/v1/processes/${P1}`, headers: imp })).json();
    expect(p).toMatchObject({ status: "validated", completeness: 100, backAndForths: 1 });
    expect(p.fields.every((f: { status: string }) => f.status === "filled")).toBe(true);
  });

  it("séries por dia e semana com bordas em UTC", async () => {
    const serie = async (metric: string, g: string) =>
      (await app.inject({ url: `/api/v1/metrics/timeseries?metric=${metric}&granularity=${g}&clientId=${C1}&${PERIODO}`, headers: imp })).json()
        .points as { date: string; value: number; samples?: number }[];

    expect((await serie("meetings", "week")).map((p) => [p.date, p.value])).toEqual([
      ["2026-10-05", 1],
      ["2026-10-12", 1],
      ["2026-10-19", 0],
    ]);

    const horas = await serie("hoursSaved", "day");
    expect(horas).toHaveLength(20);
    expect(horas.find((p) => p.date === "2026-10-08")!.value).toBe(minutosP1);
    expect(horas.find((p) => p.date === "2026-10-20")!.value).toBe(minutosP2);
    expect(horas.reduce((s, p) => s + p.value, 0)).toBe(minutosP1 + minutosP2);

    expect(await serie("flowCreation", "week")).toEqual([
      { date: "2026-10-05", value: 0, samples: 0 },
      { date: "2026-10-12", value: 0, samples: 0 },
      { date: "2026-10-19", value: fluxoP1, samples: 1 },
    ]);

    const completos = await serie("processesComplete", "day");
    expect(completos.find((p) => p.date === "2026-10-07")!.value).toBe(0);
    expect(completos.find((p) => p.date === "2026-10-08")!.value).toBe(1);
  });

  it("agregados por cliente e por implantador batem com o resumo do mesmo escopo", async () => {
    const head = await login(app, "chefe");
    // o relógio do teste é fixo e o p1 foi validado exatamente em AGORA: o "to" padrão (agora, exclusivo) o deixaria de fora
    const historico = "from=2026-01-01&to=2026-10-24";
    const c = (await app.inject({ url: `/api/v1/clients/${C1}`, headers: head })).json();
    const mc = (await app.inject({ url: `/api/v1/metrics/summary?clientId=${C1}&${historico}`, headers: head })).json();
    expect(c).toMatchObject({
      processesTotal: mc.processes.total,
      processesComplete: mc.processes.complete,
      hoursSavedMinutes: mc.hoursSaved.valueMinutes,
      meetingsCount: mc.meetings.value,
      flowCreationMinutes: mc.flowCreation.avgMinutes,
      flowCreationSamples: mc.flowCreation.samples,
    });

    const time = (await app.inject({ url: "/api/v1/implementers", headers: head })).json();
    const mi = (await app.inject({ url: `/api/v1/metrics/summary?implementerId=${U1}&${historico}`, headers: head })).json();
    expect(time.find((i: { id: string }) => i.id === U1)).toMatchObject({
      clientsCount: 2,
      processesTotal: mi.processes.total,
      processesComplete: mi.processes.complete,
      meetingsCount: mi.meetings.value,
      hoursSavedMinutes: mi.hoursSaved.valueMinutes,
      flowCreationAvgMinutes: mi.flowCreation.avgMinutes,
      flowCreationSamples: mi.flowCreation.samples,
    });
    semNull(time);
  });

  it("sem dado não vira null: cliente sem processos e implantador sem clientes", async () => {
    const head = await login(app, "chefe");
    const c2 = (await app.inject({ url: `/api/v1/clients/${C2}`, headers: head })).json();
    expect(c2).toMatchObject({ processesTotal: 0, flowCreationMinutes: 0, flowCreationSamples: 0 });
    semNull(c2);
    semNull((await app.inject({ url: `/api/v1/metrics/summary?clientId=${C2}`, headers: head })).json());
    semNull((await app.inject({ url: `/api/v1/metrics/timeseries?metric=flowCreation&clientId=${C2}`, headers: head })).json());

    const vazio = (await app.inject({ url: `/api/v1/implementers/${U2}`, headers: head })).json();
    expect(vazio).toMatchObject({ clientsCount: 0, flowCreationAvgMinutes: 0, flowCreationSamples: 0, clients: [] });
    semNull(vazio);
    const meu = await login(app, "vazio");
    const r = (await app.inject({ url: "/api/v1/metrics/summary", headers: meu })).json();
    expect(r.processes.total).toBe(0);
    semNull(r);
  });

  it("POST /processes/:id/status só fecha o ciclo de um processo confirmado", async () => {
    const post = (id: string, payload: Record<string, unknown>, headers = imp) =>
      app.inject({ method: "POST", url: `/api/v1/processes/${id}/status`, headers, payload });

    const emColeta = await post(P2, { status: "validated" });
    expect(emColeta.statusCode).toBe(409);
    expect(emColeta.json().error).toMatchObject({ code: "INVALID_TRANSITION", details: { from: "collecting" } });
    // o painel não confirma nem reabre: isso é do chat
    expect((await post(P2, { status: "confirmed" })).statusCode).toBe(400);
    // repetir o status atual não muda nada
    expect((await post(P1, { status: "validated" })).json().status).toBe("validated");
    // processo de outro implantador: 404
    expect((await post(P1, { status: "validated" }, await login(app, "vazio"))).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/v1/processes/${P1}/status`, payload: { status: "validated" } })).statusCode).toBe(401);
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
