"""Retrieval scores use expected source IDs; lexical coverage is only diagnostic."""

import pytest
from agents.app.paths import AGENTS_ROOT
from agents.app.rag.evaluation import (
    QueryCase,
    evaluate_retrieval,
    load_dataset,
    load_experiments,
    retrieval_metrics,
    summarize,
)
from agents.app.rag.ingest import prepare_corpus

pytestmark = pytest.mark.phase1
DATA = AGENTS_ROOT / "tests/rag"


def test_multi_document_recall_and_rank_do_not_use_keyword_hits():
    case = QueryCase(
        id="check",
        question="Question",
        expected_document_ids=["doc-a", "doc-b"],
        expected_phrases=["expected wording"],
    )
    result = retrieval_metrics(case, ["wrong-doc", "doc-a", "doc-a"], "EXPECTED   WORDING")
    assert result["hit_at_1"] is False
    assert result["hit_at_k"] is True
    assert result["recall_at_k"] == 0.5
    assert result["reciprocal_rank"] == 0.5
    assert result["phrase_coverage"] == 1.0
    wrong = retrieval_metrics(case, ["wrong-doc"], "expected wording")
    assert wrong["hit_at_k"] is False
    assert wrong["phrase_coverage"] == 1.0


def test_negative_questions_do_not_inflate_retrieval_scores():
    case = QueryCase(id="missing", question="Unknown fee?", should_abstain=True)
    scores = retrieval_metrics(case, ["any-doc"], "text")
    assert all(value is None for value in scores.values())


def test_empty_retrieval_is_a_miss_and_errors_remain_in_denominator():
    dataset = load_dataset(DATA / "rag_queries.json")
    experiment = load_experiments(DATA / "experiments.json").experiments[0]

    class FailingRetriever:
        scope = dataset.scope

        def search(self, query):
            raise TimeoutError("Source text must not appear in reports")

    rows = evaluate_retrieval(dataset, FailingRetriever(), experiment)
    summary = summarize(rows)[0]
    assert summary["errors"] == len(dataset.queries)
    assert summary["hit_at_k_count"] == 3
    assert summary["hit_at_k"] == 0
    assert "Source text" not in str(rows)


def test_scoped_dataset_retrieval_returns_document_identity_and_no_source_text():
    dataset = load_dataset(DATA / "rag_queries.json")
    corpus = prepare_corpus(DATA / "data/manifest.synthetic.json")
    experiment = load_experiments(DATA / "experiments.json").experiments[0]

    class Retriever:
        scope = dataset.scope

        def search(self, query):
            return corpus.chunks

    rows = evaluate_retrieval(dataset, Retriever(), experiment)
    assert all(row["status"] == "ok" for row in rows)
    assert rows[0]["hit_at_k"] is True
    assert "excerpt" not in str(rows)
    assert "licensing clerk" not in str(rows)


def test_scope_mismatch_fails_before_querying():
    dataset = load_dataset(DATA / "rag_queries.json")
    experiment = load_experiments(DATA / "experiments.json").experiments[0]

    class WrongRetriever:
        scope = dataset.scope.model_copy(update={"municipality_id": "wrong-city"})

        def search(self, query):
            pytest.fail("A foreign scope must not be queried")

    with pytest.raises(ValueError, match="scope"):
        evaluate_retrieval(dataset, WrongRetriever(), experiment)
