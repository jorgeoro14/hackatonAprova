import type { Banco } from "../db/banco.js";
import {
  MINUTOS_FLUXO_MANUAL,
  minutosManuais,
  REUNIOES_MANUAIS_POR_SECRETARIA,
  STATUS_COMPLETOS,
  TOLERANCIA_ATRASO_PP,
} from "./parametros.js";

/** Intervalo semiaberto [de, ate). */
export interface Periodo {
  de: Date;
  ate: Date;
}

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
export const COMPLETOS_SQL = STATUS_COMPLETOS.map((s) => `'${s}'`).join(", ");

const minutosEntre = (inicio: string, fim: string) => (Date.parse(fim) - Date.parse(inicio)) / MIN;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Variação percentual inteira em relação à referência; null sem referência. */
export const deltaPct = (valor: number | null, referencia: number) =>
  valor === null || referencia <= 0 ? null : Math.round(((valor - referencia) / referencia) * 100);

/** Consulta restrita a um conjunto de clientes ($1 = ids); com lista vazia não há o que buscar. */
async function consulta<T>(db: Banco, clientes: string[], sql: string, ...params: unknown[]): Promise<T[]> {
  if (clientes.length === 0) return [];
  return db.consultar<T>(sql, [clientes, ...params]);
}

// ---------- Leituras brutas (já no escopo) ----------

function reunioesNoPeriodo(db: Banco, clientes: string[], p: Periodo) {
  return consulta<{ realizada_em: string }>(
    db, clientes,
    `SELECT realizada_em FROM reunioes WHERE cliente_id = ANY($1::uuid[]) AND realizada_em >= $2 AND realizada_em < $3`,
    p.de.toISOString(), p.ate.toISOString(),
  );
}

/** Secretarias com algum processo em andamento no período (do 1º contato até a regra completa). */
async function secretariasAtendidas(db: Banco, clientes: string[], p: Periodo): Promise<number> {
  const [r] = await consulta<{ n: number }>(
    db, clientes,
    `SELECT COUNT(DISTINCT secretaria_id) AS n FROM processos
     WHERE cliente_id = ANY($1::uuid[]) AND primeiro_contato_em IS NOT NULL
       AND primeiro_contato_em < $2 AND (concluido_em IS NULL OR concluido_em >= $3)`,
    p.ate.toISOString(), p.de.toISOString(),
  );
  return r?.n ?? 0;
}

/** Itens de regra coletados pelo agente (não pendentes) — base das horas economizadas. */
function itensColetadosPeloAgente(db: Banco, clientes: string[], p: Periodo) {
  return consulta<{ categoria: string; coletado_em: string }>(
    db, clientes,
    `SELECT c.categoria, c.coletado_em FROM campos_processo c JOIN processos pr ON pr.id = c.processo_id
     WHERE pr.cliente_id = ANY($1::uuid[]) AND c.origem = 'agente' AND c.status <> 'pending'
       AND c.coletado_em >= $2 AND c.coletado_em < $3`,
    p.de.toISOString(), p.ate.toISOString(),
  );
}

function fluxosValidados(db: Banco, clientes: string[], p: Periodo) {
  return consulta<{ primeiro_contato_em: string; validado_em: string }>(
    db, clientes,
    `SELECT primeiro_contato_em, validado_em FROM processos
     WHERE cliente_id = ANY($1::uuid[]) AND primeiro_contato_em IS NOT NULL
       AND validado_em >= $2 AND validado_em < $3`,
    p.de.toISOString(), p.ate.toISOString(),
  );
}

// ---------- Resumo (GET /metrics/summary) ----------

export interface ResumoMetricas {
  period: { from: string; to: string };
  meetings: { value: number; baseline: number; deltaPct: number | null };
  hoursSaved: { valueMinutes: number };
  flowCreation: { avgMinutes: number | null; baselineMinutes: number; deltaPct: number | null };
  processes: { total: number; complete: number; validated: number };
  backAndForthsAvg: number | null;
}

export async function resumoMetricas(db: Banco, clientes: string[], p: Periodo): Promise<ResumoMetricas> {
  const reunioes = (await reunioesNoPeriodo(db, clientes, p)).length;
  const baselineReunioes = (await secretariasAtendidas(db, clientes, p)) * REUNIOES_MANUAIS_POR_SECRETARIA;

  const economizado = (await itensColetadosPeloAgente(db, clientes, p)).reduce((s, i) => s + minutosManuais(i.categoria), 0);

  const tempos = (await fluxosValidados(db, clientes, p)).map((f) => minutosEntre(f.primeiro_contato_em, f.validado_em));
  const tempoMedio = media(tempos);
  const avgMinutes = tempoMedio === null ? null : Math.round(tempoMedio);

  const [proc] = await consulta<{ total: number; complete: number; validated: number; idas: number | null }>(
    db, clientes,
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status IN (${COMPLETOS_SQL})) AS complete,
            COUNT(*) FILTER (WHERE status = 'validated') AS validated,
            AVG(idas_e_vindas) FILTER (WHERE status IN (${COMPLETOS_SQL})) AS idas
     FROM processos WHERE cliente_id = ANY($1::uuid[])`,
  );

  return {
    period: { from: p.de.toISOString(), to: p.ate.toISOString() },
    meetings: { value: reunioes, baseline: baselineReunioes, deltaPct: deltaPct(reunioes, baselineReunioes) },
    hoursSaved: { valueMinutes: economizado },
    flowCreation: { avgMinutes, baselineMinutes: MINUTOS_FLUXO_MANUAL, deltaPct: deltaPct(avgMinutes, MINUTOS_FLUXO_MANUAL) },
    processes: { total: proc?.total ?? 0, complete: proc?.complete ?? 0, validated: proc?.validated ?? 0 },
    backAndForthsAvg: proc?.idas == null ? null : Math.round(proc.idas * 10) / 10,
  };
}

// ---------- Séries (GET /metrics/timeseries) ----------

export const METRICAS_SERIE = ["meetings", "hoursSaved", "flowCreation", "processesComplete"] as const;
export type MetricaSerie = (typeof METRICAS_SERIE)[number];
export type Granularidade = "day" | "week";

export interface PontoSerie {
  date: string;
  value: number | null;
}

/** Início do balde (UTC) que contém t: o próprio dia, ou a segunda-feira da semana. */
function inicioBalde(t: number, g: Granularidade): number {
  const dia = Math.floor(t / DIA) * DIA;
  if (g === "day") return dia;
  const diaSemana = (new Date(dia).getUTCDay() + 6) % 7; // segunda = 0
  return dia - diaSemana * DIA;
}

function baldes(p: Periodo, g: Granularidade): number[] {
  const passo = g === "day" ? DIA : 7 * DIA;
  const out: number[] = [];
  for (let t = inicioBalde(p.de.getTime(), g); t < p.ate.getTime(); t += passo) out.push(t);
  return out;
}

const chave = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Pontos por dia ou semana. meetings e hoursSaved somam no balde; flowCreation é a média dos fluxos
 * validados no balde (null quando nenhum); processesComplete é acumulado (total com regra completa ao fim do balde).
 */
export async function serieMetrica(
  db: Banco,
  clientes: string[],
  metrica: MetricaSerie,
  p: Periodo,
  g: Granularidade,
): Promise<PontoSerie[]> {
  const inicios = baldes(p, g);
  const agrupar = (eventos: { t: string; v: number }[]) => {
    const grupos = new Map<number, number[]>();
    for (const e of eventos) {
      const b = inicioBalde(Date.parse(e.t), g);
      grupos.set(b, [...(grupos.get(b) ?? []), e.v]);
    }
    return grupos;
  };

  switch (metrica) {
    case "meetings": {
      const grupos = agrupar((await reunioesNoPeriodo(db, clientes, p)).map((r) => ({ t: r.realizada_em, v: 1 })));
      return inicios.map((b) => ({ date: chave(b), value: grupos.get(b)?.length ?? 0 }));
    }
    case "hoursSaved": {
      const itens = (await itensColetadosPeloAgente(db, clientes, p)).map((i) => ({ t: i.coletado_em, v: minutosManuais(i.categoria) }));
      const grupos = agrupar(itens);
      return inicios.map((b) => ({ date: chave(b), value: (grupos.get(b) ?? []).reduce((s, v) => s + v, 0) }));
    }
    case "flowCreation": {
      const fluxos = (await fluxosValidados(db, clientes, p)).map((f) => ({
        t: f.validado_em,
        v: minutosEntre(f.primeiro_contato_em, f.validado_em),
      }));
      const grupos = agrupar(fluxos);
      return inicios.map((b) => {
        const m = media(grupos.get(b) ?? []);
        return { date: chave(b), value: m === null ? null : Math.round(m) };
      });
    }
    case "processesComplete": {
      const concluidos = (
        await consulta<{ concluido_em: string }>(
          db, clientes,
          `SELECT concluido_em FROM processos WHERE cliente_id = ANY($1::uuid[]) AND concluido_em IS NOT NULL`,
        )
      ).map((r) => Date.parse(r.concluido_em));
      const passo = g === "day" ? DIA : 7 * DIA;
      return inicios.map((b) => {
        const fim = Math.min(b + passo, p.ate.getTime());
        return { date: chave(b), value: concluidos.filter((t) => t < fim).length };
      });
    }
  }
}

// ---------- Agregados por cliente (listas de clientes e implantadores) ----------

export type StatusCliente = "onboarding" | "in_progress" | "completed" | "at_risk";

export interface AgregadoCliente {
  processesTotal: number;
  processesComplete: number;
  processesValidated: number;
  processesStarted: number;
  secretariatsTotal: number;
  secretariatsDone: number;
  meetingsCount: number;
  hoursSavedMinutes: number;
  /** média do 1º contato ao fluxo validado (min); null se nenhum fluxo validado */
  flowCreationMinutes: number | null;
  /** tempos individuais, para médias ponderadas acima do cliente */
  flowCreationSamples: number[];
}

/** Agregados de todo o histórico de cada cliente informado. */
export async function agregarClientes(db: Banco, clientes: string[]): Promise<Map<string, AgregadoCliente>> {
  const out = new Map<string, AgregadoCliente>();
  for (const id of clientes) {
    out.set(id, {
      processesTotal: 0, processesComplete: 0, processesValidated: 0, processesStarted: 0,
      secretariatsTotal: 0, secretariatsDone: 0, meetingsCount: 0, hoursSavedMinutes: 0,
      flowCreationMinutes: null, flowCreationSamples: [],
    });
  }
  const de = (id: string) => out.get(id)!;

  const [processos, secretarias, reunioes, itens, fluxos] = await Promise.all([
    consulta<{ cliente_id: string; total: number; complete: number; validated: number; started: number }>(
      db, clientes,
      `SELECT cliente_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status IN (${COMPLETOS_SQL})) AS complete,
              COUNT(*) FILTER (WHERE status = 'validated') AS validated,
              COUNT(*) FILTER (WHERE status <> 'not_started') AS started
       FROM processos WHERE cliente_id = ANY($1::uuid[]) GROUP BY cliente_id`,
    ),
    // secretaria concluída = tem processos e todos estão com a regra completa
    consulta<{ cliente_id: string; total: number; done: number }>(
      db, clientes,
      `SELECT s.cliente_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM processos p WHERE p.secretaria_id = s.id)
                AND NOT EXISTS (SELECT 1 FROM processos p WHERE p.secretaria_id = s.id AND p.status NOT IN (${COMPLETOS_SQL}))) AS done
       FROM secretarias s WHERE s.cliente_id = ANY($1::uuid[]) GROUP BY s.cliente_id`,
    ),
    consulta<{ cliente_id: string; n: number }>(
      db, clientes,
      `SELECT cliente_id, COUNT(*) AS n FROM reunioes WHERE cliente_id = ANY($1::uuid[]) GROUP BY cliente_id`,
    ),
    consulta<{ cliente_id: string; categoria: string; n: number }>(
      db, clientes,
      `SELECT p.cliente_id, c.categoria, COUNT(*) AS n FROM campos_processo c JOIN processos p ON p.id = c.processo_id
       WHERE p.cliente_id = ANY($1::uuid[]) AND c.origem = 'agente' AND c.status <> 'pending'
       GROUP BY p.cliente_id, c.categoria`,
    ),
    consulta<{ cliente_id: string; primeiro_contato_em: string; validado_em: string }>(
      db, clientes,
      `SELECT cliente_id, primeiro_contato_em, validado_em FROM processos
       WHERE cliente_id = ANY($1::uuid[]) AND primeiro_contato_em IS NOT NULL AND validado_em IS NOT NULL`,
    ),
  ]);

  for (const r of processos) {
    Object.assign(de(r.cliente_id), {
      processesTotal: r.total, processesComplete: r.complete, processesValidated: r.validated, processesStarted: r.started,
    });
  }
  for (const r of secretarias) Object.assign(de(r.cliente_id), { secretariatsTotal: r.total, secretariatsDone: r.done });
  for (const r of reunioes) de(r.cliente_id).meetingsCount = r.n;
  for (const r of itens) de(r.cliente_id).hoursSavedMinutes += r.n * minutosManuais(r.categoria);
  for (const r of fluxos) de(r.cliente_id).flowCreationSamples.push(minutosEntre(r.primeiro_contato_em, r.validado_em));
  for (const a of out.values()) {
    const m = media(a.flowCreationSamples);
    a.flowCreationMinutes = m === null ? null : Math.round(m);
  }

  return out;
}

/**
 * Status do cliente, derivado do progresso:
 * completed — todos os processos validados; onboarding — nenhum processo iniciado;
 * at_risk — meta vencida, ou progresso (regras completas) abaixo do esperado para o tempo decorrido;
 * in_progress — demais casos.
 */
export function statusCliente(
  a: Pick<AgregadoCliente, "processesTotal" | "processesComplete" | "processesValidated" | "processesStarted">,
  iniciadoEm: string,
  dataMeta: string,
  agora: Date,
): StatusCliente {
  if (a.processesTotal > 0 && a.processesValidated === a.processesTotal) return "completed";
  if (a.processesStarted === 0) return "onboarding";

  const inicio = Date.parse(iniciadoEm);
  const meta = Date.parse(dataMeta);
  if (agora.getTime() > meta) return "at_risk";
  const esperado = meta > inicio ? ((agora.getTime() - inicio) / (meta - inicio)) * 100 : 100;
  const real = a.processesTotal > 0 ? (a.processesComplete / a.processesTotal) * 100 : 0;
  return real < esperado - TOLERANCIA_ATRASO_PP ? "at_risk" : "in_progress";
}
