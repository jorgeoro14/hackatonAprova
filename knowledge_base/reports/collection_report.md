# Cascavel PR legislative collection report

Collection date: **2026-10-24**. Municipality confirmed using the
[IBGE locality endpoint](https://servicodados.ibge.gov.br/api/v1/localidades/municipios/4104808).
The target is Cascavel **PR**, not Cascavel CE.

## Repository inspection

Inspected [ctresb/leis](https://github.com/ctresb/leis) at pinned commit
`15eb09b618ff08a38c4dfee06a91bd139d093f5d`. README.md, COBERTURA.md and
PROGRESSO.md were read first and saved alongside their license. GitHub Contents,
Git Trees metadata and individual raw file URLs were used; the repository was
not cloned or downloaded in full. Metadata-only recursive trees were not truncated.

| Sphere / inspected scope | Documents found in repository metadata | Collected source texts | Searchable source versions |
| --- | ---: | ---: | ---: |
| Cascavel municipal, among 124 PR municipality directories | **0** | 0 repository + 1 external Organic Law | 1, currentness unverified |
| Paraná state constitution and constitutional amendments | **8** | 1 | 0 |
| Federal ordinary laws, all year directories | **16,784** | 8 repository originals | Included selectively below |
| Federal complementary laws, all year directories | **239** | 1 repository correction | Included selectively below |
| Federal decrees, inspected years 2012 and 2020 | **612** | 0 | 0 |
| Root Federal Constitution | **1** | 1 | Selected articles only |
| Federal total in the above scopes | **17,636** | 10 repository + 7 official consolidated supplements | 10 |

Federal decree counts cover **only 2012 and 2020**, not the entire decree tree.
Other decree year directories were listed, not recursively inventoried or collected.
Federal procedural regulations were not automatically applied to Cascavel.
Counts describe Markdown files in the inspected metadata; they do not certify
distinct operative statutes or exhaustive national/state legislative coverage.

There is **no matching Cascavel directory** in `municipais/PR/`; its name was
searched in the actual directory listing, including normalized spelling.
No legislation from another municipality was substituted. `estaduais/PR/` has
only `constituicao/` and `emendas-constitucionais/`, without ordinary-law,
complementary-law or decree directories at this snapshot. COBERTURA.md has older
claims inconsistent with newer directory contents/progress; actual tree metadata
is used for these counts.

## Collected and selected material

Collected **19 legislative text files representing 12 distinct instruments**:
17 federal text versions, one state text and one municipal text. Eleven source
versions contribute **133 article chunks**. The others are retained for audit,
not indexed as complete current statutes. Text-file storage is **2,184,618 bytes**
(2.08 MiB), plus the original municipal PDF (**454,817 bytes**) and separate
verification snapshots, repository metadata and derived indexes. See
[storage-snapshot.json](../metadata/storage-snapshot.json) for total physical
storage and per-file sizes at the final collection snapshot.

The [mandatory document table and final file list](inventory.md) contains all
19 source paths, exact upstream paths, sizes, article-block counts, relevance,
service applications, effectiveness status and official-source URLs. CSV and
the full machine-readable manifest accompany it. Only the manifest's explicitly
listed article selection is indexed; exclusions retain source offsets and reasons.

All eight requested federal laws were located. LC 140/2011 was added specifically
for the competence question in municipal environmental licensing. Constitutional
articles were limited to public administration, municipal competence, urbanism
and environmental context. Procurement articles are a separate internal process
track and do not supply building-permit applicant requirements.

## Integrity and effectiveness findings

1. Repository Law 14.133/2021 is a **veto-promulgation fragment**, not the complete
   procurement statute. Repository LC 140/2011 is only a **signatory correction**.
   Both remain byte-identical with YAML intact, but contribute no chunks. Full
   official Chamber consolidations are preserved separately. The Law 14.133 HTML
   returned a gateway-timeout body despite HTTP 200; the linked official DOCX
   succeeded and supplied the text. HTML success codes alone were not trusted.
2. The Paraná constitution snapshot explicitly warns that its 2025 edition has
   annotations through EC 54/2024 and unverified incorporation of 2026 amendments.
   It also contains duplicated historical wording, PDF ligatures and page artifacts.
   It is archived and excluded from active article retrieval.
3. The [Council-hosted Organic Law](https://www.camaracascavel.pr.gov.br/download/arquivo/52375/artigo/)
   was collected outside the repository. It is a 74-page LeisMunicipais consolidation
   exported on **2023-10-26**, hosted by the official Council. Official hosting
   does not certify completeness through 2026. Default PDF extraction moves article
   labels out of reading order; layout extraction restores inline labels. Full
   page text, page markers and the original PDF are preserved. Historical wording,
   court notes and footers remain visible; no OCR or silent deletion was performed.
4. Official Chamber metadata for the seven consolidated federal supplements lists
   no express repeal of each act. Manifest `confirmed` refers to this **act-level
   status**, not automatic validity of every paragraph or applicability to every
   municipal service. Source versions, judgments, transitional effects and local
   regulations still require provision-level review. Repository copies alone retain
   `unverified`, regardless of their original `revogada: false` YAML.
5. Law 14.129/2021 article 2 III and §2 conditions municipal adoption on a local
   normative act. No Cascavel adopting act was verified. Law-amending provisions
   must be assessed separately through the amended statutes. Federal LAI appeal
   channels must not be copied as Cascavel's municipal authority; LAI article 45
   calls for local regulation.
6. Original repository Markdown and YAML have SHA-256 provenance and Git blob
   evidence. The root Constitution intentionally lacks upstream YAML. Official
   supplements have sidecar provenance instead of fabricated original frontmatter.
   Article counts include quoted amendments/repetitions and are **not** unique
   operative-article counts. Suffixed articles, CRLF and wrapped labels are handled.
7. Access limitations and raw response snapshots are in
   `metadata/verification/access-checks.json`. Direct Planalto requests had connection
   resets; browser text and accessible official Chamber copies were used. External
   consolidated-law links encountered access restrictions. SAPL legal-norm searches
   returned empty results; that does not prove the laws do not exist.

## Aprova classification and MVP

Classification records distinguish `legal_requirement`, `operational_suggestion`,
`municipality_request` and `pending_validation`. There are no recorded municipal
requests in this collection. Every derived record remains subject to human review;
suggested field identifiers are explicit operational design choices, not statutory
field labels. Requirements cite an actual selected chunk and article. No legal
record automatically populates or confirms the implantation form.

Recommended first tracks:

1. **Access-to-information requests (e-SIC):** requester identification and specified
   information, no required motivation, response/extension and appeal handling.
   Confirm local authority, municipal regulation, clock rules and channels.
2. **Service charter / ombudsman intake:** map published requirements, documents,
   stages and response commitments to implementation questions. Confirm the local
   charter and routing. Do not turn example deadlines into municipal policy.
3. **Building permit and land subdivision discovery:** useful next candidates, but
   no production configuration until current municipal building, zoning, subdivision
   codes, amendments, decrees, document checklists and competence are supplied.
4. **Environmental licensing:** defer configuration until Paraná local-impact
   typology and Cascavel competence/delegation and local procedures are verified.

The requirements graph can query these articles now through BM25. JSONL is prepared
for future semantic indexing and hybrid fusion. **No embeddings, live model legal
analysis or Aprova changes were executed.** Municipal coverage is an explicit
approval blocker, not a hidden gap.
