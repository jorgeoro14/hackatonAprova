import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { ProcessoModelo } from "../knowledge/schemas.js";

/**
 * Importação de processos de referência a partir do ambiente modelo da Aprova.
 *
 * O pipeline não conhece o formato da API: quem conhece é a FonteProcessos (busca) e o Mapeador
 * (converte a resposta bruta para ProcessoModelo). Aqui ficam as partes estáveis: guardar o bruto,
 * validar contra o schema, gravar no knowledge/ e relatar o que não deu para converter.
 */

export interface ItemExterno {
  /** id do tipo de processo no ambiente modelo */
  id: string;
  nome: string;
}

export interface FonteProcessos {
  /** endereço base, gravado na origem de cada processo */
  url: string;
  listar(): Promise<ItemExterno[]>;
  /** resposta bruta com tudo que a API devolve do processo (formulário, resumo, despachos...) */
  obter(id: string): Promise<unknown>;
}

export interface ResultadoMapeamento {
  /** objeto no formato ProcessoModelo (ainda não validado) ou undefined se não foi possível */
  processo?: unknown;
  /** o que ficou de fora ou foi presumido, para revisão humana */
  avisos: string[];
}

export type Mapeador = (bruto: unknown, item: ItemExterno) => ResultadoMapeamento;

export interface OpcoesImportacao {
  /** pasta knowledge/dominios */
  pastaDominios: string;
  /** onde guardar as respostas brutas (fora do git), para remapear sem chamar a API de novo */
  pastaBruto: string;
  /** filtra quais itens importar (ex.: só os de um domínio) */
  filtro?: (item: ItemExterno) => boolean;
  agora?: Date;
}

export interface LinhaRelatorio {
  idExterno: string;
  nome: string;
  status: "importado" | "invalido" | "nao-mapeado" | "erro";
  arquivo?: string;
  avisos: string[];
  erros: string[];
}

const resumirIssues = (issues: z.core.$ZodIssue[]) => issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);

/** "Licença Ambiental Prévia (LAP)" → "licenca-ambiental-previa-lap" */
export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function importarProcessos(fonte: FonteProcessos, mapear: Mapeador, opcoes: OpcoesImportacao): Promise<LinhaRelatorio[]> {
  const agora = (opcoes.agora ?? new Date()).toISOString();
  await mkdir(opcoes.pastaBruto, { recursive: true });

  const itens = (await fonte.listar()).filter(opcoes.filtro ?? (() => true));
  const relatorio: LinhaRelatorio[] = [];

  for (const item of itens) {
    const linha: LinhaRelatorio = { idExterno: item.id, nome: item.nome, status: "erro", avisos: [], erros: [] };
    relatorio.push(linha);
    try {
      const bruto = await fonte.obter(item.id);
      await writeFile(join(opcoes.pastaBruto, `${slug(item.id)}.json`), JSON.stringify(bruto, null, 2));

      const { processo, avisos } = mapear(bruto, item);
      linha.avisos = avisos;
      if (!processo) {
        linha.status = "nao-mapeado";
        continue;
      }

      const comOrigem = {
        ...(processo as object),
        origem: { fonte: "ambiente-modelo", idExterno: item.id, url: fonte.url, importadoEm: agora },
      };
      const r = ProcessoModelo.safeParse(comOrigem);
      if (!r.success) {
        linha.status = "invalido";
        linha.erros = resumirIssues(r.error.issues);
        continue;
      }

      const pasta = join(opcoes.pastaDominios, r.data.dominio, "processos");
      await mkdir(pasta, { recursive: true });
      linha.arquivo = join(pasta, `${r.data.id}.json`);
      await writeFile(linha.arquivo, JSON.stringify(r.data, null, 2) + "\n");
      linha.status = "importado";
    } catch (e) {
      linha.erros.push((e as Error).message);
    }
  }
  return relatorio;
}
