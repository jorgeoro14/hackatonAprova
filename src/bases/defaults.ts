import type { Banco, Linha } from "../db/banco.js";
import type { Usuario } from "../dashboard/auth.js";
import { ErroApi, exigirCliente } from "../dashboard/repositorio.js";
import { detalheAgente } from "./repositorio.js";

export async function configureDefaultAgent(db: Banco, actor: Usuario, clientId: string, domain: string, agentId: string | null) {
  await exigirCliente(db, actor, clientId);
  if (agentId === null) {
    await db.consultar("DELETE FROM conversation_agent_defaults WHERE cliente_id = $1 AND dominio = $2", [clientId, domain]);
  } else {
    const agent = await detalheAgente(db, actor, agentId);
    const [eligible] = await db.consultar(
      `SELECT a.id FROM agentes a
       JOIN agente_bases ab ON ab.agente_id = a.id
       JOIN bases_normas b ON b.id = ab.base_id
       WHERE a.id = $1 AND a.cliente_id = $2 AND ab.base_id = $3
         AND a.status <> 'paused' AND b.disponivel`, [agent.id, clientId, domain],
    );
    if (!eligible) throw new ErroApi(422, "VALIDATION_ERROR", "O agente deve pertencer à prefeitura e ter acesso à base do domínio.");
    await db.consultar(
      `INSERT INTO conversation_agent_defaults (cliente_id, dominio, agente_id) VALUES ($1, $2, $3)
       ON CONFLICT (cliente_id, dominio) DO UPDATE SET agente_id = EXCLUDED.agente_id`, [clientId, domain, agentId],
    );
  }
  return { clientId, domain, agentId };
}

/** Never override an explicitly selected agent or infer authorization from chat text. */
export async function assignDefaultAgent(db: Banco, conversation: Linha, domain: string): Promise<Linha> {
  if (conversation.agente_id) return conversation;
  const [updated] = await db.consultar(
    `UPDATE conversas cv SET agente_id = d.agente_id
     FROM conversation_agent_defaults d
     JOIN agentes a ON a.id = d.agente_id AND a.cliente_id = d.cliente_id
     JOIN agente_bases ab ON ab.agente_id = a.id AND ab.base_id = d.dominio
     JOIN bases_normas b ON b.id = ab.base_id
     WHERE cv.id = $1 AND cv.cliente_id = $2 AND cv.agente_id IS NULL
       AND d.cliente_id = cv.cliente_id AND d.dominio = $3
       AND a.status <> 'paused' AND b.disponivel
     RETURNING cv.*`, [conversation.id, conversation.cliente_id, domain],
  );
  if (updated) return updated;
  // Another request may have explicitly assigned this conversation meanwhile.
  return (await db.consultar("SELECT * FROM conversas WHERE id = $1", [conversation.id]))[0] ?? conversation;
}
