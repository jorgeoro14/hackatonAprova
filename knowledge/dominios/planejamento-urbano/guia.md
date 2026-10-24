---
titulo: Guia de implantação — Planejamento Urbano
---

# Guia de implantação — Planejamento Urbano

Este guia liga cada **tipo de processo** do módulo de Planejamento Urbano às normas da base, e diz o que precisa vir do município. Convenção:

- **[lei federal]**: regra federal com artigo citado. Vale para todo município.
- **[municipal]**: depende de lei ou decreto local. É **pergunta** para o servidor; nunca presumir.
- **[prática]**: uso comum em prefeituras. É sugestão para confirmar com o servidor, não exigência legal.

## Antes de tudo: leis municipais a pedir

Quase todos os processos deste domínio dependem destas normas locais. Peça no início da conversa:

1. **Plano diretor** (obrigatório acima de 20 mil habitantes; CF art. 182, § 1º; Estatuto da Cidade, art. 41).
2. **Lei de uso e ocupação do solo / zoneamento**: zonas, usos permitidos, coeficientes, recuos e lote mínimo. Alimenta as opções dos campos de zona e uso.
3. **Lei de parcelamento do solo**: prazos de aprovação (Lei 6.766, art. 16), lote mínimo, percentual de áreas públicas, dispensa de diretrizes (art. 8º).
4. **Lei de EIV**: quais empreendimentos precisam de Estudo de Impacto de Vizinhança (Estatuto da Cidade, art. 36).
5. **Código tributário / lei de taxas**: taxas de análise, certidões e aprovação.
6. **Lei municipal de processo administrativo**, se houver. Senão, aplica-se a Lei 9.784/1999 de forma subsidiária (base `governo-digital`).
7. Se houver: lei de **outorga onerosa** (arts. 28 e 29), **TDC** (art. 35), **preempção** (art. 25), **acesso controlado / condomínio de lotes** (Lei 6.766, art. 2º, §§ 7º e 8º), **mapa de áreas de risco** (Lei 12.608, art. 8º).

## Processos típicos

### 1. Consulta prévia de viabilidade (uso do solo)

- **O que é:** o interessado pergunta se um uso ou atividade é permitido num endereço ou lote antes de investir.
- **Base legal:** [lei federal] CF art. 30, VIII (`cf-1988-politica-urbana`). Para empresas, a Redesim exige pesquisa prévia de viabilidade locacional (Lei 11.598, art. 4º, base `governo-digital`). [municipal] Os critérios vêm da lei de uso do solo.
- **Formulário:** endereço ou inscrição imobiliária, uso ou atividade pretendida (CNAE, se for empresa), área. [prática] Quando a Redesim estadual já envia os dados, não pedir de novo (Lei 11.598, art. 9º).
- **Fluxo:** protocolo → análise urbanística → resposta (viável / viável com restrições / inviável). Processo curto, com prazo [municipal].
- **Documento final:** parecer ou certidão de viabilidade. [prática] Com validade definida.
- **Perguntar:** a viabilidade já é respondida pelo integrador estadual da Redesim? Quer o processo na Aprova mesmo assim?

### 2. Certidão de uso do solo (conformidade)

- **O que é:** certidão de que o local e o uso estão conformes com a legislação urbanística.
- **Base legal:** [lei federal] CF art. 30, VIII. Também é **documento exigido no licenciamento ambiental** (CONAMA 237/1997, art. 10, § 1º, base `meio-ambiente`).
- **Formulário:** imóvel (inscrição ou matrícula), uso, finalidade da certidão (ex.: licenciamento ambiental).
- **Fluxo:** protocolo → análise → emissão. Sem vistoria, em geral.
- **Documento final:** certidão, com validade [municipal].
- **Perguntar:** existe taxa? Qual a validade? Quem assina?

### 3. Certidão de numeração predial

- **O que é:** atribui ou certifica o número oficial do imóvel no logradouro.
- **Base legal:** [municipal] Só lei ou decreto municipal; nenhuma norma federal da base trata disso.
- **Formulário:** imóvel, logradouro, croqui ou planta de localização [prática].
- **Fluxo:** protocolo → conferência cadastral (às vezes com vistoria) → emissão.
- **Perguntar:** o cadastro imobiliário tem integração com a Aprova? Quem emite?

### 4. Fixação de diretrizes para loteamento

- **O que é:** antes de projetar o loteamento, a Prefeitura define uso do solo, sistema viário e áreas públicas para a gleba.
- **Base legal:** [lei federal] Lei 6.766, arts. 6º e 7º (`lei-6766-1979`). **Art. 8º:** pode ser **dispensada por lei** em municípios com menos de 50 mil habitantes ou quando o plano diretor já traz as diretrizes.
- **Formulário e documentos (art. 6º):** requerimento e **planta do imóvel** com divisas da gleba, curvas de nível (se exigidas), cursos d'água, bosques e construções, arruamentos vizinhos e equipamentos próximos, **uso predominante pretendido** e zonas de uso contíguas.
- **Fluxo:** protocolo → análise urbanística → expedição das diretrizes (o art. 7º lista o que a Prefeitura indica na planta).
- **Documento final:** diretrizes, **válidas por até 4 anos** (art. 7º, parágrafo único).
- **Perguntar:** o município dispensou esta fase por lei? Qual o prazo de resposta?

### 5. Aprovação de projeto de loteamento

- **Base legal:** [lei federal] Lei 6.766, arts. 2º a 4º, 9º, 12, 13, 16 e 18. Lei 12.608, art. 23, e Lei 6.766, art. 12, § 3º (área de risco). Estatuto da Cidade, art. 36 (EIV, se a lei municipal exigir). Licenciamento ambiental quando couber (base `meio-ambiente`; a CONAMA 001/1986, art. 2º, lista projetos urbanísticos de grande porte entre os que exigem EIA/RIMA; o resumo dessa resolução na base ainda não foi conferido com o texto oficial).
- **Documentos (art. 9º):** desenhos (quadras e lotes numerados, sistema viário, áreas públicas), **memorial descritivo**, **cronograma de obras de até 4 anos**, **certidão atualizada da matrícula**, **certidão negativa de tributos municipais** e **instrumento de garantia** das obras. [prática] ART/RRT do responsável técnico (Lei 5.194, art. 13; base `obras`) e licença ambiental ou dispensa.
- **Condições de análise:** só em zona urbana ou de expansão (art. 3º); **lote mínimo de 125 m² e frente de 5 m**, salvo lei local mais exigente (art. 4º, II); vedado em área de risco não edificável (art. 12, § 3º); anuência estadual nos casos do art. 13.
- **Fluxo sugerido:** protocolo → triagem documental → [exigência] → análise urbanística → [EIV / licença ambiental / anuência estadual, se couber] → parecer → decisão → emissão.
- **Prazos:** [municipal] pela lei local (art. 16). Se a lei for omissa, **90 dias** para aprovar ou rejeitar. Se o prazo vencer sem decisão, o projeto é considerado **rejeitado** (art. 16, § 1º). Não há aprovação tácita.
- **Documento final:** decreto ou alvará de aprovação do loteamento. Deve informar que o registro em cartório deve ser feito em **180 dias**, sob pena de caducidade (art. 18), e que o projeto caduca se não for executado no cronograma (art. 12, § 1º).
- **Processo derivado:** **aceite das obras de urbanização** (vistoria da infraestrutura básica do art. 2º, § 5º). Prazo de **60 dias** se a lei local for omissa (art. 16, § 2º).
- **Perguntar:** percentual de áreas públicas, lote mínimo local, tipo de garantia aceita, se há condomínio de lotes ou loteamento de acesso controlado regulamentado (art. 2º, §§ 7º e 8º), taxas e quem assina.

### 6. Aprovação de desmembramento (e remembramento)

- **Base legal:** [lei federal] Lei 6.766, arts. 2º, § 2º (desmembramento aproveita o sistema viário existente), **10** (documentos), 12 e 16. [municipal] O remembramento (unificação de lotes) é regido pela lei local.
- **Documentos (art. 10):** requerimento, **certidão atualizada da matrícula** e **planta do imóvel** a desmembrar, com as divisões propostas. [prática] ART/RRT.
- **Fluxo:** protocolo → triagem → análise (lote mínimo, testada, zona) → decisão → emissão. Mais curto que o do loteamento.
- **Prazos:** os mesmos do loteamento (art. 16). Registro em cartório em 180 dias (art. 18).
- **Perguntar:** desmembramento e remembramento ficam no mesmo processo? Há dispensa para pequenos desdobros?

### 7. Alteração de loteamento registrado

- **Base legal:** [lei federal] Lei 6.766, art. 28. Exige acordo com os adquirentes afetados e aprovação da Prefeitura.
- **Documentos:** projeto alterado e **anuência dos adquirentes** atingidos.

### 8. Estudo de Impacto de Vizinhança (EIV)

- **Base legal:** [lei federal] Estatuto da Cidade, arts. 36 a 38 (`lei-10257-2001`). [municipal] A lei local define **quais empreendimentos** precisam do EIV (art. 36). Sem lei local, não há exigência.
- **Conteúdo mínimo (art. 37):** adensamento, equipamentos urbanos e comunitários, uso e ocupação do solo, valorização imobiliária, tráfego e transporte, ventilação e iluminação, paisagem e patrimônio. Os documentos do EIV ficam **públicos** para consulta (art. 37, parágrafo único).
- **Fluxo:** pode ser um processo próprio ou uma etapa dentro da aprovação de projeto ou do alvará. [prática] Com audiência pública e medidas mitigadoras ou compensatórias em termo de compromisso.
- **Observação:** o EIV **não substitui** o EIA ambiental (art. 38).
- **Perguntar:** existe lei de EIV? Quais critérios de enquadramento (área, uso, vagas)? Há audiência pública? Quem aprova (comissão, conselho)?

### 9. Regularização Fundiária Urbana (Reurb)

- **Base legal:** [lei federal] Lei 13.465/2017, título da Reurb a partir do art. 9º (`lei-13465-2017`), e Decreto 9.310/2018 (`decreto-9310-2018`). CF art. 183.
- **Modalidades (art. 13):** **Reurb-S** (baixa renda, declarada por ato municipal, com isenção de custas registrais) e **Reurb-E**. É campo obrigatório.
- **Fases (art. 28):** requerimento → processamento, com notificação de titulares e confrontantes → projeto de regularização → saneamento → decisão publicada → **CRF** → registro em cartório. Mapeiam direto para as etapas.
- **Prazos:** **classificar a modalidade em até 180 dias** (art. 30, § 2º); a inércia fixa automaticamente a modalidade pedida (§ 3º). Notificações com **30 dias** para impugnação, por AR ou edital (art. 31). O silêncio vale como concordância (§ 6º).
- **Documentos:** requerimento do legitimado (art. 32); projeto de regularização (art. 35) e projeto urbanístico (art. 36), com levantamento topográfico georreferenciado (Decreto 9.310, arts. 28 a 32); estudo de risco, se houver risco (Decreto, art. 36).
- **Documento final:** **Certidão de Regularização Fundiária (CRF)** (art. 41; Decreto, art. 38).
- **Perguntar:** o município tem órgão ambiental capacitado (para aprovar também a parte ambiental, art. 12)? Há câmara de conciliação (Decreto, art. 27)? Quem declara a Reurb-S?

### 10. Notificação de intenção de alienação (direito de preempção)

- **Base legal:** [lei federal] Estatuto da Cidade, arts. 25 a 27. [municipal] Só existe se a lei municipal delimitou áreas de preempção.
- **Formulário:** imóvel e **proposta de compra do terceiro** (preço, condições de pagamento, validade), conforme o art. 27, § 1º.
- **Fluxo:** protocolo → publicação de edital (art. 27, § 2º) → manifestação do Município em **30 dias** → liberação ou exercício da preferência. Depois, entrega da escritura em 30 dias (§ 4º).
- **Prazo crítico:** sem resposta em 30 dias, a venda fica liberada (§ 3º).

### 11. Outros instrumentos (só se houver lei municipal)

- **Outorga onerosa do direito de construir / de alteração de uso** (Estatuto da Cidade, arts. 28 e 29): cálculo e pagamento da contrapartida, normalmente como etapa ou taxa dentro da aprovação de projeto.
- **Transferência do direito de construir** (art. 35): emissão e utilização de certificado de potencial construtivo.
- **Parcelamento, edificação ou utilização compulsórios** (art. 5º; CF art. 182, § 4º): notificação do proprietário de imóvel ocioso, com prazos da lei específica.

## Regras transversais (base `governo-digital`)

- **Exigências de uma vez só:** a LC 140 manda isso no licenciamento ambiental. Para os demais processos, é boa prática ancorada na Lei 9.784, art. 6º, parágrafo único (orientar o interessado a suprir falhas).
- **Não exigir certidão emitida pelo próprio município** (Lei 13.726, art. 3º, § 3º). Exceção: a certidão negativa de tributos do loteamento é exigida por lei (Lei 6.766, art. 9º); mesmo assim, prefira uma etapa de consulta interna.
- **Motivar indeferimentos** (Lei 9.784, art. 50) e prever **recurso em 10 dias** (art. 59) se não houver lei municipal.
- **Resumo no Portal:** serviço, documentos, etapas e prazo máximo (Lei 13.460, art. 7º, § 2º).
