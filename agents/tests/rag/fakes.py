"""Deterministic embeddings for plumbing checks; never used as semantic quality evidence."""

from langchain_core.embeddings import Embeddings


class OfflineEmbeddings(Embeddings):
    __test__ = False

    def __init__(self):
        self.document_calls = 0
        self.query_calls = 0

    def embed_documents(self, texts):
        self.document_calls += 1
        return [[1.0, float(len(text) % 7 + 1), 0.5] for text in texts]

    def embed_query(self, text):
        self.query_calls += 1
        return [1.0, 1.0, 0.5]
