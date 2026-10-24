"""Internal RAG contracts; these do not replace the shared interview schemas."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Identifier = Annotated[NonBlank, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,79}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CorpusScope(StrictModel):
    municipality_id: Identifier
    municipality_name: NonBlank
    corpus_id: Identifier


class SourceDocument(StrictModel):
    document_id: Identifier
    title: NonBlank
    path: NonBlank
    kind: Literal["legislation", "procedure", "form", "manual", "other"]
    source_url: HttpUrl | None = None
    version: NonBlank | None = None


class CorpusManifest(StrictModel):
    schema_version: Literal[1] = 1
    scope: CorpusScope
    data_kind: Literal["municipal_documents", "synthetic"]
    documents: list[SourceDocument] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_sources(self):
        ids = [source.document_id for source in self.documents]
        if len(ids) != len(set(ids)):
            raise ValueError("Document IDs must be unique within a corpus")
        return self


class ChunkSettings(StrictModel):
    strategy: Literal["recursive", "markdown"] = "recursive"
    chunk_size: int = Field(default=1000, ge=100, le=8000)
    chunk_overlap: int = Field(default=200, ge=0)

    @model_validator(mode="after")
    def valid_overlap(self):
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("Chunk overlap must be smaller than chunk size")
        return self


class RetrievalSettings(StrictModel):
    search_type: Literal["vector", "mmr"] = "vector"
    k: int = Field(default=4, ge=1, le=8)
    fetch_k: int = Field(default=20, ge=1, le=64)
    lambda_mult: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode="after")
    def valid_candidates(self):
        if self.fetch_k < self.k:
            raise ValueError("Candidate count must be at least k")
        return self


class EmbeddingSpec(StrictModel):
    provider: Literal["openai"] = "openai"
    model: NonBlank


class IndexDescriptor(StrictModel):
    schema_version: Literal[1] = 1
    scope: CorpusScope
    data_kind: Literal["municipal_documents", "synthetic"]
    embedding: EmbeddingSpec
    chunk_settings: ChunkSettings
    collection_name: Annotated[str, StringConstraints(pattern=r"^municipal_[a-f0-9]{64}$")]
    chunk_count: int = Field(gt=0)


class Evidence(StrictModel):
    chunk_id: NonBlank
    municipality_id: Identifier
    corpus_id: Identifier
    data_kind: Literal["municipal_documents", "synthetic"]
    document_id: Identifier
    title: NonBlank
    source: NonBlank
    source_url: HttpUrl | None = None
    version: NonBlank | None = None
    kind: Literal["legislation", "procedure", "form", "manual", "other"]
    content_sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    page: int = Field(ge=0, description="One-based PDF page; zero for unpaginated text")
    start_index: int = Field(ge=0)
    excerpt: NonBlank


class RelevanceGrade(StrictModel):
    relevant_chunk_ids: list[str]


class RewrittenQuery(StrictModel):
    query: Annotated[NonBlank, StringConstraints(max_length=2000)]


class GroundedAnswer(StrictModel):
    supported: bool
    answer: NonBlank | None
    citation_ids: list[str]


class RagResult(StrictModel):
    status: Literal["not_configured", "no_evidence", "answered"]
    scope: CorpusScope | None = None
    answer: str | None = None
    sources: list[Evidence] = Field(default_factory=list)
    attempts: int = 0
    is_employee_answer: Literal[False] = False
