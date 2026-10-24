import { beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { hashSenha } from "../src/dashboard/auth.js";
import type { Banco } from "../src/db/banco.js";
import lapJson from "../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json" with { type: "json" };
import { FormularioImplantacao, novoFormulario } from "../src/implantacao/formulario.js";
import type { BaseConhecimento } from "../src/knowledge/loader.js";
import { ProcessoModelo } from "../src/knowledge/schemas.js";
import { bancoDeTeste } from "./apoio/pglite.js";

const AGORA = new Date("2026-10-24T12:00:00Z");
const SENHA = "senha-teste";
const base = { sistema: [], dominios: new Map() } as unknown as BaseConhecimento;
const u = (fim: string) => `00000000-0000-4000-8000-0000000000${fim}`;
const [U1, U2, C1, S1, P1, P2, CT1, CV1, CV2, F1, F2, F3] = ["01", "02", "c1", "5a", "a1", "a2", "d1", "e1", "e2", "f1", "f2", "f3"].map(u);

const orgao = { municipio: "Toledo", uf: "PR", orgao: "Secretaria de Meio Ambiente", responsavel: { nome: "Fulano" } };
const form = novoFormulario("qualquer", ProcessoModelo.parse(lapJson), orgao, AGORA);

async function banco(): Promise<Banco> {
  const db = await bancoDeTeste();
  await db.consultar(`INSERT INTO usuarios (id, nome, username, senha_hash, papel) VALUES ($1,'Imp','imp',$3,'implementer'), ($2,'Outro','outro',$3,'implementer')`, [U1, U2, hashSenha(SENHA)]);
  await db.executar(`
    INSERT INTO clientes (id, nome, uf, implantador_id, iniciado_em, data_meta) VALUES ('${C1}','Toledo','PR','${U1}','2026-10-01T00:00:00Z','2026-11-20T00:00:00Z');
    INSERT INTO secretarias (id, cliente_id, nome) VALUES ('${S1}','${C1}','Meio Ambiente');
    INSERT INTO processos (id, cliente_id, secretaria_id, nome, status) VALUES ('${P1}','${C1}','${S1}','Licença prévia','awaiting_confirmation'), ('${P2}','${C1}','${S1}','Sem form','collecting');
    INSERT INTO contatos (id, nome, telefone, cliente_id) VALUES ('${CT1}','Ana','+5545999990000','${C1}');
    INSERT INTO conversas (id, cliente_id, contato_id) VALUES ('${CV1}','${C1}','${CT1}'), ('${CV2}','${C1}','${CT1}');
  `);
  const ins = `INSERT INTO formularios (id, conversa_id, processo_id, dominio, status, dados, revisao, atualizado_em) VALUES ($1,$2,$3,'meio-ambiente',$4,$5,$6,'2026-10-24T10:00:00Z')`;
  await db.consultar(ins, [F1, CV1, P1, "em_revisao", JSON.stringify(form), 1]);
  await db.consultar(ins, [F2, CV1, P1, "confirmado", JSON.stringify(form), 2]);
  await db.consultar(ins, [F3, CV2, null, "rascunho", JSON.stringify(form), 1]);
  return db;
}

describe("painel: formulário somente leitura", () => {
  let app: ReturnType<typeof criarApp>;
  const login = async (username: string) =>
    ({ authorization: `Bearer ${(await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password: SENHA } })).json().token}` });

  beforeAll(async () => {
    app = criarApp(base, { logger: false, dashboard: { db: await banco(), segredoJwt: "segredo-de-teste-123456", agora: () => AGORA } });
  });

  it("devolve a última revisão do processo como FormularioImplantacao válido", async () => {
    const r = await app.inject({ url: `/api/v1/processes/${P1}/form`, headers: await login("imp") });
    expect(r.statusCode).toBe(200);
    const { formulario, revision, confirmedAt } = r.json();
    expect(revision).toBe(2);
    expect(confirmedAt).toBeNull();
    expect(formulario).toMatchObject({ id: F2, status: "confirmado", atualizadoEm: "2026-10-24T10:00:00.000Z" });
    expect(() => FormularioImplantacao.parse(formulario)).not.toThrow();
  });

  it("abre pelo id (mensagem kind=form) dentro do escopo", async () => {
    const r = await app.inject({ url: `/api/v1/forms/${F1}`, headers: await login("imp") });
    expect(r.json().formulario).toMatchObject({ id: F1, status: "em_revisao" });
    expect((await app.inject({ url: `/api/v1/forms/${F3}`, headers: await login("imp") })).statusCode).toBe(200);
  });

  it("404 sem formulário, id inválido ou fora do escopo; 401 sem token", async () => {
    const h = await login("imp");
    expect((await app.inject({ url: `/api/v1/processes/${P2}/form`, headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/v1/forms/xpto", headers: h })).statusCode).toBe(404);
    const outro = await login("outro");
    expect((await app.inject({ url: `/api/v1/processes/${P1}/form`, headers: outro })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/forms/${F1}`, headers: outro })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/forms/${F1}` })).statusCode).toBe(401);
  });

  it("só leitura: não há rota de escrita", async () => {
    const r = await app.inject({ method: "PUT", url: `/api/v1/forms/${F1}`, headers: await login("imp"), payload: {} });
    expect(r.statusCode).toBe(404);
  });

  it("conversa sem secretaria sai com '—' (nunca null)", async () => {
    const h = await login("imp");
    await app.inject({ url: "/api/v1/auth/me", headers: h });
    const conv = (await app.inject({ url: `/api/v1/conversations/${CV1}`, headers: h })).json();
    expect(conv.secretariat).toBe("—");
  });
});
