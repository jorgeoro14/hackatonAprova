import { createHash } from "node:crypto";
import { hashSenha } from "../dashboard/auth.js";
import { STATUS_COMPLETOS, type CategoriaCampo } from "../dashboard/parametros.js";
import type { StatusProcesso } from "../dashboard/repositorio.js";
import { novoFormulario } from "../implantacao/formulario.js";
import type { BaseConhecimento } from "../knowledge/loader.js";
import type { ProcessoModelo } from "../knowledge/schemas.js";
import { inserirEmLote, type Banco, type Linha } from "./banco.js";

/**
 * Dados fictícios para a demo do dashboard: 1 head, 3 implantadores, 7 prefeituras com ~100 processos cada
 * em estados variados, conversas, campos coletados e reuniões. Determinístico (mesma semente → mesmos dados).
 * Os valores dos campos são ilustrativos, não são regras reais de nenhum município.
 */

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

/** PRNG mulberry32: dados de demo reprodutíveis. */
function gerador(semente: number) {
  let a = semente >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rand,
    entre: (min: number, max: number) => min + rand() * (max - min),
    inteiro: (min: number, max: number) => Math.floor(min + rand() * (max - min + 1)),
    escolher: <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!,
  };
}

const USUARIOS = [
  { id: "u-head", nome: "Fernanda Rocha", username: "head", papel: "head" },
  { id: "u-maria", nome: "Maria Silva", username: "maria.silva", papel: "implementer" },
  { id: "u-joao", nome: "João Pereira", username: "joao.pereira", papel: "implementer" },
  { id: "u-ana", nome: "Ana Costa", username: "ana.costa", papel: "implementer" },
] as const;

/** progresso: fração dos processos que já avançou; diasDesdeInicio e meta (dias) definem o status do cliente. */
const CLIENTES = [
  { id: "m-canoas", nome: "Prefeitura de Canoas", uf: "RS", implantador: "u-maria", diasDesdeInicio: 38, meta: 55, progresso: 0.72 },
  { id: "m-toledo", nome: "Prefeitura de Toledo", uf: "PR", implantador: "u-maria", diasDesdeInicio: 21, meta: 50, progresso: 0.45 },
  { id: "m-joinville", nome: "Prefeitura de Joinville", uf: "SC", implantador: "u-joao", diasDesdeInicio: 50, meta: 60, progresso: 0.88 },
  { id: "m-maringa", nome: "Prefeitura de Maringá", uf: "PR", implantador: "u-joao", diasDesdeInicio: 42, meta: 50, progresso: 0.3 },
  { id: "m-passo-fundo", nome: "Prefeitura de Passo Fundo", uf: "RS", implantador: "u-ana", diasDesdeInicio: 15, meta: 45, progresso: 0.35 },
  { id: "m-lajeado", nome: "Prefeitura de Lajeado", uf: "RS", implantador: "u-ana", diasDesdeInicio: 58, meta: 60, progresso: 1 },
  { id: "m-chapeco", nome: "Prefeitura de Chapecó", uf: "SC", implantador: "u-ana", diasDesdeInicio: 2, meta: 50, progresso: 0 },
] as const;

const SECRETARIAS: Record<string, string[]> = {
  "Secretaria de Obras": [
    "Alvará de construção", "Alvará de reforma", "Alvará de demolição", "Habite-se", "Certidão de numeração predial",
    "Aprovação de projeto arquitetônico", "Licença para tapume", "Consulta prévia de viabilidade", "Regularização de edificação",
    "Desmembramento de lote", "Unificação de lotes", "Aprovação de loteamento", "Certidão de uso do solo",
    "Autorização para obra em passeio", "Licença para instalação de antena", "Vistoria de obra", "Alinhamento predial",
    "Licença para muro e calçada", "Cancelamento de alvará", "Renovação de alvará de construção",
  ],
  "Secretaria de Meio Ambiente": [
    "Licença Ambiental Prévia", "Licença Ambiental de Instalação", "Licença Ambiental de Operação", "Autorização de poda de árvore",
    "Autorização de supressão vegetal", "Certidão de dispensa de licenciamento", "Renovação de licença de operação",
    "Licença ambiental simplificada", "Autorização para terraplanagem", "Cadastro de gerador de resíduos",
    "Plano de gerenciamento de resíduos", "Denúncia ambiental", "Autorização para evento com som", "Outorga de uso de poço",
    "Licença para extração mineral", "Autorização de transporte de resíduos", "Termo de compromisso ambiental",
    "Compensação ambiental", "Certidão negativa ambiental", "Vistoria ambiental",
  ],
  "Secretaria da Fazenda": [
    "Emissão de guia de ITBI", "Certidão negativa de débitos", "Parcelamento de dívida", "Revisão de IPTU", "Isenção de IPTU",
    "Restituição de tributo", "Inscrição municipal", "Baixa de inscrição municipal", "Emissão de nota fiscal avulsa",
    "Alteração cadastral imobiliária", "Certidão de valor venal", "Impugnação de lançamento", "Credenciamento de NFS-e",
    "Enquadramento no Simples municipal", "Segunda via de carnê", "Imunidade tributária", "Compensação de créditos",
    "Certidão de regularidade fiscal", "Recurso administrativo fiscal", "Cancelamento de débito",
  ],
  "Secretaria de Desenvolvimento Econômico": [
    "Alvará de funcionamento", "Alvará provisório", "Licença para ambulante", "Licença para feira", "Autorização de evento",
    "Alvará de publicidade", "Licença para mesas na calçada", "Renovação de alvará de funcionamento", "Baixa de alvará",
    "Alteração de atividade econômica", "Consulta de viabilidade de empresa", "Cadastro de MEI", "Licença para food truck",
    "Autorização de horário especial", "Credenciamento de taxista", "Licença de transporte escolar", "Alvará de mudança de endereço",
    "Certidão de atividade econômica", "Licença de estacionamento rotativo", "Inscrição em programa de incentivo",
  ],
  "Secretaria de Saúde": [
    "Alvará sanitário", "Renovação de alvará sanitário", "Licença sanitária para alimentos", "Vistoria sanitária",
    "Denúncia à vigilância sanitária", "Cadastro de estabelecimento de saúde", "Autorização de transporte de alimentos",
    "Licença para consultório", "Licença para farmácia", "Licença para salão de beleza", "Controle de pragas — cadastro",
    "Termo de responsabilidade técnica", "Baixa de alvará sanitário", "Aprovação de projeto sanitário", "Registro de piscina coletiva",
    "Licença para creche", "Licença para academia", "Inspeção de água para consumo", "Autorização de evento com alimentos",
    "Recurso de auto de infração sanitária",
  ],
};

/** Itens de regra coletados por processo (key, label, categoria, valor de exemplo). */
const CAMPOS: { chave: string; rotulo: string; categoria: CategoriaCampo; valor: (processo: string) => string }[] = [
  { chave: "documentos_exigidos", rotulo: "Documentos exigidos", categoria: "documento", valor: () => "Requerimento assinado, documento de identidade do requerente, comprovante de propriedade ou posse" },
  { chave: "campos_requerimento", rotulo: "Campos do requerimento", categoria: "campo_formulario", valor: () => "Nome, CPF/CNPJ, endereço do imóvel, inscrição imobiliária, descrição do pedido" },
  { chave: "prazo_analise", rotulo: "Prazo de análise", categoria: "prazo", valor: () => "15 dias úteis" },
  { chave: "taxa", rotulo: "Possui taxa?", categoria: "taxa", valor: () => "Sim — valor conforme tabela do município" },
  { chave: "setor_responsavel", rotulo: "Setor responsável", categoria: "setor", valor: () => "Setor de análise técnica" },
  { chave: "etapas_fluxo", rotulo: "Etapas do fluxo", categoria: "etapa", valor: () => "Triagem → Análise técnica → Parecer → Emissão" },
  { chave: "despacho_deferimento", rotulo: "Despacho de deferimento", categoria: "despacho", valor: (p) => `Deferido o pedido de ${p.toLowerCase()}, conforme parecer técnico.` },
  { chave: "base_legal", rotulo: "Base legal", categoria: "base_legal", valor: () => "Legislação municipal informada pela secretaria" },
];

const NOMES = ["Carlos", "Juliana", "Roberto", "Patrícia", "Marcos", "Luciana", "Eduardo", "Camila", "Rafael", "Beatriz", "Sérgio", "Aline"];
const SOBRENOMES = ["Almeida", "Souza", "Oliveira", "Lima", "Ferreira", "Gomes", "Martins", "Barbosa", "Ribeiro", "Carvalho"];
const ORDEM: StatusProcesso[] = ["not_started", "collecting", "awaiting_confirmation", "confirmed", "sent_to_dev", "validated"];
const COMPLETOS = new Set<string>(STATUS_COMPLETOS);

/** Estágio do processo a partir do progresso do cliente, com ruído. */
function estagio(progresso: number, r: ReturnType<typeof gerador>): StatusProcesso {
  if (progresso >= 1) return "validated";
  if (progresso <= 0) return "not_started";
  const x = progresso + r.entre(-0.35, 0.35);
  if (x < 0.15) return "not_started";
  if (x < 0.35) return "collecting";
  if (x < 0.45) return "awaiting_confirmation";
  if (x < 0.6) return "confirmed";
  if (x < 0.75) return "sent_to_dev";
  return "validated";
}

/** uuid determinístico (formato v5) a partir de uma chave legível, ex.: idDemo("m-canoas"). */
export function idDemo(chave: string): string {
  const h = createHash("sha1").update(`aprova-demo:${chave}`).digest("hex");
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Processo-modelo usado nos formulários da demo: o primeiro de obras (ou do primeiro domínio que tiver processos). */
export function modeloDeDemo(base: BaseConhecimento): ProcessoModelo | undefined {
  const comProcessos = [...base.dominios.values()].filter((d) => d.processos.length);
  return (comProcessos.find((d) => d.dominio.id === "obras") ?? comProcessos[0])?.processos[0];
}

export async function bancoVazio(db: Banco): Promise<boolean> {
  return (await db.consultar("SELECT 1 FROM usuarios LIMIT 1")).length === 0;
}

interface Tabelas {
  usuarios: Linha[];
  clientes: Linha[];
  secretarias: Linha[];
  processos: Linha[];
  campos_processo: Linha[];
  contatos: Linha[];
  conversas: Linha[];
  mensagens: Linha[];
  formularios: Linha[];
  conversa_processos: Linha[];
  reunioes: Linha[];
}

/** Colunas e tipos de cada tabela, na ordem de inserção (respeita as FKs). */
const COLUNAS: { [T in keyof Tabelas]: Record<string, string> } = {
  usuarios: { id: "uuid", nome: "text", username: "text", senha_hash: "text", papel: "public.papel_usuario", criado_em: "timestamptz" },
  clientes: { id: "uuid", nome: "text", uf: "text", implantador_id: "uuid", iniciado_em: "timestamptz", data_meta: "timestamptz" },
  secretarias: { id: "uuid", cliente_id: "uuid", nome: "text" },
  processos: {
    id: "uuid", cliente_id: "uuid", secretaria_id: "uuid", nome: "text", status: "public.status_processo", idas_e_vindas: "integer",
    primeiro_contato_em: "timestamptz", concluido_em: "timestamptz", validado_em: "timestamptz", atualizado_em: "timestamptz",
  },
  contatos: { id: "uuid", nome: "text", telefone: "text", cliente_id: "uuid", secretaria_id: "uuid" },
  conversas: {
    id: "uuid", cliente_id: "uuid", contato_id: "uuid", secretaria_id: "uuid", status: "public.status_conversa",
    iniciada_em: "timestamptz", ultima_mensagem_em: "timestamptz",
  },
  mensagens: {
    id: "uuid", conversa_id: "uuid", papel: "public.papel_mensagem", tipo: "public.tipo_mensagem", texto: "text", dados: "jsonb",
    criada_em: "timestamptz",
  },
  formularios: {
    id: "uuid", conversa_id: "uuid", processo_id: "uuid", dominio: "text", status: "public.status_formulario", dados: "jsonb",
    revisao: "integer", confirmado_em: "timestamptz", criado_em: "timestamptz", atualizado_em: "timestamptz",
  },
  campos_processo: {
    id: "uuid", processo_id: "uuid", chave: "text", rotulo: "text", categoria: "public.categoria_campo", valor: "text",
    status: "public.status_campo", origem: "public.origem_campo", coletado_em: "timestamptz", mensagem_origem_id: "uuid",
  },
  conversa_processos: { conversa_id: "uuid", processo_id: "uuid" },
  reunioes: {
    id: "uuid", cliente_id: "uuid", realizada_em: "timestamptz", duracao_minutos: "integer", notas: "text", registrada_por: "uuid",
    criado_em: "timestamptz",
  },
};

/** Gera todas as linhas da demo em memória. Datas relativas a `agora`. */
export function gerarDemo({ senha, agora = new Date(), semente = 42, modelo }: { senha: string; agora?: Date; semente?: number; modelo?: ProcessoModelo }): Tabelas {
  const r = gerador(semente);
  const fim = agora.getTime();
  const iso = (t: number) => new Date(Math.min(t, fim - MIN)).toISOString();
  const t: Tabelas = {
    usuarios: [], clientes: [], secretarias: [], processos: [], campos_processo: [],
    contatos: [], conversas: [], mensagens: [], formularios: [], conversa_processos: [], reunioes: [],
  };

  const hash = hashSenha(senha);
  for (const u of USUARIOS) {
    t.usuarios.push({ id: idDemo(u.id), nome: u.nome, username: u.username, senha_hash: hash, papel: u.papel, criado_em: iso(fim - 120 * DIA) });
  }

  let telefone = 51990000000;

  for (const c of CLIENTES) {
    const clienteId = idDemo(c.id);
    const implantadorId = idDemo(c.implantador);
    const inicio = fim - c.diasDesdeInicio * DIA;
    t.clientes.push({
      id: clienteId, nome: c.nome, uf: c.uf, implantador_id: implantadorId,
      iniciado_em: iso(inicio), data_meta: new Date(inicio + c.meta * DIA).toISOString(),
    });
    const decorrido = fim - inicio;
    let secretariasAtendidas = 0;

    for (const [si, [nomeSecretaria, processos]] of Object.entries(SECRETARIAS).entries()) {
      const secChave = `${c.id}-sec${si + 1}`;
      const secId = idDemo(secChave);
      t.secretarias.push({ id: secId, cliente_id: clienteId, nome: nomeSecretaria });

      const contatoId = idDemo(`${secChave}-contato`);
      const nomeContato = `${r.escolher(NOMES)} ${r.escolher(SOBRENOMES)}`;
      t.contatos.push({ id: contatoId, nome: nomeContato, telefone: `+55${telefone++}`, cliente_id: clienteId, secretaria_id: secId });

      // processos da secretaria, com seus carimbos de tempo
      const criados: { id: string; nome: string; status: StatusProcesso; contato: number; campoDocumentos: Linha }[] = [];
      processos.forEach((nome, pi) => {
        const chave = `${secChave}-p${pi + 1}`;
        const id = idDemo(chave);
        const status = estagio(c.progresso, r);
        const i = ORDEM.indexOf(status);
        let contato: number | undefined;
        let concluido: number | undefined;
        let validado: number | undefined;
        if (i >= 1) contato = inicio + r.entre(0, 0.75) * decorrido;
        if (i >= 3) concluido = Math.min(contato! + r.entre(0.5, 4) * DIA, fim - r.entre(1, 6) * 60 * MIN);
        if (i >= 5) validado = Math.min(concluido! + r.entre(0.5, 3) * DIA, fim - r.entre(1, 3) * 60 * MIN);
        // idas e vindas: só existem depois que o form foi apresentado
        const idas = i >= 2 ? r.escolher([0, 0, 1, 1, 1, 2, 2, 3]) : 0;
        const ultimo = validado ?? concluido ?? (contato !== undefined ? contato + r.entre(0.1, 1) * (fim - contato) : inicio);
        t.processos.push({
          id, cliente_id: clienteId, secretaria_id: secId, nome, status, idas_e_vindas: idas,
          primeiro_contato_em: contato === undefined ? null : iso(contato),
          concluido_em: concluido === undefined ? null : iso(concluido),
          validado_em: validado === undefined ? null : iso(validado),
          atualizado_em: iso(ultimo),
        });

        // campos: a partir do form apresentado ficam todos preenchidos; em coleta, parte pendente
        const fracao = i >= 2 ? 1 : i === 1 ? r.entre(0.2, 0.8) : 0;
        const campos = CAMPOS.map((campo, ci) => {
          const coletado = ci < Math.round(fracao * CAMPOS.length);
          const aValidar = (i === 2 && r.rand() < 0.25) || (i === 1 && r.rand() < 0.2);
          const quando = coletado ? contato! + r.entre(0, 1) * ((concluido ?? ultimo) - contato!) : undefined;
          return {
            id: idDemo(`${chave}-${campo.chave}`), processo_id: id, chave: campo.chave, rotulo: campo.rotulo,
            categoria: campo.categoria, valor: coletado ? campo.valor(nome) : "",
            status: !coletado ? "pending" : aValidar ? "to_validate" : "filled",
            origem: r.rand() < 0.9 ? "agente" : "implantador",
            coletado_em: quando === undefined ? null : iso(quando),
            mensagem_origem_id: null as string | null,
          };
        });
        t.campos_processo.push(...campos);
        criados.push({ id, nome, status, contato: contato ?? inicio, campoDocumentos: campos[0]! });
      });

      const tocados = criados.filter((p) => p.status !== "not_started");
      if (tocados.length === 0) continue;
      secretariasAtendidas++;

      // 1 ou 2 conversas por secretaria, cada uma cobrindo parte dos processos
      const nConversas = tocados.length > 6 ? 2 : 1;
      for (let k = 0; k < nConversas; k++) {
        const doGrupo = tocados.filter((_, j) => j % nConversas === k);
        const convChave = `${secChave}-conv${k + 1}`;
        const convId = idDemo(convChave);
        const t0 = Math.min(...doGrupo.map((p) => p.contato));
        const status = doGrupo.some((p) => p.status === "awaiting_confirmation")
          ? "waiting_confirmation"
          : doGrupo.every((p) => COMPLETOS.has(p.status))
            ? "closed"
            : "active";

        const exemplo = doGrupo[0]!;
        let tm = t0;
        const msgs: [string, "user" | "agent", "text" | "quick_replies" | "form", string, unknown][] = [
          ["m1", "agent", "text", `Olá, ${nomeContato.split(" ")[0]}! Sou o assistente de implantação da Aprova. Vamos levantar as regras dos serviços da **${nomeSecretaria}**.`, null],
          ["m2", "user", "text", `Pode começar pelo ${exemplo.nome.toLowerCase()}.`, null],
          ["m3", "agent", "quick_replies", `Na Aprova, o **${exemplo.nome}** costuma seguir: triagem → análise técnica → parecer → emissão. Faz sentido para vocês?`,
            { quickReplies: [{ id: "qr1", label: "Sim" }, { id: "qr2", label: "Não, é diferente" }] }],
          ["m4", "user", "text", "Sim, mas a análise técnica é feita pelo setor de engenharia.", null],
          ["m5", "agent", "text", "Anotado. Quais documentos o requerente precisa anexar?", null],
          ["m6", "user", "text", "Requerimento, documento de identidade e comprovante de propriedade.", null],
        ];
        // com o processo-modelo, a demo ganha formulários reais (FormularioImplantacao) ligados ao processo
        const emitido = modelo && (status === "waiting_confirmation" || status === "closed");
        if (emitido) {
          const formId = idDemo(`${convChave}-f1`);
          const confirmado = status === "closed";
          const f = novoFormulario(formId, modelo, { municipio: c.nome, uf: c.uf, orgao: nomeSecretaria, responsavel: { nome: nomeContato } }, new Date(t0));
          f.processo.nome = exemplo.nome;
          t.formularios.push({
            id: formId, conversa_id: convId, processo_id: exemplo.id, dominio: modelo.dominio, status: confirmado ? "confirmado" : "em_revisao",
            dados: { ...f, status: confirmado ? "confirmado" : "em_revisao" }, revisao: 1 + (confirmado ? 1 : 0),
            confirmado_em: confirmado ? iso(t0 + 3 * MIN * 10) : null, criado_em: iso(t0), atualizado_em: iso(t0 + 30 * MIN),
          });
          msgs.push(["m7", "agent", "form", `Montei o formulário do **${exemplo.nome}**. Confira e corrija o que precisar.`, { formularioId: formId }]);
        }
        if (status === "closed") {
          msgs.push([emitido ? "m8" : "m7", "agent", "text", "Pronto! As regras foram confirmadas e enviadas ao time de implantação. Obrigado!", null]);
        } else if (status === "waiting_confirmation" && !emitido) {
          msgs.push(["m7", "agent", "text", `Montei o formulário do **${exemplo.nome}**. Confira e corrija o que precisar.`, null]);
        }

        const mensagens = msgs.map(([mid, papel, tipo, texto, dados]) => ({
          id: idDemo(`${convChave}-${mid}`), conversa_id: convId, papel, tipo, texto, dados, criada_em: iso((tm += r.entre(1, 6) * MIN)),
        }));
        t.conversas.push({
          id: convId, cliente_id: clienteId, contato_id: contatoId, secretaria_id: secId, status,
          iniciada_em: iso(t0), ultima_mensagem_em: mensagens.at(-1)!.criada_em,
        });
        t.mensagens.push(...mensagens);
        for (const p of doGrupo) t.conversa_processos.push({ conversa_id: convId, processo_id: p.id });

        // a mensagem com os documentos é a fonte do campo correspondente
        if (exemplo.campoDocumentos.status !== "pending") exemplo.campoDocumentos.mensagem_origem_id = mensagens[5]!.id;
      }
    }

    // reuniões: kickoff + algumas pontuais (o agente substitui as de levantamento)
    const reuniao = (k: number, quando: number, duracao: number, notas: string) =>
      t.reunioes.push({
        id: idDemo(`${c.id}-r${k}`), cliente_id: clienteId, realizada_em: iso(quando), duracao_minutos: duracao, notas,
        registrada_por: implantadorId, criado_em: iso(quando + 30 * MIN),
      });
    reuniao(0, inicio + 2 * 60 * MIN, 60, "Kickoff da implantação");
    const extras = Math.round(secretariasAtendidas * r.entre(0.2, 0.8));
    for (let k = 1; k <= extras; k++) {
      reuniao(k, inicio + r.entre(0.05, 1) * decorrido, r.escolher([30, 45, 60, 90]), r.escolher([
        "Alinhamento de taxas com a Fazenda", "Dúvidas sobre fluxo de aprovação", "Validação de formulário com a secretaria", "Ajuste de prazos",
      ]));
    }
  }
  return t;
}

/** Apaga tudo e recria os dados de demo numa transação. Devolve quantas linhas foram inseridas por tabela. */
export async function semearDemo(db: Banco, opcoes: { senha: string; agora?: Date; semente?: number; modelo?: ProcessoModelo }) {
  const t = gerarDemo(opcoes);
  await db.transacao(async (tx) => {
    // CASCADE: o que pendura nos clientes de demo (ex.: agentes) vai junto
    await tx.executar(
      "TRUNCATE usuarios, clientes, secretarias, processos, campos_processo, contatos, conversas, conversa_processos, mensagens, formularios, reunioes CASCADE",
    );
    for (const tabela of Object.keys(COLUNAS) as (keyof Tabelas)[]) {
      await inserirEmLote(tx, tabela, COLUNAS[tabela], t[tabela]);
    }
  });
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length])) as Record<keyof Tabelas, number>;
}
