import type { Banco, Linha } from "../db/banco.js";
import { formularioParaCampos } from "../dashboard/campos.js";
import { gravarCamposProcesso, mudarStatusProcesso, type StatusProcesso } from "../dashboard/repositorio.js";
import type { FormularioImplantacao } from "../implantacao/formulario.js";

export type StatusFormulario = "rascunho" | "em_revisao" | "confirmado";

/** Formulário como o contrato do chat o descreve: o JSON do agente + o que o banco controla. */
export function paraFormulario(r: Linha): FormularioImplantacao {
  return {
    ...(r.dados as FormularioImplantacao),
    id: r.id as string,
    status: r.status as StatusFormulario,
    atualizadoEm: new Date(r.atualizado_em as string).toISOString(),
  };
}

/** Formulário em andamento da conversa (o mais recente que ainda não foi confirmado). */
export async function formularioAberto(db: Banco, conversaId: string): Promise<Linha | undefined> {
  return (
    await db.consultar(
      "SELECT * FROM formularios WHERE conversa_id = $1 AND status <> 'confirmado' ORDER BY criado_em DESC LIMIT 1",
      [conversaId],
    )
  )[0];
}

/** Grava a revisão do agente: cria o formulário ou sobrescreve o aberto, incrementando `revisao`. */
export async function salvarRevisao(
  db: Banco,
  conversaId: string,
  form: FormularioImplantacao,
  status: Exclude<StatusFormulario, "confirmado">,
): Promise<Linha> {
  const encontrado = await formularioAberto(db, conversaId);
  // outro processo na mesma conversa abre um formulário novo; o anterior fica como estava
  const aberto = encontrado && (encontrado.dados as FormularioImplantacao).processo.nome.toLowerCase() === form.processo.nome.toLowerCase() ? encontrado : undefined;
  const dados = JSON.stringify(form);
  if (aberto) {
    return (
      await db.consultar(
        "UPDATE formularios SET dados = $1::jsonb, status = $2, dominio = $3, revisao = revisao + 1 WHERE id = $4 RETURNING *",
        [dados, status, form.dominio, aberto.id],
      )
    )[0]!;
  }
  return (
    await db.consultar(
      "INSERT INTO formularios (conversa_id, dominio, status, dados) VALUES ($1, $2, $3, $4::jsonb) RETURNING *",
      [conversaId, form.dominio, status, dados],
    )
  )[0]!;
}

const ESTAGIOS_FINAIS: StatusProcesso[] = ["sent_to_dev", "validated"];

/**
 * Ponte formulário → dashboard: vincula o formulário a um processo (cria se não existir, por nome + secretaria da
 * conversa), grava os itens em campos_processo e leva o processo para o status pedido.
 */
export async function sincronizarProcesso(
  db: Banco,
  p: { conversaId: string; formularioId: string; form: FormularioImplantacao; alvo: Extract<StatusProcesso, "collecting" | "awaiting_confirmation" | "confirmed">; mensagemId?: string; agora: Date },
): Promise<string> {
  const conversa = (
    await db.consultar<{ cliente_id: string; secretaria_id: string | null; contato_secretaria: string | null }>(
      `SELECT cv.cliente_id, cv.secretaria_id, ct.secretaria_id AS contato_secretaria
       FROM conversas cv JOIN contatos ct ON ct.id = cv.contato_id WHERE cv.id = $1`,
      [p.conversaId],
    )
  )[0]!;
  const secretariaId = conversa.secretaria_id ?? conversa.contato_secretaria ?? (await secretariaPadrao(db, conversa.cliente_id));

  const nome = p.form.processo.nome;
  // "Licença Ambiental Prévia (LAP)" e "Licença ambiental previa" são o mesmo processo
  const chave = chaveNome(nome);
  const existente = (
    await db.consultar<{ id: string; status: StatusProcesso; nome: string }>(
      "SELECT id, status, nome FROM processos WHERE cliente_id = $1 AND secretaria_id = $2",
      [conversa.cliente_id, secretariaId],
    )
  ).find((r) => chaveNome(r.nome) === chave);
  const processoId =
    existente?.id ??
    (
      await db.consultar<{ id: string }>(
        "INSERT INTO processos (cliente_id, secretaria_id, nome) VALUES ($1, $2, $3) RETURNING id",
        [conversa.cliente_id, secretariaId, nome],
      )
    )[0]!.id;

  await db.consultar("UPDATE formularios SET processo_id = $1 WHERE id = $2", [processoId, p.formularioId]);
  await db.consultar("INSERT INTO conversa_processos (conversa_id, processo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [p.conversaId, processoId]);

  await gravarCamposProcesso(db, processoId, formularioParaCampos(p.form, p.agora.toISOString()), p.mensagemId);

  const atual = existente?.status ?? "not_started";
  // processo já enviado ao time ou validado não volta para coleta
  if (!ESTAGIOS_FINAIS.includes(atual)) await mudarStatusProcesso(db, processoId, p.alvo, p.agora);
  return processoId;
}

/** Nome sem acento, caixa e complemento entre parênteses, para casar processos do seed com os do modelo. */
export const chaveNome = (nome: string) =>
  nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function secretariaPadrao(db: Banco, clienteId: string): Promise<string> {
  const nome = "Não informada";
  const r = await db.consultar<{ id: string }>(
    "INSERT INTO secretarias (cliente_id, nome) VALUES ($1, $2) ON CONFLICT (cliente_id, nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
    [clienteId, nome],
  );
  return r[0]!.id;
}
