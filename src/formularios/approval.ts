import { createHash } from "node:crypto";
import type { Banco } from "../db/banco.js";
import type { Usuario } from "../dashboard/auth.js";
import { detalheFormulario, ErroApi } from "../dashboard/repositorio.js";
import { ImplementerApprovalRequest } from "../../contracts/implantation-evidence.js";
import type { z } from "zod";

/** Stable hash even when JSONB reorders object keys; array order remains meaningful. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function formApprovals(db: Banco, actor: Usuario, formId: string) {
  const current = await detalheFormulario(db, actor, formId);
  const items = await db.consultar(
    `SELECT a.id, a.revision, a.approval_text AS text, a.snapshot_sha256 AS digest,
            a.approved_at AS "approvedAt", u.id AS "actorId", u.nome AS "actorName"
     FROM implementer_form_approvals a JOIN usuarios u ON u.id = a.actor_id
     WHERE a.formulario_id = $1 ORDER BY a.approved_at DESC`, [formId],
  );
  return { revision: current.revision, approved: items.some((item) => item.revision === current.revision), items };
}

export async function approveForm(
  db: Banco, actor: Usuario, formId: string,
  request: z.infer<typeof ImplementerApprovalRequest>, now: Date,
) {
  await db.transacao(async (tx) => {
    await detalheFormulario(tx, actor, formId); // Apply the existing dashboard client scope.
    const [locked] = await tx.consultar("SELECT revisao, status FROM formularios WHERE id = $1 FOR UPDATE", [formId]);
    if (!locked || locked.revisao !== request.revision) {
      throw new ErroApi(409, "STALE_REVISION", "O formulário mudou. Atualize a revisão antes de aprovar.");
    }
    if (locked.status === "rascunho") {
      throw new ErroApi(409, "NOT_READY", "Solicite a apresentação do formulário para revisão antes de aprovar.");
    }
    const current = await detalheFormulario(tx, actor, formId);
    const snapshot = canonicalJson(current.formulario);
    const digest = createHash("sha256").update(snapshot).digest("hex");
    await tx.consultar(
      `INSERT INTO implementer_form_approvals
       (formulario_id, revision, actor_id, approval_text, snapshot, snapshot_sha256, approved_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (formulario_id, revision, actor_id) DO NOTHING`,
      [formId, request.revision, actor.id, request.text, snapshot, digest, now.toISOString()],
    );
  });
  return formApprovals(db, actor, formId);
}

export async function approvedSnapshot(db: Banco, actor: Usuario, formId: string, approvalId: string) {
  await detalheFormulario(db, actor, formId);
  const [record] = await db.consultar(
    "SELECT snapshot AS formulario, snapshot_sha256 AS digest, revision FROM implementer_form_approvals WHERE formulario_id = $1 AND id::text = $2",
    [formId, approvalId],
  );
  if (!record) throw new ErroApi(404, "NOT_FOUND", "Aprovação não encontrada");
  return record;
}
