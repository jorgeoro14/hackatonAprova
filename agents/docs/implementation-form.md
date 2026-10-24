# Implantation form interview instructions

Use the user-supplied [implantation questionnaire on main](https://github.com/jorgeoro14/hackatonAprova/blob/main/docs/modelo-formulario-implantacao.md)
as the interview target. Verified on 2026-10-24: its latest file commit is
`acd2de595365622a87f93765b008a1923140dcde`, and its content matches the local
`docs/modelo-formulario-implantacao.md` after LF/CRLF normalization. Its normalized
SHA-256 is `bb991250c75a6cbfbdf9994a7b0a56e909d409a79d6756b03f53fe1465c10b7e`.
The provenance descriptor is `agents/knowledge/aprova/implantation-questionnaire.json`.
Both Python workflows load this verified local reference and this English guide.

Source files:

- [Questionnaire and intended UI](https://github.com/jorgeoro14/hackatonAprova/blob/acd2de595365622a87f93765b008a1923140dcde/docs/modelo-formulario-implantacao.md).
- [FormularioImplantacao envelope](https://github.com/jorgeoro14/hackatonAprova/blob/acd2de595365622a87f93765b008a1923140dcde/src/implantacao/formulario.ts).
- [ProcessoModelo schemas](https://github.com/jorgeoro14/hackatonAprova/blob/acd2de595365622a87f93765b008a1923140dcde/src/knowledge/schemas.ts).
- [Interview sequence](https://github.com/jorgeoro14/hackatonAprova/blob/acd2de595365622a87f93765b008a1923140dcde/knowledge/sistema/03-roteiro-de-implantacao.md).

This is the project's authoritative implantation questionnaire. It defines what
the implementer must learn; it does not supply a filled municipal process model,
employee answers or a vendor-certified API configuration. Exact source
paths and enum values retain their spelling for compatibility. Conversation,
new code and documentation stay English. This is instructional guidance, not a
parallel validation schema. The reference is already available: do not ask the
representative to supply the questionnaire again. A missing municipal process
baseline is a separate dependency.

## Model-first interview

Gather one reusable process type, not a submitted citizen case. Organization
and local legislation belong to the envelope (orgao, legislacaoLocal), not
duplicated per-process answers. Reuse authorized backend setup context. The
source requires orgao.responsavel.nome; never invent it or solicit personal
contact data in this interview. Missing contact setup remains a dependency;
ask for the responsible role.

Select a domain and retrieved ProcessoModelo, then propose each block for
acceptance or change. Do not interview from scratch when a real model is
available. An exemplo: true model's deadlines, fees and validity are proposals,
not local policy. The legacy HTTP adapter's search_processes still uses its
explicitly injected catalog. The separate requirements graph can normalize the
team process model's applicant-field block, with example models disabled by default.
Neither path establishes that an actual municipal Aprova baseline was retrieved. Never claim to
have retrieved a model or legal source that was not actually supplied.

Ask one question or one short block at a time, in this order: organization,
domain/model, local legal sources, service summary, applicant form, documents,
fees, sectors, workflow, dispatches, final document, pending issues and review.
Accept out-of-order answers and preserve known facts.

## Sections and source support

| Section | Information to collect | Source-schema fields | Questionnaire requirements absent from source schema |
| --- | --- | --- | --- |
| 0. Read-only header | Name, domain, starting model, status, update time, pending count | processo.nome, dominio, modeloBase, status, atualizadoEm, pendencias | Count is derived; backend owns metadata |
| 1. Service summary | Portal presentation, eligibility, opening channels, highlighted fields | processo.descricao, processo.publicoAlvo | resumo.apresentacao, resumo.quemPodeSolicitar, resumo.abertura, resumo.camposDestaque are UI targets, not stored properties |
| 2. Applicant form | Sections; field identifier, label, type, required flag, options, help, legal source | processo.formulario.secoes: titulo, campos; fields: id, rotulo, tipo, obrigatorio, optional opcoes, ajuda, baseLegal | Do not invent extra properties or field types |
| 3. Required documents | ID, name, required flag, description, legal source | processo.documentos: id, nome, obrigatorio, optional descricao, baseLegal | No extra property assumed |
| 4. Fees | Name, calculation basis, charging stage, legal source | processo.taxas: nome, optional baseCalculo, baseLegal | Fee-to-stage relationship is absent |
| 5. Sectors | Name and internal/applicant/automatic category | Stage responsavel is only a nonempty string | No sector collection, category enum or validated sector reference |
| 6. Workflow | Ordered stages, types, responsible sector, deadlines, transitions, conditions, total deadline | processo.fluxo.etapas: id, nome, tipo, responsavel, optional prazoDias; transicoes: de, para, optional condicao; optional prazoTotalDias | Business/calendar-day basis, clock suspension and payment stage type are absent |
| 7. Dispatches | Name, type, source/destination stages, text, variables, visibility, signature, signer, response deadline | No dispatch collection in ProcessoModelo | Entire dispatch block needs extension |
| 8. Final document | Name, numbering, issue stage, text, maximum validity, signer, legal source | processo.documentoFinal: nome, optional validadeMaximaMeses, assinante, baseLegal | Numbering, issue-stage reference and text are absent |
| 9. Pending issues | Exact target path and actionable description | pendencias: caminho, descricao | A list alone does not prove questionnaire checks execute |

publicoAlvo accepts cidadao, empresa, servidor; it cannot encode every free-text
eligibility rule. Empty selection options in a model remain pending.

Source TipoCampo values: texto, texto_longo, numero, moeda, data, cpf, cnpj,
cpf_cnpj, email, telefone, cep, endereco, selecao, multipla_escolha, sim_nao,
anexo, coordenadas. Matching these to the actual Aprova builder is still marked
pending in the source guide. Discuss configuration, not actual citizen values.

Source TipoEtapa values: protocolo, triagem, exigencia, analise, vistoria,
parecer, audiencia, decisao, emissao, arquivamento, outro. Although the
questionnaire mentions payment, pagamento is not a valid source enum. Preserve
that requirement as a mapping gap rather than relabeling it. Deadline/validity
values are positive integers when supplied; unknown is not zero. Process/domain
IDs use kebab-case; field, document and stage IDs use snake_case. Preserve IDs
and dependent references when changing labels.

## Origins, legislation and pending issues

Target origens entries contain caminho, origem and optional observacao:

- modelo: proposed by a retrieved starting model, not a municipal answer.
- servidor: explicitly supplied or confirmed by the representative. Preserve the
  starting-model reference in observacao when relevant.
- legislacao: supported by an identified legal source; do not infer local
  applicability from an example or unverified summary.

Keep supplied local laws/decrees in legislacaoLocal with title, number and URL
when available. baseLegal references must resolve to actual source IDs in the
selected domain. A local-law title is not a fabricated domain ID; unresolved
references remain pending. Never invent law, fee calculation, deadline, option,
role, signatory or validity.

The source's pending-path example taxas.0.baseCalculo is process-relative.
Follow the path convention agreed with the backend; do not silently change roots.
Resolve an issue only after its answer and dependencies are supported. Required
missing values stay pending; empty collections mean unrecorded information
unless the representative explicitly confirms none.

## Relationship checks and confirmation

The source workflow schema validates transition endpoints; its knowledge loader
checks domain and legal references. The questionnaire also requires these
review checks, but the source lacks structures to implement all of them:

- Each responsible sector exists in the sector list.
- A dispatch destination has a transition from its source stage.
- Each transition from an internal sector has a triggering dispatch.
- Text variables reference applicant fields or system variables numero_processo,
  data_protocolo, data_atual, sequencial, ano, orgao, municipio.

Use the questionnaire's {{variable}} notation and check actual field references.
Do not claim unsupported checks pass or infer engine behavior from public API
HTML examples.

Representative acceptance differs from the implementation specialist's
"Confirm block" action. That UI control and target lifecycle
rascunho -> em_revisao -> confirmado require backend/UI support. Backend owns
IDs, timestamps, status and confirmation; chat cannot change them. Recheck
pending issues after corrections and request review of the current revision.

## Current Python output boundaries

The LangGraph requirements workflow has an internal field-change specification
for applicant fields and conditions (section 2). It loads all questionnaire sections
to interpret requests, but unsupported sections remain explicit conflicts or
questions with target paths; they are not silently coerced into applicant fields.
Its exports record `output_scope: applicant_form_changes`, the questionnaire's
source/hash and `implementation_questionnaire_completed: false`, including after
field-change approval. Documents, fees, sectors, complete workflow, dispatches,
final-document content and block confirmations require further typed output and
consumer integration. Approval of this scoped specification does not confirm the
whole implantation questionnaire.

For the legacy HTTP adapter, contracts/schemas/form.schema.json still defines a smaller provisional form.
It has not been replaced by FormularioImplantacao. Return only allowed fields:
objective summarizes purpose; inputs can summarize supported documents; steps
can summarize descriptions and responsible roles; expected_output summarizes
the final deliverable. These are partial summaries, not a lossless conversion.

Do not add processo, origens, pendencias, resumo, fees, sectors or dispatch keys
to updates. Keep unmapped requirements in the conversation, state their target
section and persistence gap, and never claim structured storage. Shared schemas
and consumers must migrate before nested-form output is enabled. An empty
provisional missing_fields list does not establish full implantation readiness,
confirmed blocks or satisfaction of all questionnaire rules.
