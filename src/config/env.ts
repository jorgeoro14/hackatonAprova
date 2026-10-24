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
});

const parsed = Env.parse(process.env);

export const env = {
  ...parsed,
  KNOWLEDGE_DIR: resolve(parsed.KNOWLEDGE_DIR),
};
