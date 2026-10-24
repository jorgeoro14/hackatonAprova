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
        ├── dominio.json          # metadados do domínio
        ├── legislacao/*.md       # camada 2 — uma norma por arquivo
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

## Como adicionar um novo domínio

1. Crie `dominios/<id>/dominio.json` (copie o de `meio-ambiente`).
2. Adicione as normas em `legislacao/`, uma por arquivo, com frontmatter (`id`, `titulo`, `esfera`, `tipo`, `numero`, `ano`, `url`).
3. Adicione processos-modelo em `processos/` seguindo o schema `ProcessoModelo` (`src/knowledge/schemas.ts`). Em `baseLegal`, referencie os `id` das normas.
4. Rode `npm run kb:validate`: ele valida todos os schemas e confere se cada `baseLegal` aponta para uma norma existente.

## Convenções

- `id` sempre em kebab-case e único dentro da camada/domínio.
- Conteúdo marcado com `> TODO` precisa ser confirmado pelo time da Aprova ou completado com o texto oficial.
- Legislação: o arquivo traz **resumo + pontos relevantes para implantação**, não a íntegra. Use `url` para a fonte oficial.
