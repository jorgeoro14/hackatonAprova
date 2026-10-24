import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // cada arquivo sobe PGlite e aplica as migrations no beforeAll; em paralelo, passa dos 10s padrão
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
