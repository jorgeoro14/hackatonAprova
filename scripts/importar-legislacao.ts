/**
 * Importa o texto das normas listadas em knowledge/dominios/<dominio>/legislacao/fontes.json.
 *
 *   npm run kb:importar-leis                 # todos os domínios
 *   npm run kb:importar-leis -- obras        # só um domínio
 *
 * Fontes de texto:
 *   - "leis": caminho no repositório github.com/ctresb/leis (Markdown com cabeçalho YAML);
 *   - "planalto": URL de uma página do planalto.gov.br (HTML; o texto tachado/revogado é descartado);
 *   - nenhuma: a norma entra só com metadados e notas (ex.: resoluções que não estão em nenhuma das duas).
 *
 * A seção "## Relevância para a implantação" de um arquivo já existente é preservada: ela é escrita
 * à mão. O resto do arquivo (cabeçalho e texto integral) é regenerado a cada importação.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const REPO_LEIS = "https://raw.githubusercontent.com/ctresb/leis/main/";
const RAIZ = resolve("knowledge/dominios");
const RELEVANCIA = "## Relevância para a implantação";
const TEXTO = "## Texto integral";

const Trecho = z.object({
  /** início literal de uma linha (ex.: "### CAPÍTULO II — DA POLÍTICA URBANA") */
  de: z.string(),
  /** início literal da linha onde o trecho termina (exclusive); ausente = até o fim */
  ate: z.string().optional(),
});

const Fonte = z.object({
  id: z.string(),
  titulo: z.string(),
  esfera: z.enum(["federal", "estadual", "municipal"]),
  tipo: z.string(),
  numero: z.string(),
  ano: z.number().int(),
  orgao: z.string().optional(),
  uf: z.string().optional(),
  url: z.url().optional(),
  tags: z.array(z.string()).default([]),
  leis: z.string().optional(),
  planalto: z.url().optional(),
  trechos: z.array(Trecho).optional(),
});
type Fonte = z.infer<typeof Fonte>;

const ROTULO_TIPO: Record<string, string> = {
  constituicao: "Constituição Federal",
  lei: "Lei",
  "lei-complementar": "Lei Complementar",
  decreto: "Decreto",
  resolucao: "Resolução",
  portaria: "Portaria",
  "instrucao-normativa": "Instrução Normativa",
};

// ---------- obtenção do texto ----------

interface TextoObtido {
  corpo: string;
  ementa?: string;
  urlOficial?: string;
  fonteTexto: string;
}

async function baixar(url: string): Promise<Response> {
  // Identificação no formato convencional de robôs; o Planalto recusa User-Agent fora desse padrão.
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; hackatonAprova-kb-importer/0.1; +https://github.com/jorgeoro14/hackatonAprova)" },
  });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
}

/** "Art. 1o", "§ 2o", "Lei no 6.938" → "Art. 1º", "§ 2º", "Lei nº 6.938" (comum em textos antigos e no Planalto). */
function normalizarOrdinais(texto: string): string {
  return texto.replace(/(\d)o\b/g, "$1º").replace(/\bno (\d)/g, "nº $1");
}

async function doRepositorioLeis(caminho: string): Promise<TextoObtido> {
  const bruto = await (await baixar(REPO_LEIS + caminho)).text();
  const { data, content } = matter(bruto);
  // o corpo começa com "# Título"; o título é refeito no nosso arquivo
  const corpo = normalizarOrdinais(content.replace(/^\s*# .*\n/, "").trim());
  return {
    corpo,
    ementa: typeof data.ementa === "string" ? data.ementa : undefined,
    urlOficial: typeof data.fonte === "string" ? data.fonte : undefined,
    fonteTexto: `https://github.com/ctresb/leis/blob/main/${caminho}`,
  };
}

const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", sect: "§", deg: "°" };

function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

const VOID = new Set(["br", "hr", "img", "meta", "link", "input", "col", "wbr", "area", "base"]);

/**
 * Remove o texto tachado (redação revogada): <strike>, <s>, <del> e qualquer tag com
 * text-decoration: line-through, inclusive aninhadas. Acompanha a pilha de tags em vez de regex
 * porque o Planalto aninha <span> dentro de <span>.
 */
function removerTachado(html: string): string {
  const tag = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const pilha: string[] = [];
  let pularAte = -1; // tamanho da pilha onde o trecho tachado começou
  let saida = "";
  let ultimo = 0;
  for (let m; (m = tag.exec(html)); ) {
    if (pularAte < 0) saida += html.slice(ultimo, m.index);
    ultimo = tag.lastIndex;
    const [bruto, barra, nomeBruto, attrs = ""] = m;
    const nome = nomeBruto!.toLowerCase();
    if (barra) {
      const i = pilha.lastIndexOf(nome);
      if (i >= 0) pilha.length = i;
      if (pularAte >= 0 && pilha.length <= pularAte) pularAte = -1;
      else if (pularAte < 0) saida += bruto;
      continue;
    }
    const tachado = ["strike", "s", "del"].includes(nome) || /line-through/i.test(attrs);
    if (pularAte < 0) {
      if (tachado && !VOID.has(nome) && !attrs.endsWith("/")) pularAte = pilha.length;
      else saida += bruto;
    }
    if (!VOID.has(nome) && !attrs.endsWith("/")) pilha.push(nome);
  }
  if (pularAte < 0) saida += html.slice(ultimo);
  return saida;
}

/** Converte uma página do Planalto em Markdown simples: um parágrafo por linha, sem texto tachado. */
export function planaltoParaMarkdown(html: string): string {
  let h = removerTachado(html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ""))
    // o HTML vem indentado: quebras de linha no fonte não são parágrafos
    .replace(/\s+/g, " ")
    .replace(/<sup>\s*o\s*<\/sup>/gi, "º")
    .replace(/<sup>\s*a\s*<\/sup>/gi, "ª")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  h = decodificarEntidades(h);

  const paragrafos = h
    .split(/\n\s*\n/)
    .map((p) => normalizarOrdinais(p.replace(/[ \t\r\n ]+/g, " ")).trim())
    .filter((p) => p.length > 0);

  return paragrafos
    .map((p) => p.replace(/^(Art\. ?\d+[º°A-Z-]*\.?)/, "**$1**").replace(/^(§ ?\d+[º°]?\.?|Parágrafo único\.?)/, "**$1**"))
    .join("\n\n");
}

async function doPlanalto(url: string): Promise<TextoObtido> {
  const bytes = new Uint8Array(await (await baixar(url)).arrayBuffer());
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
  const charset = /charset=["']?utf-8/i.test(cabeca) ? "utf-8" : "windows-1252";
  const html = new TextDecoder(charset).decode(bytes);
  const md = planaltoParaMarkdown(html);
  // o Planalto repete cabeçalho de navegação antes do texto; começa na epígrafe da norma
  const inicio = md.search(/^(LEI|DECRETO|CONSTITUIÇÃO|RESOLUÇÃO)\b/m);
  return { corpo: (inicio >= 0 ? md.slice(inicio) : md).trim(), urlOficial: url, fonteTexto: url };
}

function recortar(corpo: string, trechos: z.infer<typeof Trecho>[]): string {
  const linhas = corpo.split("\n");
  return trechos
    .map(({ de, ate }) => {
      const i = linhas.findIndex((l) => l.startsWith(de));
      if (i < 0) throw new Error(`trecho não encontrado: "${de}"`);
      const j = ate ? linhas.findIndex((l, k) => k > i && l.startsWith(ate)) : linhas.length;
      if (j < 0) throw new Error(`fim do trecho não encontrado: "${ate}"`);
      return linhas.slice(i, j).join("\n").trim();
    })
    .join("\n\n[...]\n\n");
}

// ---------- montagem do arquivo ----------

function relevanciaExistente(conteudo: string): string | undefined {
  const i = conteudo.indexOf(RELEVANCIA);
  if (i < 0) return undefined;
  const j = conteudo.indexOf(TEXTO, i);
  return conteudo.slice(i + RELEVANCIA.length, j < 0 ? undefined : j).trim();
}

function titulo(f: Fonte): string {
  if (f.tipo === "constituicao") return `Constituição Federal de ${f.ano} — ${f.titulo}`;
  const rotulo = ROTULO_TIPO[f.tipo] ?? f.tipo;
  const orgao = f.orgao ? ` ${f.orgao}` : "";
  return `${rotulo}${orgao} nº ${f.numero}/${f.ano} — ${f.titulo}`;
}

function montar(f: Fonte, texto: TextoObtido | undefined, relevancia: string | undefined, hoje: string): string {
  const meta: Record<string, unknown> = {
    id: f.id,
    titulo: f.titulo,
    esfera: f.esfera,
    tipo: f.tipo,
    numero: f.numero,
    ano: f.ano,
    ...(f.orgao ? { orgao: f.orgao } : {}),
    ...(f.uf ? { uf: f.uf } : {}),
    ...((f.url ?? texto?.urlOficial) ? { url: f.url ?? texto?.urlOficial } : {}),
    ...(texto?.ementa ? { ementa: texto.ementa } : {}),
    abrangencia: !texto ? "sem-texto" : f.trechos ? "trecho" : "integral",
    ...(texto ? { fonteTexto: texto.fonteTexto, importadoEm: hoje } : {}),
    tags: f.tags,
  };

  const partes = [
    `# ${titulo(f)}`,
    RELEVANCIA,
    relevancia || "> TODO: descrever o que esta norma muda na implantação (documentos, prazos, etapas, taxas), citando os artigos.",
    TEXTO,
  ];
  if (texto) {
    partes.push(
      `> Texto obtido de ${texto.fonteTexto} em ${hoje}. Tem caráter informativo e não substitui a publicação oficial.`,
      texto.corpo,
    );
  } else {
    partes.push(`> Texto não disponível nas fontes automáticas. Consulte a publicação oficial${f.url ? `: ${f.url}` : "."}`);
  }
  return matter.stringify(partes.join("\n\n") + "\n", meta);
}

// ---------- execução ----------

async function importarDominio(dominio: string, hoje: string): Promise<number> {
  const pasta = join(RAIZ, dominio, "legislacao");
  let fontes: Fonte[];
  try {
    fontes = z.array(Fonte).parse(JSON.parse(await readFile(join(pasta, "fontes.json"), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }

  let falhas = 0;
  for (const f of fontes) {
    const destino = join(pasta, `${f.id}.md`);
    const anterior = await readFile(destino, "utf8").catch(() => "");
    try {
      let texto = f.leis ? await doRepositorioLeis(f.leis) : f.planalto ? await doPlanalto(f.planalto) : undefined;
      if (texto && f.trechos) texto = { ...texto, corpo: recortar(texto.corpo, f.trechos) };
      await writeFile(destino, montar(f, texto, relevanciaExistente(anterior), hoje));
      console.log(`  ✔ ${dominio}/${f.id}${texto ? ` (${Math.round(texto.corpo.length / 1024)} KB)` : " (sem texto)"}`);
    } catch (e) {
      falhas++;
      console.error(`  ✘ ${dominio}/${f.id}: ${(e as Error).message}`);
    }
  }
  return falhas;
}

const hoje = new Date().toISOString().slice(0, 10);
const pedidos = process.argv.slice(2);
const dominios = pedidos.length > 0 ? pedidos : (await readdir(RAIZ, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

let falhas = 0;
for (const d of dominios) {
  console.log(d);
  falhas += await importarDominio(d, hoje);
}
if (falhas > 0) process.exit(1);
