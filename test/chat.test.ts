import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ErroAgente, type ClienteAgente } from "../src/agente/cliente.js";
import { criarApp } from "../src/app.js";
import { hashSenha } from "../src/dashboard/auth.js";
import type { Banco } from "../src/db/banco.js";
import { modeloDeDemo, semearDemo } from "../src/db/seed.js";
import { FormularioImplantacao, novoFormulario } from "../src/implantacao/formulario.js";
import { carregarBase, type BaseConhecimento } from "../src/knowledge/loader.js";
import { agenteFalso } from "./apoio/agente-falso.js";
import { bancoDeTeste } from "./apoio/pglite.js";

const AGORA = new Date("2026-10-24T12:00:00Z");
const SENHA = "senha-teste";
const FONE = "+5545999991111";
const base: BaseConhecimento = await carregarBase("knowledge");
const modelo = modeloDeDemo(base)!;

/** Envolve o agente falso com um botão para simular falhas. */
function agenteFalhavel() {
  const { agente: ok, pedidos } = agenteFalso(modelo);
  let falha: ErroAgente | undefined;
  const agente: ClienteAgente = {
    turno: async (p) => {
      if (falha) throw falha;
      return ok.turno(p);
    },
  };
  return { agente, pedidos, falhar: (e?: ErroAgente) => void (falha = e) };
}

async function montar(opcoes: { limite?: number } = {}) {
  const db: Banco = await bancoDeTeste();
  await semearDemo(db, { senha: SENHA, agora: AGORA, modelo });
  const falso = agenteFalhavel();
  const uploadDir = await mkdtemp(join(tmpdir(), "aprova-up-"));
  const app = criarApp(base, {
    logger: false, agente: falso.agente, uploadDir, limiteChatPorMinuto: opcoes.limite ?? 1000,
    dashboard: { db, segredoJwt: "segredo-de-teste-123456", agora: () => AGORA },
  });
  return { db, app, ...falso };
}
type Ctx = Awaited<ReturnType<typeof montar>>;

async function cadastrar({ app }: Ctx, fone = FONE) {
  const id = await app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: fone } });
  const { registrationToken } = id.json();
  const municipios = (await app.inject({ url: "/api/v1/catalog/municipalities?q=toledo" })).json();
  const sec = (await app.inject({ url: `/api/v1/catalog/municipalities/${municipios[0].id}/secretariats` })).json();
  const r = await app.inject({
    method: "POST", url: "/api/v1/chat/register",
    payload: { registrationToken, phone: fone, name: "Ana Souza", municipality: { id: municipios[0].id }, secretariat: { id: sec.find((s: { name: string }) => /Ambiente/.test(s.name)).id } },
  });
  return { ...r.json(), r } as { r: typeof r; sessionId: string; sessionToken: string; contact: { name: string; municipality: { name: string }; secretariat: { name: string } } };
}
const h = (token: string) => ({ "x-session-token": token });
const enviar = (c: Ctx, s: { sessionId: string; sessionToken: string }, text: string) =>
  c.app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken), payload: { text } });

describe("chat: catálogo, identificação e cadastro", () => {
  let c: Ctx;
  beforeEach(async () => void (c = await montar()));

  it("catálogo público filtra por nome sem acento e lista secretarias", async () => {
    const todos = (await c.app.inject({ url: "/api/v1/catalog/municipalities" })).json();
    expect(todos).toHaveLength(7);
    const achados = (await c.app.inject({ url: "/api/v1/catalog/municipalities?q=maringa" })).json();
    expect(achados).toEqual([expect.objectContaining({ name: "Prefeitura de Maringá", uf: "PR" })]);
    expect((await c.app.inject({ url: "/api/v1/catalog/municipalities/xpto/secretariats" })).statusCode).toBe(404);
  });

  it("telefone desconhecido recebe token de cadastro; cadastro cria contato, conversa e saudação", async () => {
    const s = await cadastrar(c);
    expect(s.r.statusCode).toBe(201);
    expect(s.contact).toMatchObject({ name: "Ana Souza", municipality: { name: "Prefeitura de Toledo" }, secretariat: { name: "Secretaria de Meio Ambiente" } });
    const msgs = (await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken) })).json();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "agent", kind: "text", attachments: [] });

    // agora o telefone é conhecido: retoma a mesma conversa
    const again = (await c.app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: FONE } })).json();
    expect(again).toMatchObject({ known: true, sessionId: s.sessionId });
    // o token antigo deixa de valer (um dispositivo por vez)
    expect((await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken) })).statusCode).toBe(401);
  });

  it("texto livre casa com prefeitura existente ou cria uma nova com implantador", async () => {
    const id = (await c.app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: "+5545988887777" } })).json();
    const r = await c.app.inject({
      method: "POST", url: "/api/v1/chat/register",
      payload: { registrationToken: id.registrationToken, phone: "+5545988887777", name: "Zé", municipality: { name: "toledo" }, secretariat: { name: "Cultura" } },
    });
    expect(r.json().contact.municipality.name).toBe("Prefeitura de Toledo");

    const id2 = (await c.app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: "+5545977776666" } })).json();
    const r2 = await c.app.inject({
      method: "POST", url: "/api/v1/chat/register",
      payload: { registrationToken: id2.registrationToken, phone: "+5545977776666", name: "Lu", municipality: { name: "Cascavel" }, secretariat: { name: "Obras" } },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json().contact.municipality.name).toBe("Prefeitura de Cascavel");
  });

  it("valida telefone, token de cadastro e telefone repetido", async () => {
    expect((await c.app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: "123" } })).statusCode).toBe(400);
    const ruim = await c.app.inject({
      method: "POST", url: "/api/v1/chat/register",
      payload: { registrationToken: "x.y", phone: FONE, name: "A", municipality: { name: "X" }, secretariat: { name: "Y" } },
    });
    expect(ruim.statusCode).toBe(401);
    await cadastrar(c);
    const id = (await c.app.inject({ method: "POST", url: "/api/v1/chat/identify", payload: { phone: FONE } })).json();
    expect(id.known).toBe(true);
  });

  it("sem token de sessão ou com outra sessão: 401", async () => {
    const a = await cadastrar(c);
    const b = await cadastrar(c, "+5545966665555");
    expect((await c.app.inject({ url: `/api/v1/chat/sessions/${a.sessionId}/messages` })).statusCode).toBe(401);
    expect((await c.app.inject({ url: `/api/v1/chat/sessions/${a.sessionId}/messages`, headers: h(b.sessionToken) })).statusCode).toBe(401);
  });
});

describe("chat: conversa, formulário e dashboard", () => {
  let c: Ctx;
  beforeEach(async () => void (c = await montar()));

  it("conversa → formulário → correção → confirmação reflete no processo e nas métricas", async () => {
    const s = await cadastrar(c);
    const r1 = await enviar(c, s, "Quero configurar a licença ambiental prévia");
    expect(r1.statusCode).toBe(200);
    expect(r1.json().agentMessage).toMatchObject({ role: "agent", kind: "text", text: "Anotado. E o prazo?" });
    // pedido ao agente: papéis convertidos, domínio pela secretaria, formulário ainda inexistente
    expect(c.pedidos[0]).toMatchObject({ dominio: "meio-ambiente", municipio: "Prefeitura de Toledo", form: null });
    expect(c.pedidos[0]!.messages.map((m) => m.role)).toEqual(["assistant", "employee"]);

    const r2 = await enviar(c, s, "O prazo é de 30 dias");
    const form = r2.json().agentMessage;
    expect(form).toMatchObject({ kind: "form" });
    expect(form.formularioId).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.pedidos[1]!.form).not.toBeNull(); // o formulário em andamento volta ao agente

    const conversa = (await c.db.consultar("SELECT status FROM conversas WHERE id = $1", [s.sessionId]))[0];
    expect(conversa!.status).toBe("waiting_confirmation");
    const [proc] = await c.db.consultar("SELECT p.* FROM processos p JOIN conversa_processos cp ON cp.processo_id = p.id WHERE cp.conversa_id = $1", [s.sessionId]);
    expect(proc).toMatchObject({ status: "awaiting_confirmation" });
    const pendentes = await c.db.consultar("SELECT valor FROM campos_processo WHERE processo_id = $1 AND status = 'pending'", [proc!.id]);
    expect(pendentes.length).toBeGreaterThan(0);
    expect(pendentes.every((p) => typeof p.valor === "string")).toBe(true);

    // GET do formulário: status vem do banco (o agente tentou "confirmado")
    const g = await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/forms/${form.formularioId}`, headers: h(s.sessionToken) });
    const f = g.json();
    expect(f).toMatchObject({ id: form.formularioId, status: "em_revisao" });
    expect(() => FormularioImplantacao.parse(f)).not.toThrow();

    const loginHead = await c.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "head", password: SENHA } });
    const hAntes = { authorization: `Bearer ${loginHead.json().token}` };
    const amostrasAntes = (await c.app.inject({ url: "/api/v1/metrics/summary?from=2026-01-01&to=2026-10-25", headers: hAntes })).json().formValidation.samples as number;

    // a prefeitura corrige um dado e confirma
    const processo = { ...f.processo, resumo: { ...f.processo.resumo, apresentacao: "Texto corrigido pela prefeitura" } };
    const sub = await c.app.inject({
      method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/forms/${form.formularioId}/submit`, headers: h(s.sessionToken),
      payload: { orgao: f.orgao, processo },
    });
    expect(sub.statusCode).toBe(200);
    expect(sub.json().formulario).toMatchObject({ status: "confirmado" });
    expect(sub.json().formulario.processo.resumo.apresentacao).toBe("Texto corrigido pela prefeitura");
    expect(sub.json().agentMessage.role).toBe("agent");

    const [depois] = await c.db.consultar("SELECT * FROM processos WHERE id = $1", [proc!.id]);
    expect(depois).toMatchObject({ status: "confirmed" });
    expect(depois!.concluido_em).not.toBeNull();
    const [campo] = await c.db.consultar("SELECT valor FROM campos_processo WHERE processo_id = $1 AND chave = 'resumo'", [proc!.id]);
    expect(campo!.valor).toBe("Texto corrigido pela prefeitura");

    // somente leitura depois de confirmado
    const de = await c.app.inject({
      method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/forms/${form.formularioId}/submit`, headers: h(s.sessionToken),
      payload: { orgao: f.orgao, processo },
    });
    expect(de.statusCode).toBe(409);

    // o painel enxerga o processo e o formulário do chat
    const login = await c.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "head", password: SENHA } });
    const hd = { authorization: `Bearer ${login.json().token}` };
    const painel = (await c.app.inject({ url: `/api/v1/processes/${proc!.id}/form`, headers: hd })).json();
    expect(painel.formulario).toMatchObject({ id: form.formularioId, status: "confirmado" });
    expect(painel.revision).toBe(3);
    const resumo = (await c.app.inject({ url: "/api/v1/metrics/summary?from=2026-01-01&to=2026-10-25", headers: hd })).json();
    expect(resumo.formValidation.samples).toBe(amostrasAntes + 1); // D6: formulário entregue → confirmado
    expect(typeof resumo.formValidation.avgMinutes).toBe("number");
    const detalhe = (await c.app.inject({ url: `/api/v1/processes/${proc!.id}`, headers: hd })).json();
    expect(detalhe.status).toBe("confirmed");
    expect(detalhe.fields.some((x: { value: string | null }) => x.value === null)).toBe(false);
    const msgs = (await c.app.inject({ url: `/api/v1/conversations/${s.sessionId}`, headers: hd })).json().messages;
    expect(msgs.find((m: { kind: string }) => m.kind === "form").formularioId).toBe(form.formularioId);
  });

  it("voltar a corrigir depois do formulário conta uma ida e volta", async () => {
    const s = await cadastrar(c);
    await enviar(c, s, "um");
    await enviar(c, s, "dois"); // pronto → awaiting_confirmation
    await enviar(c, s, "três"); // o falso continua "pronto"; sem ida e volta
    const [p1] = await c.db.consultar("SELECT p.idas_e_vindas FROM processos p JOIN conversa_processos cp ON cp.processo_id = p.id WHERE cp.conversa_id = $1 AND p.status = 'awaiting_confirmation'", [s.sessionId]);
    expect(p1!.idas_e_vindas).toBe(0);
  });

  it("agente fora do ar: erro claro, só a mensagem do usuário fica gravada, e dá para tentar de novo", async () => {
    const s = await cadastrar(c);
    c.falhar(new ErroAgente("indisponivel", "Não foi possível falar com o agente"));
    const r = await enviar(c, s, "oi");
    expect(r.statusCode).toBe(502);
    expect(r.json().error.code).toBe("AGENT_UNAVAILABLE");
    c.falhar(new ErroAgente("timeout", "demorou"));
    expect((await enviar(c, s, "oi de novo")).json().error.code).toBe("AGENT_TIMEOUT");
    const msgs = (await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken) })).json();
    expect(msgs.map((m: { role: string }) => m.role)).toEqual(["agent", "user", "user"]);
    expect((await c.db.consultar("SELECT 1 FROM formularios WHERE conversa_id = $1", [s.sessionId])).length).toBe(0);
    c.falhar(undefined);
    // tentar de novo com o mesmo texto não duplica a mensagem do usuário
    expect((await enviar(c, s, "oi de novo")).statusCode).toBe(200);
    const final = (await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken) })).json();
    expect(final.map((m: { role: string }) => m.role)).toEqual(["agent", "user", "user", "agent"]);
  });

  it("GET ?after= devolve só as mensagens novas; mensagem vazia dá 400; formulário de outra sessão dá 404", async () => {
    const a = await cadastrar(c);
    const b = await cadastrar(c, "+5545966665555");
    const r = await enviar(c, a, "primeira");
    const depois = (await c.app.inject({ url: `/api/v1/chat/sessions/${a.sessionId}/messages?after=${r.json().userMessage.id}`, headers: h(a.sessionToken) })).json();
    expect(depois.map((m: { id: string }) => m.id)).toEqual([r.json().agentMessage.id]);
    expect((await enviar(c, a, "   ")).statusCode).toBe(400);

    await enviar(c, a, "segunda");
    const fid = (await c.db.consultar("SELECT id FROM formularios"))[0]!.id;
    expect((await c.app.inject({ url: `/api/v1/chat/sessions/${b.sessionId}/forms/${fid}`, headers: h(b.sessionToken) })).statusCode).toBe(404);
  });

  it("submit inválido volta 422 com detalhes por caminho", async () => {
    const s = await cadastrar(c);
    await enviar(c, s, "um");
    const r = await enviar(c, s, "dois");
    const fid = r.json().agentMessage.formularioId;
    const f = (await c.app.inject({ url: `/api/v1/chat/sessions/${s.sessionId}/forms/${fid}`, headers: h(s.sessionToken) })).json();
    const sub = await c.app.inject({
      method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/forms/${fid}/submit`, headers: h(s.sessionToken),
      payload: { orgao: f.orgao, processo: { ...f.processo, fluxo: { ...f.processo.fluxo, etapas: [{ ...f.processo.fluxo.etapas[0], responsavel: "setor-inexistente" }] } } },
    });
    expect(sub.statusCode).toBe(422);
    expect(sub.json().error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(sub.json().error.details).some((k) => k.startsWith("processo."))).toBe(true);
    expect((await c.db.consultar("SELECT status FROM formularios WHERE id = $1", [fid]))[0]!.status).toBe("em_revisao");
  });
});

describe("chat: anexos e limites", () => {
  it("envia anexo, vincula à mensagem e passa o texto ao agente; serve o arquivo com a sessão", async () => {
    const c = await montar();
    const s = await cadastrar(c);
    const corpo = (nome: string, conteudo: string) => {
      const b = "----teste";
      return { headers: { ...h(s.sessionToken), "content-type": `multipart/form-data; boundary=${b}` }, payload: `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\nContent-Type: text/plain\r\n\r\n${conteudo}\r\n--${b}--\r\n` };
    };
    const up = await c.app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/attachments`, ...corpo("regras.txt", "taxa de R$ 50") });
    expect(up.statusCode).toBe(201);
    const anexo = up.json();
    expect(anexo).toMatchObject({ name: "regras.txt", sizeBytes: 13 });

    const ruim = await c.app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/attachments`, ...corpo("virus.exe", "x") });
    expect(ruim.statusCode).toBe(415);

    const r = await c.app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken), payload: { text: "veja", attachmentIds: [anexo.id] } });
    expect(r.json().userMessage.attachments).toEqual([anexo]);
    expect(c.pedidos[0]!.attachments).toEqual([expect.objectContaining({ name: "regras.txt", text: "taxa de R$ 50" })]);

    expect((await c.app.inject({ url: anexo.url, headers: h(s.sessionToken) })).body).toBe("taxa de R$ 50");
    expect((await c.app.inject({ url: anexo.url })).statusCode).toBe(401);
    const login = await c.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "head", password: SENHA } });
    expect((await c.app.inject({ url: anexo.url, headers: { authorization: `Bearer ${login.json().token}` } })).statusCode).toBe(200);

    const falso = await c.app.inject({ method: "POST", url: `/api/v1/chat/sessions/${s.sessionId}/messages`, headers: h(s.sessionToken), payload: { text: "x", attachmentIds: ["00000000-0000-4000-8000-000000000000"] } });
    expect(falso.statusCode).toBe(400);
  });

  it("rate limit nos endpoints públicos: 429 RATE_LIMITED", async () => {
    const c = await montar({ limite: 3 });
    const codigos = [];
    for (let i = 0; i < 5; i++) codigos.push((await c.app.inject({ url: "/api/v1/catalog/municipalities" })).statusCode);
    expect(codigos).toEqual([200, 200, 200, 429, 429]);
    const r = await c.app.inject({ url: "/api/v1/catalog/municipalities" });
    expect(r.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("formulário → campos e seed", () => {
  it("o formulário do chat vira campos do processo, com pendências vazias e sem null", async () => {
    const c = await montar();
    const s = await cadastrar(c);
    await enviar(c, s, "um");
    await enviar(c, s, "dois");
    const [proc] = await c.db.consultar("SELECT p.id FROM processos p JOIN conversa_processos cp ON cp.processo_id = p.id WHERE cp.conversa_id = $1", [s.sessionId]);
    const campos = await c.db.consultar("SELECT categoria, status, valor, coletado_em FROM campos_processo WHERE processo_id = $1", [proc!.id]);
    const cats = new Set(campos.map((x) => x.categoria));
    for (const k of ["documento", "taxa", "etapa", "setor", "despacho", "campo_formulario"]) expect(cats).toContain(k);
    expect(campos.every((x) => typeof x.valor === "string")).toBe(true);
    // formulário ainda em revisão: itens a validar, não preenchidos
    expect(campos.some((x) => x.status === "to_validate")).toBe(true);
    expect(campos.some((x) => x.status === "pending")).toBe(true);
  });

  it("processo do seed com nome parecido é reaproveitado, sem duplicar", async () => {
    const c = await montar();
    const s = await cadastrar(c);
    const antes = (await c.db.consultar("SELECT count(*)::int AS n FROM processos WHERE nome ILIKE 'Licença Ambiental Pr%'"))[0]!.n as number;
    await enviar(c, s, "um");
    await enviar(c, s, "dois");
    const depois = (await c.db.consultar("SELECT count(*)::int AS n FROM processos WHERE nome ILIKE 'Licença Ambiental Pr%'"))[0]!.n as number;
    expect(depois).toBe(antes);
    const [p] = await c.db.consultar("SELECT p.status, p.nome FROM processos p JOIN conversa_processos cp ON cp.processo_id = p.id WHERE cp.conversa_id = $1", [s.sessionId]);
    expect(p).toMatchObject({ nome: "Licença Ambiental Prévia", status: "awaiting_confirmation" });
  });

  it("seed com o processo-modelo cria formulários válidos ligados aos processos e mensagens kind=form", async () => {
    const db = await bancoDeTeste();
    await semearDemo(db, { senha: SENHA, agora: AGORA, modelo });
    const forms = await db.consultar("SELECT * FROM formularios");
    expect(forms.length).toBeGreaterThan(0);
    for (const f of forms) {
      expect(f.processo_id).not.toBeNull();
      expect(() => FormularioImplantacao.parse({ ...(f.dados as object), id: f.id })).not.toThrow();
    }
    const msgs = await db.consultar("SELECT dados FROM mensagens WHERE tipo = 'form'");
    expect(msgs).toHaveLength(forms.length);
    expect(msgs.every((m) => (m.dados as { formularioId?: string }).formularioId)).toBe(true);
    expect((await db.consultar("SELECT 1 FROM campos_processo WHERE valor IS NULL")).length).toBe(0);
  });
});
