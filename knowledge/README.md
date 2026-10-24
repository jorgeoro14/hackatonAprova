# Base de conhecimento do agente de implantação

A base tem três camadas. A primeira é fixa; as outras duas mudam conforme o domínio que está sendo implantado.

| Camada | Pasta | Muda por implantação? | Para que o agente usa |
|---|---|---|---|
| 1. Base da Aprova | `sistema/` | Não | Entender e explicar o sistema ao servidor (portal, tramitação, despachos, assinaturas, taxas, IA, módulos, o que dá e o que não dá para fazer) e saber o que coletar. |
| 2. Legislação | `dominios/<dominio>/legislacao/` | Sim | Embasar requisitos ("a LC 140 diz que...") e justificar documentos, prazos e taxas. |
| 3. Processos de exemplo | `dominios/<dominio>/processos/` | Sim | Propor um fluxo pronto ("a Aprova tem um fluxo assim, faz sentido pra você?") e ajustá-lo com o servidor. |

```
knowledge/
├── sistema/                      # camada 1 — fixa
│   └── *.md                      # Markdown com frontmatter (id, titulo, tags, fontes)
└── dominios/
    └── <dominio>/                # ex.: meio-ambiente, planejamento-urbano
        ├── dominio.json          # metadados: maturidade, transversal, processosCobertos
        ├── guia.md               # opcional: processo típico → normas, documentos, prazos, perguntas
        ├── legislacao/
        │   ├── fontes.json       # manifesto: quais normas e de onde vem o texto
        │   └── *.md              # camada 2 — uma norma por arquivo (gerado + notas)
        └── processos/*.json      # camada 3 — um processo-modelo por arquivo
```

## Três portas de acesso

Cada camada tem sua rota na API, e a busca pode ser filtrada por camada:

| Camada | Listar | Abrir um item | Buscar |
|---|---|---|---|
| Base da Aprova | `GET /sistema` | `GET /sistema/:id` | `GET /busca?q=...&camada=sistema` |
| Legislação | `GET /dominios/:id/legislacao` | `GET /dominios/:id/legislacao/:normaId` | `GET /busca?q=...&camada=legislacao&dominio=:id` |
| Processos de referência | `GET /dominios/:id/processos` | `GET /dominios/:id/processos/:processoId` | `GET /busca?q=...&camada=processo&dominio=:id` |

Sem `camada`, a busca percorre a base da Aprova e, se houver `dominio`, também a legislação e os processos dele.

## Base da Aprova (`sistema/`)

Um documento por assunto; `00-visao-geral.md` tem o mapa. O frontmatter traz `fontes` (páginas de onde o conteúdo saiu) para o agente poder dizer de onde tirou a informação. Hoje as fontes são o site institucional e o portal público; o que não foi confirmado está marcado com `> TODO`. O documento `pode-e-nao-pode` é o ponto de partida para responder dúvidas do servidor.

## Domínios de legislação

| Domínio | Normas | O que cobre |
|---|---:|---|
| `meio-ambiente` | 13 | Licenciamento (CF art. 225, PNMA, LC 140, CONAMA 237 e 001), Código Florestal, Mata Atlântica, SNUC, recursos hídricos, resíduos sólidos, infrações (Lei 9.605 e Decreto 6.514), acesso à informação ambiental |
| `planejamento-urbano` | 8 | CF arts. 30, 182 e 183, Estatuto da Cidade, parcelamento do solo (6.766), Reurb (13.465 e Decreto 9.310), Estatuto da Metrópole, mobilidade urbana, defesa civil e áreas de risco |
| `obras` | 11 | Liberdade econômica e aprovação tácita (13.874 e Decreto 10.178), incêndio (13.425), acessibilidade (10.098, LBI e Decreto 5.296), ART, RRT e CREA (6.496, 12.378 e 5.194), incorporação e habite-se (4.591), ATHIS (11.888) |
| `governo-digital` | 8 | **Transversal**, vale para qualquer processo: processo administrativo (9.784), governo digital (14.129), assinatura eletrônica (14.063), LGPD, LAI, usuário do serviço público (13.460), desburocratização (13.726), Redesim (11.598) |

**Maturidade:** `planejamento-urbano` está **pronta**: notas revisadas e **guia** (`guia.md`) cobrindo os dez tipos de processo do módulo. As demais estão **em revisão**: utilizáveis, mas sem guia nem revisão completa. `governo-digital` é **transversal**: entra em todo agente. Esses campos ficam no `dominio.json` e aparecem para o implantador na hora de escolher as bases do agente (`docs/bases-normas-agentes.md`).

No `guia.md`, citar normas entre crases pelo id (`` `lei-6766-1979` ``) e bases como base `` `governo-digital` ``. O `kb:validate` confere que todas existem.

Só há normas **federais**. As leis estaduais (ex.: tipologia de impacto local do Conselho Estadual de Meio Ambiente, código estadual de incêndio) e municipais (plano diretor, código de obras, lei de uso do solo, lei de taxas) mudam a cada implantação e entram como novas entradas no `fontes.json` do domínio, com `esfera`, `uf` e, se houver, o caminho em `estaduais/` ou `municipais/` do repositório ctresb/leis.

## Formato de uma norma

Cada `legislacao/<id>.md` tem:

1. **Frontmatter**: `id`, `titulo`, `esfera`, `tipo`, `numero`, `ano`, `url` (publicação oficial), `ementa`, `abrangencia` (`integral`, `trecho` ou `sem-texto`), `fonteTexto`, `importadoEm`, `tags`.
2. **`## Relevância para a implantação`**: escrita à mão. Diz o que a norma muda no processo (documentos, campos, etapas, prazos, taxas, despachos) e cita os artigos. É o que o agente usa para propor e justificar requisitos.
3. **`## Texto integral`**: o texto da norma, importado automaticamente.

Para baixar ou atualizar os textos:

```bash
npm run kb:importar-leis              # todos os domínios
npm run kb:importar-leis -- obras     # um domínio
```

O importador (`scripts/importar-legislacao.ts`) busca o texto no repositório [ctresb/leis](https://github.com/ctresb/leis) (campo `leis` do manifesto) ou, quando ele não tem o texto, no Planalto (campo `planalto`; a redação revogada, tachada, é descartada). `trechos` recorta parte de um arquivo, como os capítulos da Constituição. A seção de relevância é **preservada** a cada reimportação.

Normas sem texto nas duas fontes (resoluções CONAMA 237/1997 e 001/1986) entram só com metadados e um resumo marcado como "não conferido".

## Como adicionar um novo domínio

1. Crie `dominios/<id>/dominio.json` (copie o de `meio-ambiente`).
2. Liste as normas em `legislacao/fontes.json`, rode `npm run kb:importar-leis -- <id>` e escreva a seção "Relevância para a implantação" de cada uma.
3. Adicione processos-modelo em `processos/` seguindo o schema `ProcessoModelo` (`src/knowledge/schemas.ts`). Em `baseLegal`, referencie os `id` das normas. Etapas referenciam `setores` pelo `id`; cada despacho com `levaPara` precisa de uma transição correspondente no fluxo; variáveis `{{...}}` em textos são `id` de campo do formulário ou variáveis do sistema (`VARIAVEIS_SISTEMA`).
4. Rode `npm run kb:validate`: ele valida todos os schemas e confere se cada `baseLegal` aponta para uma norma existente.

## Convenções

- `id` sempre em kebab-case e único dentro da camada/domínio.
- Conteúdo marcado com `> TODO` precisa ser confirmado pelo time da Aprova ou completado com o texto oficial.
- Legislação: textos têm caráter informativo (conversões automáticas). Antes de citar em documento oficial, confira na `url` da publicação oficial.
