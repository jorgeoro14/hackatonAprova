import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import type { z } from "zod";
import {
  Dominio,
  LegislacaoFrontmatter,
  ProcessoModelo,
  SistemaFrontmatter,
} from "./schemas.js";

export interface DocumentoSistema {
  meta: SistemaFrontmatter;
  conteudo: string;
  arquivo: string;
}

export interface DocumentoLegislacao {
  meta: LegislacaoFrontmatter;
  conteudo: string;
  arquivo: string;
}

export interface BaseDominio {
  dominio: Dominio;
  legislacao: DocumentoLegislacao[];
  processos: ProcessoModelo[];
}

export interface BaseConhecimento {
  sistema: DocumentoSistema[];
  dominios: Map<string, BaseDominio>;
}

export class KnowledgeError extends Error {
  constructor(readonly erros: string[]) {
    super(`Base de conhecimento inválida:\n- ${erros.join("\n- ")}`);
  }
}

async function listar(dir: string, extensao: string): Promise<string[]> {
  try {
    const nomes = await readdir(dir);
    return nomes.filter((n) => n.endsWith(extensao)).sort().map((n) => join(dir, n));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

function validar<T>(schema: z.ZodType<T>, dados: unknown, arquivo: string, erros: string[]): T | undefined {
  const r = schema.safeParse(dados);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    erros.push(`${arquivo}: ${issue.path.join(".") || "(raiz)"} — ${issue.message}`);
  }
  return undefined;
}

async function lerMarkdown<T>(schema: z.ZodType<T>, caminho: string, raiz: string, erros: string[]) {
  const arquivo = relative(raiz, caminho);
  const { data, content } = matter(await readFile(caminho, "utf8"));
  const meta = validar(schema, data, arquivo, erros);
  return meta ? { meta, conteudo: content.trim(), arquivo } : undefined;
}

async function lerJson<T>(schema: z.ZodType<T>, caminho: string, raiz: string, erros: string[]) {
  const arquivo = relative(raiz, caminho);
  try {
    return validar(schema, JSON.parse(await readFile(caminho, "utf8")), arquivo, erros);
  } catch (e) {
    erros.push(`${arquivo}: JSON inválido — ${(e as Error).message}`);
    return undefined;
  }
}

function checarDuplicados(ids: string[], contexto: string, erros: string[]) {
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) erros.push(`${contexto}: id duplicado "${id}"`);
    vistos.add(id);
  }
}

/** Garante que toda referência `baseLegal` do processo aponta para uma norma do domínio. */
function checarBaseLegal(base: BaseDominio, erros: string[]) {
  const normas = new Set(base.legislacao.map((l) => l.meta.id));
  for (const p of base.processos) {
    const refs = [
      ...p.baseLegal,
      ...p.formulario.secoes.flatMap((s) => s.campos.flatMap((c) => c.baseLegal ?? [])),
      ...p.documentos.flatMap((d) => d.baseLegal ?? []),
      ...p.taxas.flatMap((t) => t.baseLegal),
      ...(p.documentoFinal?.baseLegal ?? []),
    ];
    for (const ref of new Set(refs)) {
      if (!normas.has(ref)) erros.push(`processo "${p.id}": baseLegal "${ref}" não existe em ${base.dominio.id}/legislacao`);
    }
    if (p.dominio !== base.dominio.id) {
      erros.push(`processo "${p.id}": dominio "${p.dominio}" difere da pasta "${base.dominio.id}"`);
    }
  }
}

export async function carregarBase(raiz: string): Promise<BaseConhecimento> {
  const erros: string[] = [];

  const sistema = (
    await Promise.all(
      (await listar(join(raiz, "sistema"), ".md")).map((c) => lerMarkdown(SistemaFrontmatter, c, raiz, erros)),
    )
  ).filter((d): d is DocumentoSistema => d !== undefined);
  checarDuplicados(sistema.map((d) => d.meta.id), "sistema", erros);

  const dominios = new Map<string, BaseDominio>();
  const pastaDominios = join(raiz, "dominios");
  const entradas = await readdir(pastaDominios, { withFileTypes: true }).catch(() => []);

  for (const entrada of entradas.filter((e) => e.isDirectory())) {
    const pasta = join(pastaDominios, entrada.name);
    const dominio = await lerJson(Dominio, join(pasta, "dominio.json"), raiz, erros);
    if (!dominio) continue;
    if (dominio.id !== entrada.name) {
      erros.push(`dominios/${entrada.name}/dominio.json: id "${dominio.id}" difere do nome da pasta`);
    }

    const legislacao = (
      await Promise.all(
        (await listar(join(pasta, "legislacao"), ".md")).map((c) => lerMarkdown(LegislacaoFrontmatter, c, raiz, erros)),
      )
    ).filter((d): d is DocumentoLegislacao => d !== undefined);

    const processos = (
      await Promise.all(
        (await listar(join(pasta, "processos"), ".json")).map((c) => lerJson(ProcessoModelo, c, raiz, erros)),
      )
    ).filter((p): p is ProcessoModelo => p !== undefined);

    const base: BaseDominio = { dominio, legislacao, processos };
    checarDuplicados(legislacao.map((l) => l.meta.id), `${dominio.id}/legislacao`, erros);
    checarDuplicados(processos.map((p) => p.id), `${dominio.id}/processos`, erros);
    checarBaseLegal(base, erros);
    dominios.set(dominio.id, base);
  }

  if (erros.length > 0) throw new KnowledgeError(erros);
  return { sistema, dominios };
}
