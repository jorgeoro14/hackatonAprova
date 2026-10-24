import { resolve } from "node:path";
import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // sem .env: segue com as variáveis do ambiente
}

const Env = z.object({
  PORT: z.coerce.number().int().default(3333),
  KNOWLEDGE_DIR: z.string().default("knowledge"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  /** connection string do Postgres (Supabase → Connect → Session pooler) */
  DATABASE_URL: z.string().url().optional(),
  // trocar em produção; o padrão só serve para desenvolvimento local
  JWT_SECRET: z.string().min(16).default("dev-segredo-troque-em-producao"),
  JWT_VALIDADE_MINUTOS: z.coerce.number().int().positive().default(480),
  /** origens do front separadas por vírgula */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  /** senha dos usuários de demo criados pelo seed */
  SEED_SENHA: z.string().min(4).default("aprova123"),
});

const parsed = Env.parse(process.env);

export const env = {
  ...parsed,
  KNOWLEDGE_DIR: resolve(parsed.KNOWLEDGE_DIR),
  CORS_ORIGINS: parsed.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};
