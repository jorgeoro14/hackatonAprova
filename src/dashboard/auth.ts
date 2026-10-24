import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type Papel = "implementer" | "head";

export interface Usuario {
  id: string;
  name: string;
  username: string;
  role: Papel;
}

// ---------- Senhas (scrypt) ----------

export function hashSenha(senha: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString("base64url")}$${scryptSync(senha, sal, 32).toString("base64url")}`;
}

export function conferirSenha(senha: string, hash: string): boolean {
  const [alg, sal, esperado] = hash.split("$");
  if (alg !== "scrypt" || !sal || !esperado) return false;
  const obtido = scryptSync(senha, Buffer.from(sal, "base64url"), 32);
  const alvo = Buffer.from(esperado, "base64url");
  return obtido.length === alvo.length && timingSafeEqual(obtido, alvo);
}

// ---------- JWT HS256 ----------

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const assinar = (dados: string, segredo: string) => createHmac("sha256", segredo).update(dados).digest("base64url");

export interface TokenEmitido {
  token: string;
  expiresAt: string;
}

export function emitirToken(usuario: Usuario, segredo: string, validadeMinutos: number, agora = new Date()): TokenEmitido {
  const iat = Math.floor(agora.getTime() / 1000);
  const exp = iat + validadeMinutos * 60;
  const dados = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: usuario.id, role: usuario.role, iat, exp })}`;
  return { token: `${dados}.${assinar(dados, segredo)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Devolve o id do usuário se o token for válido e não expirado. */
export function verificarToken(token: string, segredo: string, agora = new Date()): string | undefined {
  const [cab, corpo, assinatura] = token.split(".");
  if (!cab || !corpo || !assinatura) return undefined;
  const esperada = Buffer.from(assinar(`${cab}.${corpo}`, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return undefined;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(corpo, "base64url").toString()) as { sub?: string; exp?: number };
    if (typeof sub !== "string" || typeof exp !== "number" || exp * 1000 <= agora.getTime()) return undefined;
    return sub;
  } catch {
    return undefined;
  }
}
