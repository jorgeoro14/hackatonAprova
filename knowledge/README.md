# Base de conhecimento do agente de implantação

A base tem três camadas. A primeira é fixa; as outras duas mudam conforme o domínio que está sendo implantado.

| Camada | Pasta | Muda por implantação? | Para que o agente usa |
|---|---|---|---|
| 1. Sistema | `sistema/` | Não | Saber o que a Aprova consegue fazer (tipos de campo, etapas, taxas, assinaturas...) e o que precisa ser coletado. |
| 2. Legislação | `dominios/<dominio>/legislacao/` | Sim | Embasar requisitos ("a LC 140 diz que...") e justificar documentos, prazos e taxas. |
| 3. Processos de exemplo | `dominios/<dominio>/processos/` | Sim | Propor um fluxo pronto ("a Aprova tem um fluxo assim, faz sentido pra você?") e ajustá-lo com o servidor. |

```
knowledge/
├── sistema/                      # camada 1 — fixa
│   └── *.md                      # Markdown com frontmatter (id, titulo, tags)
└── dominios/
    └── <dominio>/                # ex.: meio-ambiente, planejamento-urbano
        ├── dominio.json          # metadados do domínio
        ├── legislacao/*.md       # camada 2 — uma norma por arquivo
        └── processos/*.json      # camada 3 — um processo-modelo por arquivo
```

## Como adicionar um novo domínio

1. Crie `dominios/<id>/dominio.json` (copie o de `meio-ambiente`).
2. Adicione as normas em `legislacao/`, uma por arquivo, com frontmatter (`id`, `titulo`, `esfera`, `tipo`, `numero`, `ano`, `url`).
3. Adicione processos-modelo em `processos/` seguindo o schema `ProcessoModelo` (`src/knowledge/schemas.ts`). Em `baseLegal`, referencie os `id` das normas.
4. Rode `npm run kb:validate`: ele valida todos os schemas e confere se cada `baseLegal` aponta para uma norma existente.

## Convenções

- `id` sempre em kebab-case e único dentro da camada/domínio.
- Conteúdo marcado com `> TODO` precisa ser confirmado pelo time da Aprova ou completado com o texto oficial.
- Legislação: o arquivo traz **resumo + pontos relevantes para implantação**, não a íntegra. Use `url` para a fonte oficial.
