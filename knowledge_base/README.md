# Cascavel PR legislation collection

Public legislative sources for Cascavel, Paraná, IBGE **4104808**, collected on
2026-10-24. Original laws remain Portuguese; reports and tooling are English.
The repository is a collection source, not a certification of current law.

- [Collection report](reports/collection_report.md): findings, scope and MVP recommendation.
- [Inventory table](reports/inventory.md) and [CSV](reports/inventory.csv): exact repository
  paths, actual file sizes, detected articles, relevance, application and official sources.
- [Missing sources](reports/missing_sources.md): municipal and state coverage gaps.
- [Manifest](metadata/manifest.json): source hashes, indexing policy, exclusions and status.
- [Classification records](metadata/requirements.jsonl): provision-backed requirements,
  separate operational suggestions and validation questions. No municipal answers.
- `chunks/articles.jsonl`: selected articles with stable IDs, exact offsets and legal provenance.
- `chunks/lexical.sqlite3`: read-only BM25/FTS5 retrieval with accent normalization.

Rebuild the article corpus offline from the explicit source catalog:

```powershell
python -m agents.scripts.prepare_legislation
```

Search without a provider key or embeddings:

```powershell
python -m agents.scripts.search_legislation "identificação requerente acesso informação"
```

Semantic indexing has **not** been performed. Later embedding should use these exact
article chunk IDs and metadata, then combine vector and lexical results by ID
(for example reciprocal rank fusion). Apply municipality, service, effectiveness
and applicability filters before treating results as legal support. Similarity is
never a currentness check. Do not send all archived sources to an embedding job.

The existing generic municipal ingestion manifest has a different schema and
recursive splitting policy. Do not pass this legal manifest to that CLI. The
requirements graph consumes this corpus through `CuratedLawSearch`; another
retriever can implement the same read-only `LawSearch` interface later.

Only selected articles are searchable. Full collected texts, repository YAML,
the Council-hosted PDF and official HTML/DOCX snapshots are preserved. Excluded
spans remain in source files and are recorded in the manifest. Sources requiring
currentness or local-applicability review cannot pass the graph's legal approval gate.

Upstream attribution and license are retained in `metadata/repository/LICENSE`.
Website navigation, news and proposed bills are verification material, not laws.
