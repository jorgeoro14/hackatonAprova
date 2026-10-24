import type { FastifyInstance } from "fastify";
import { ErroApi } from "../dashboard/repositorio.js";

/** Formato de erro do contrato: { error: { code, message, details } }. Registrar em cada plugin (o handler é encapsulado). */
export function tratarErros(app: FastifyInstance) {
  app.setErrorHandler((erro, _req, reply) => {
    if (erro instanceof ErroApi) {
      return reply.code(erro.status).send({ error: { code: erro.code, message: erro.message, details: erro.details } });
    }
    const { statusCode: status, code } = erro as { statusCode?: number; code?: string };
    if (status === 429) {
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Muitas requisições; tente novamente em instantes", details: {} } });
    }
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ error: { code: "FILE_TOO_LARGE", message: "Arquivo acima do limite de 10 MB", details: {} } });
    }
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: "BAD_REQUEST", message: (erro as Error).message, details: {} } });
    }
    app.log.error(erro);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Erro interno", details: {} } });
  });
}
