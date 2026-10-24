import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import lap from "../knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json" with { type: "json" };
import { importarProcessos, slug, type FonteProcessos, type Mapeador } from "../src/processos/importar.js";

const fonte: FonteProcessos = {
  url: "https://modelo.aprova.example",
  listar: async () => [
    { id: "101", nome: "Licença Ambiental Prévia" },
    { id: "102", nome: "Processo quebrado" },
    { id: "103", nome: "Sem formulário" },
    { id: "104", nome: "Falha na API" },
  ],
  obter: async (id) => {
    if (id === "104") throw new Error("HTTP 500");
    return { idBruto: id };
  },
};

const mapear: Mapeador = (bruto, item) => {
  if (item.id === "101") return { processo: { ...lap, exemplo: false }, avisos: ["prazo da triagem presumido"] };
  if (item.id === "102") return { processo: { ...lap, id: "quebrado", fluxo: { ...lap.fluxo, transicoes: [{ de: "x", para: "y" }] } }, avisos: [] };
  return { avisos: [`sem formulário em ${JSON.stringify(bruto)}`] };
};

describe("importação de processos de referência", () => {
  it("gera ids estáveis a partir do nome", () => {
    expect(slug("Licença Ambiental Prévia (LAP)")).toBe("licenca-ambiental-previa-lap");
  });

  it("guarda o bruto, valida, grava o que passou e relata o resto", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "proc-"));
    const pastaDominios = join(pasta, "dominios");
    const pastaBruto = join(pasta, "bruto");
    const agora = new Date("2026-10-24T12:00:00Z");

    const rel = await importarProcessos(fonte, mapear, { pastaDominios, pastaBruto, agora });

    expect(rel.map((l) => [l.idExterno, l.status])).toEqual([
      ["101", "importado"],
      ["102", "invalido"],
      ["103", "nao-mapeado"],
      ["104", "erro"],
    ]);
    expect(rel[0]!.avisos).toEqual(["prazo da triagem presumido"]);
    expect(rel[1]!.erros.join()).toMatch(/etapa "x" não existe/);
    expect(rel[3]!.erros).toEqual(["HTTP 500"]);

    const gravado = JSON.parse(await readFile(join(pastaDominios, "meio-ambiente", "processos", "licenca-ambiental-previa.json"), "utf8"));
    expect(gravado.origem).toEqual({ fonte: "ambiente-modelo", idExterno: "101", url: fonte.url, importadoEm: agora.toISOString() });
    expect(JSON.parse(await readFile(join(pastaBruto, "101.json"), "utf8"))).toEqual({ idBruto: "101" });
  });
});
