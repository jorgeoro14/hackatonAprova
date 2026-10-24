"""Persistent Chroma snapshots with fixed municipality scope and embedding identity."""

import json
from hashlib import sha256
from pathlib import Path
from typing import Protocol

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from .ingest import PreparedCorpus
from .schemas import CorpusScope, EmbeddingSpec, Evidence, IndexDescriptor, RetrievalSettings


class MunicipalRetriever(Protocol):
    scope: CorpusScope

    def search(self, query: str) -> list[Document]: ...


def read_descriptor(index_dir: Path) -> IndexDescriptor:
    return IndexDescriptor.model_validate_json(
        (index_dir / "index.json").read_text(encoding="utf-8")
    )


def _open_store(index_dir: Path, descriptor: IndexDescriptor, embeddings: Embeddings, create: bool):
    from chromadb.config import Settings
    from langchain_chroma import Chroma

    return Chroma(
        collection_name=descriptor.collection_name,
        persist_directory=str(index_dir / "chroma"),
        embedding_function=embeddings,
        create_collection_if_not_exists=create,
        client_settings=Settings(anonymized_telemetry=False),
    )


def build_index(
    corpus: PreparedCorpus, index_dir: Path, embeddings: Embeddings, spec: EmbeddingSpec
) -> IndexDescriptor:
    fingerprint = sha256(
        json.dumps(
            {
                "manifest": corpus.manifest.model_dump(mode="json"),
                "settings": corpus.settings.model_dump(),
                "embedding": spec.model_dump(),
                "chunks": [chunk.id for chunk in corpus.chunks],
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    descriptor = IndexDescriptor(
        scope=corpus.manifest.scope,
        data_kind=corpus.manifest.data_kind,
        embedding=spec,
        chunk_settings=corpus.settings,
        collection_name="municipal_" + fingerprint,
        chunk_count=len(corpus.chunks),
    )
    if (index_dir / "index.json").exists():
        previous = read_descriptor(index_dir)
        if previous.scope != descriptor.scope:
            raise ValueError("Use a separate index directory for each municipality/corpus")
    index_dir.mkdir(parents=True, exist_ok=True)
    store = _open_store(index_dir, descriptor, embeddings, create=True)
    existing_ids = set(store.get(include=[])["ids"])
    pending = [chunk for chunk in corpus.chunks if chunk.id not in existing_ids]
    for start in range(0, len(pending), 64):
        batch = pending[start : start + 64]
        store.add_documents(batch, ids=[chunk.id for chunk in batch])
    if set(store.get(include=[])["ids"]) != {chunk.id for chunk in corpus.chunks}:
        raise ValueError("Index is incomplete; previous active snapshot remains unchanged")
    temporary = index_dir / "index.json.tmp"
    temporary.write_text(descriptor.model_dump_json(indent=2) + "\n", encoding="utf-8")
    temporary.replace(index_dir / "index.json")
    return descriptor


def scoped_evidence(document: Document, scope: CorpusScope) -> Evidence:
    evidence = Evidence.model_validate({**document.metadata, "excerpt": document.page_content})
    if evidence.municipality_id != scope.municipality_id or evidence.corpus_id != scope.corpus_id:
        raise ValueError("Retriever returned a document outside its authorized scope")
    return evidence


class ChromaMunicipalRetriever:
    def __init__(
        self,
        index_dir: Path,
        embeddings: Embeddings,
        spec: EmbeddingSpec,
        *,
        k: int = 4,
        settings: RetrievalSettings | None = None,
    ):
        descriptor = read_descriptor(index_dir)
        if spec != descriptor.embedding:
            raise ValueError("Query embeddings must match the indexed provider/model")
        self.scope = descriptor.scope
        self.settings = settings or RetrievalSettings(k=k)
        self._store = _open_store(index_dir, descriptor, embeddings, create=False)
        self._filter = {
            "$and": [
                {"municipality_id": self.scope.municipality_id},
                {"corpus_id": self.scope.corpus_id},
            ]
        }

    def search(self, query: str) -> list[Document]:
        settings = self.settings
        if settings.search_type == "mmr":
            documents = self._store.max_marginal_relevance_search(
                query,
                k=settings.k,
                fetch_k=settings.fetch_k,
                lambda_mult=settings.lambda_mult,
                filter=self._filter,
            )
        else:
            documents = self._store.similarity_search(query, k=settings.k, filter=self._filter)
        for document in documents:
            scoped_evidence(document, self.scope)
        return documents
