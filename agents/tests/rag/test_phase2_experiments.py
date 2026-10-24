"""Experiment validation, offline phase plans and report boundaries."""

import json

import pytest
from agents.app.paths import AGENTS_ROOT
from agents.app.rag.evaluation import (
    ExperimentSuite,
    QueryDataset,
    load_dataset,
    load_experiments,
    retrieval_metrics,
    write_report,
)
from agents.scripts.rag_phase_common import run_phase
from pydantic import ValidationError

pytestmark = pytest.mark.phase2
DATA = AGENTS_ROOT / "tests/rag"


@pytest.mark.parametrize("phase", [1, 2, 3])
def test_phase_plan_needs_no_keys_or_index_and_keeps_negative_case(
    phase, tmp_path, monkeypatch, capsys
):
    for key in ["MODEL_API_KEY", "EMBEDDING_API_KEY", "MODEL_NAME", "EVAL_MODEL_NAME"]:
        monkeypatch.delenv(key, raising=False)
    output = tmp_path / "reports"
    monkeypatch.setattr(
        "sys.argv",
        ["phase", "--fast", "--index-root", str(tmp_path / "missing"), "--output-dir", str(output)],
    )
    assert run_phase(phase) == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["mode"] == "plan"
    assert "unknown-fee" in plan["case_ids"]
    assert plan["case_count_per_experiment"] == 3
    if phase == 1:
        assert all(exp["retrieval"]["search_type"] == "vector" for exp in plan["experiments"])
    if phase == 3:
        assert len(plan["experiments"]) == 1
    assert not output.exists()


def test_unknown_options_and_inconsistent_gold_are_rejected():
    suite = load_experiments(DATA / "experiments.json").model_dump()
    suite["experiments"][0]["index"] = "missing"
    with pytest.raises(ValidationError, match="unknown index"):
        ExperimentSuite.model_validate(suite)
    suite["experiments"][0]["index"] = "recursive_1000_200"
    suite["experiments"][0]["retrieval"]["search_type"] = "hybrid_rrf"
    with pytest.raises(ValidationError):
        ExperimentSuite.model_validate(suite)
    dataset = load_dataset(DATA / "rag_queries.json").model_dump()
    dataset["queries"][0]["should_abstain"] = True
    with pytest.raises(ValidationError, match="Abstention"):
        QueryDataset.model_validate(dataset)


def test_reports_contain_ids_metrics_and_run_metadata_without_source_text(tmp_path):
    dataset = load_dataset(DATA / "rag_queries.json")
    suite = load_experiments(DATA / "experiments.json")
    case = dataset.queries[0]
    rows = [
        {
            "experiment": suite.experiments[0].name,
            "case_id": case.id,
            "status": "ok",
            **retrieval_metrics(case, ["demo-triage"], "licensing clerk checks site description"),
        }
    ]
    write_report(tmp_path, 2, dataset, suite, rows, {"mode": "offline_test", "judge_model": None})
    report = json.loads((tmp_path / "phase2_results.json").read_text())
    assert report["data_kind"] == "synthetic"
    assert report["run"]["mode"] == "offline_test"
    assert report["summary"][0]["hit_at_k"] == 1
    assert report["summary"][0]["correctness"] is None
    for path in tmp_path.iterdir():
        assert case.question not in path.read_text()
        assert "licensing clerk" not in path.read_text()
    assert (tmp_path / "phase2_results.csv").read_text().startswith("experiment,case_id,")


def test_live_preflight_rejects_missing_index_without_claiming_scores(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.setattr(
        "sys.argv",
        [
            "phase",
            "--live",
            "--index-root",
            str(tmp_path / "missing"),
            "--output-dir",
            str(tmp_path / "reports"),
        ],
    )
    assert run_phase(2) == 1
    captured = capsys.readouterr()
    assert not captured.out
    assert "No successful run is claimed" in captured.err
    assert not (tmp_path / "reports").exists()


@pytest.mark.parametrize("method", ["vector", "mmr"])
def test_actual_chroma_search_methods_apply_scope_filters(method, tmp_path):
    pytest.importorskip("langchain_chroma")
    from agents.app.rag.ingest import prepare_corpus
    from agents.app.rag.schemas import EmbeddingSpec, RetrievalSettings
    from agents.app.rag.store import ChromaMunicipalRetriever, build_index
    from agents.tests.rag.fakes import OfflineEmbeddings

    corpus = prepare_corpus(DATA / "data/manifest.synthetic.json")
    embeddings = OfflineEmbeddings()
    spec = EmbeddingSpec(model="offline-phase-test")
    build_index(corpus, tmp_path, embeddings, spec)
    retriever = ChromaMunicipalRetriever(
        tmp_path, embeddings, spec, settings=RetrievalSettings(search_type=method)
    )
    # Inject a foreign record to prove filtering, not just collection separation.
    foreign = corpus.chunks[0].model_copy(deep=True)
    foreign.id = "foreign"
    foreign.metadata["chunk_id"] = "foreign"
    foreign.metadata["municipality_id"] = "foreign-city"
    retriever._store.add_documents([foreign], ids=["foreign"])
    results = retriever.search("site description")
    assert results
    assert all(
        doc.metadata["municipality_id"] == corpus.manifest.scope.municipality_id for doc in results
    )
    assert "foreign" not in {doc.id for doc in results}
