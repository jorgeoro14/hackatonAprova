# Modelo do formulário de implantação

O agente de chat preenche o formulário e o implantador só revisa. Dados do órgão e legislação local ficam no nível da implantação, não aqui.

## Como o formulário funciona

- **Cada bloco tem um selo de origem:** `modelo` (veio do processo-modelo), `servidor` (o órgão informou) ou `legislacao`.
- **Cada bloco tem um botão "Confirmar bloco"**, e o implantador pode editar qualquer campo.
- **Campos com pendência ficam destacados**, e no topo aparece um contador de pendências.
- **Status do formulário:** `rascunho` → `em_revisao` → `confirmado`.

## Seções

### 0. Cabeçalho (só leitura)

Nome do processo, domínio, modelo de partida, status, data da última atualização e número de pendências.

### 1. Resumo do serviço

| Campo | id | Tipo | Obrig. |
|---|---|---|---|
| Apresentação no Portal | `resumo.apresentacao` | texto longo | sim |
| Quem pode solicitar | `resumo.quemPodeSolicitar` | texto longo | não |
| Abertura | `resumo.abertura` | múltipla escolha: Externo (Portal) / Interno | sim |
| Campos de destaque | `resumo.camposDestaque` | múltipla escolha entre os campos da seção 2 | não |

### 2. Formulário do requerente (editor de formulário)

- Lista repetível de **seções**, cada uma com um título e uma lista repetível de **campos**.
- Cada campo tem: id, rótulo, tipo, obrigatório (sim/não), opções, texto de ajuda e base legal.
- Tipos possíveis: texto, texto longo, número, moeda, data, CPF, CNPJ, CPF/CNPJ, e-mail, telefone, CEP, endereço, seleção, múltipla escolha, sim/não, anexo e coordenadas.
- As opções só aparecem quando o tipo é seleção ou múltipla escolha.

### 3. Documentos exigidos (lista repetível)

Cada documento tem nome, obrigatório, descrição e base legal.

### 4. Taxas (lista repetível)

Cada taxa tem nome, base de cálculo (texto longo), etapa em que é cobrada (seleção entre as etapas da seção 6) e base legal.

### 5. Setores (lista repetível)

Cada setor tem nome e tipo: interno, requerente ou automático.

### 6. Fluxo

- **Etapas** (lista ordenável), cada uma com:
  - nome;
  - tipo: protocolo, triagem, exigência, análise, vistoria, parecer, audiência, decisão, pagamento, emissão, arquivamento ou outro;
  - setor responsável (seleção entre os setores da seção 5);
  - prazo em dias, se a contagem é em dias corridos ou úteis, e se a etapa suspende o prazo total.
- **Transições**, cada uma com: de (etapa), para (etapa) e condição (texto).
- **Prazo total** em dias.
- Opcional: diagrama do fluxo, só para leitura.

### 7. Despachos (lista repetível, agrupada por etapa)

Cada despacho tem:
- nome;
- tipo: encaminhamento, exigência, parecer, deferimento, indeferimento, ciência, arquivamento ou outro;
- etapa onde aparece e etapa para onde leva (as duas são seleção entre as etapas);
- texto-base, num editor que permite inserir `{{variáveis}}`;
- se é visível ao requerente, se exige assinatura e quem assina;
- prazo de resposta em dias.

Variáveis disponíveis: os campos da seção 2 mais `numero_processo`, `data_protocolo`, `data_atual`, `sequencial`, `ano`, `orgao` e `municipio`.

### 8. Documento final

Nome, numeração (ex.: `LAP {{sequencial}}/{{ano}}`), etapa de emissão, texto, validade em meses, assinante e base legal.

### 9. Pendências

Lista em que cada item tem o caminho do campo (`caminho`) e uma descrição. Clicar no item leva até o campo.

## Regras que a tela deve mostrar como erro

O backend já faz essas validações; a tela só precisa exibir:

- A etapa para onde o despacho leva precisa ter uma transição saindo da etapa onde ele aparece.
- O responsável de cada etapa precisa ser um setor que existe.
- As `{{variáveis}}` do texto precisam ser campos do formulário ou variáveis do sistema.
- Toda transição que sai de uma etapa de setor interno precisa de um despacho que a dispare (senão vira pendência).

## Referências no repositório

- Schema: `src/implantacao/formulario.ts` e `src/knowledge/schemas.ts`
- Exemplo de dados: `knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json`
