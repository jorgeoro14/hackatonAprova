/** Generate Python's full-form transport from the actual backend Zod schemas. */
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { PedidoAgenteSchema, ResultadoAgente } from "../src/agente/cliente.js";
import { ImplementerApprovalRequest } from "../contracts/implantation-evidence.js";

for (const [name, title, source] of [
  ["result", "implantation_turn", ResultadoAgente],
  ["request", "implantation_turn_request", PedidoAgenteSchema],
  ["approval", "implementer_approval", ImplementerApprovalRequest],
] as const) {
  const schema = z.toJSONSchema(source, {
    target: "draft-2020-12", unrepresentable: "any", io: "input",
  });
  await writeFile(`contracts/schemas/implantation-turn-${name}.schema.json`, JSON.stringify({
    ...schema, title,
    description: "Generated from src/agente/cliente.ts; backend Zod refinements remain authoritative.",
  }, null, 2) + "\n");
}
