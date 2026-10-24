"""Prepare deterministic, source-traceable chunks without calling an embedding service."""

import json
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from .loaders import load_documents, load_manifest
from .schemas import ChunkSettings, CorpusManifest


@dataclass(frozen=True)
class PreparedCorpus:
    manifest: CorpusManifest
    settings: ChunkSettings
    chunks: list[Document]


def prepare_corpus(manifest_path: Path, settings: ChunkSettings | None = None) -> PreparedCorpus:
    settings = settings or ChunkSettings()
    manifest = load_manifest(manifest_path)
    pages = load_documents(manifest, manifest_path.parent)
    options = {
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "add_start_index": True,
    }
    if settings.strategy == "markdown":
        if any(Path(source.path).suffix.casefold() != ".md" for source in manifest.documents):
            raise ValueError("Markdown chunking requires Markdown source files")
        splitter = RecursiveCharacterTextSplitter.from_language(Language.MARKDOWN, **options)
    else:
        splitter = RecursiveCharacterTextSplitter(**options)
    chunks = splitter.split_documents(pages)
    if not chunks:
        raise ValueError("Corpus contains no indexable text")
    for chunk in chunks:
        identity = json.dumps(
            {"metadata": chunk.metadata, "text": chunk.page_content}, sort_keys=True
        )
        chunk_id = sha256(identity.encode("utf-8")).hexdigest()
        chunk.id = chunk_id
        chunk.metadata["chunk_id"] = chunk_id
    return PreparedCorpus(manifest=manifest, settings=settings, chunks=chunks)
