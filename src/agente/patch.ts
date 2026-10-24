/**
 * Subconjunto de JSON Patch (RFC 6902): add, replace, remove.
 * Caminhos no formato "/formulario/secoes/0/campos/-" ("-" = fim do array, só em add).
 */

export interface OperacaoPatch {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
}

export class PatchError extends Error {}

function segmentos(path: string): string[] {
  if (!path.startsWith("/")) throw new PatchError(`caminho deve começar com "/": ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function indice(arr: unknown[], seg: string, permitirFim: boolean): number {
  if (seg === "-" && permitirFim) return arr.length;
  if (!/^\d+$/.test(seg)) throw new PatchError(`índice inválido "${seg}"`);
  const i = Number(seg);
  const max = permitirFim ? arr.length : arr.length - 1;
  if (i > max) throw new PatchError(`índice ${i} fora do array (tamanho ${arr.length})`);
  return i;
}

function aplicarUma(doc: unknown, { op, path, value }: OperacaoPatch): void {
  const segs = segmentos(path);
  const ultimo = segs.pop();
  if (ultimo === undefined || ultimo === "") throw new PatchError("não é possível alterar a raiz");

  let alvo: unknown = doc;
  for (const seg of segs) {
    if (Array.isArray(alvo)) alvo = alvo[indice(alvo, seg, false)];
    else if (alvo !== null && typeof alvo === "object" && seg in alvo) alvo = (alvo as Record<string, unknown>)[seg];
    else throw new PatchError(`caminho não encontrado: ${path}`);
  }

  if (Array.isArray(alvo)) {
    if (op === "add") alvo.splice(indice(alvo, ultimo, true), 0, value);
    else if (op === "replace") alvo[indice(alvo, ultimo, false)] = value;
    else alvo.splice(indice(alvo, ultimo, false), 1);
    return;
  }
  if (alvo === null || typeof alvo !== "object") throw new PatchError(`caminho não encontrado: ${path}`);

  const obj = alvo as Record<string, unknown>;
  if (op !== "add" && !(ultimo in obj)) throw new PatchError(`caminho não encontrado: ${path}`);
  if (op === "remove") delete obj[ultimo];
  else obj[ultimo] = value;
}

/** Aplica as operações numa cópia; o original não é alterado. Lança PatchError se alguma falhar. */
export function aplicarPatch<T>(doc: T, ops: OperacaoPatch[]): T {
  const copia = structuredClone(doc);
  for (const op of ops) aplicarUma(copia, op);
  return copia;
}
