# Regras de produto da interface

## Problema
Como coletar e validar a regra de negócio de ~100 processos por prefeitura sem depender de reunião? Metas: menos reuniões, menos idas e vindas, menos tempo validando formulário clonado, mais processos no ar com regra inteligente.

## Perfis de acesso
| Perfil | Entrada | Vê |
|---|---|---|
| Prefeitura | `/chat`, sem login. Informa telefone; se desconhecido, informa prefeitura e secretaria | Só o chat |
| Implantador | `/login` (usuário + senha) | **Só os seus clientes**: conversas, regras coletadas, métricas |
| Head de implantação | `/login` | Tudo: todos os implantadores, ranking, clientes em risco, drill-down |

O chat é um MVP: no futuro o WhatsApp entrega o telefone e o `IdentifyFlow` pula direto para a conversa.

## Métricas de sucesso (destaque da Visão geral)
1. **Reuniões**: sucesso quando **diminui** (variação vs. processo manual).
2. **Tempo economizado do implantador**: o que a IA coletou sem reunião.
3. **Tempo de criação do fluxo**: do primeiro contato ao fluxo validado; sucesso quando **diminui**.
Apoio: processos com regra completa, idas e vindas por processo. **O front só exibe**: o cálculo é do back.

## Telas
- **Chat**: identificação → conversa com o agente → formulário preenchido, editável, com um único botão "Confirmar e enviar ao time".
- **Dashboard**: Visão geral · Clientes (lista, detalhe, processos, conversas, reuniões) · Time (só head: comparativo, risco, drill-down e "ver como").
