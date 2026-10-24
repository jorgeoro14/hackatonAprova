import { criarApp } from "./app.js";
import { env } from "./config/env.js";
import { carregarBase } from "./knowledge/loader.js";

const base = await carregarBase(env.KNOWLEDGE_DIR);
const app = criarApp(base);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
