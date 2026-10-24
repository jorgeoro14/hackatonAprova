"""Offline Phase 3 regression checks."""

import json
from copy import deepcopy

import pytest
from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.ingest import prepare_corpus
from agents.app.rag.loaders import load_manifest
from agents.app.rag.workflow import MunicipalRag
from langchain_core.runnables import RunnableLambda

EXAMPLE_MANIFEST = REPOSITORY_ROOT / "agents/examples/rag/manifest.synthetic.json"

pytestmark = pytest.mark.phase3


class StructuredModel:
    def __init__(self, **responses):
        self.responses = responses
        self.calls = []

    def with_structured_output(self, schema):
        def respond(messages):
            self.calls.append((schema.__name__, messages))
            return schema.model_validate(self.responses[schema.__name__].pop(0))

        return RunnableLambda(respond)


class Retriever:
    def __init__(self, documents):
        self.scope = load_manifest(EXAMPLE_MANIFEST).scope
        self.documents = documents
        self.queries = []

    def search(self, query):
        self.queries.append(query)
        return deepcopy(self.documents)


def evidence_document():
    return prepare_corpus(EXAMPLE_MANIFEST).chunks[0]


def test_grade_then_generate_returns_only_real_citations():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}],
        GroundedAnswer=[
            {
                "supported": True,
                "answer": "This synthetic guide describes triage.",
                "citation_ids": [doc.id],
            }
        ],
    )
    retriever = Retriever([doc])
    result = MunicipalRag(model, retriever).search("How does the fictional triage work?")
    assert result.status == "answered"
    assert result.attempts == 1
    assert [source.chunk_id for source in result.sources] == [doc.id]
    assert result.sources[0].version is None
    assert result.sources[0].data_kind == "synthetic"
    assert result.is_employee_answer is False


def test_irrelevant_documents_trigger_one_rewrite_preserving_original_question():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": []}, {"relevant_chunk_ids": [doc.id]}],
        RewrittenQuery=[{"query": "fictional application triage"}],
        GroundedAnswer=[
            {
                "supported": True,
                "answer": "Synthetic triage checks completeness.",
                "citation_ids": [doc.id],
            }
        ],
    )
    retriever = Retriever([doc])
    question = "Which checks come first?"
    result = MunicipalRag(model, retriever).search(question)
    assert retriever.queries == [question, "fictional application triage"]
    assert result.attempts == 2
    generation = next(messages for name, messages in model.calls if name == "GroundedAnswer")
    assert json.loads(generation[-1].content)["question"] == question


def test_empty_retrieval_stops_at_budget_and_never_generates_an_answer():
    model = StructuredModel(RewrittenQuery=[{"query": "clearer question"}])
    retriever = Retriever([])
    result = MunicipalRag(model, retriever).search("A question")
    assert result.status == "no_evidence"
    assert result.answer is None
    assert result.sources == []
    assert len(retriever.queries) == 2
    assert [name for name, _ in model.calls] == ["RewrittenQuery"]


@pytest.mark.parametrize(
    "citation_ids,supported", [(["invented-source"], True), ([], True), ([], False)]
)
def test_unsupported_or_invented_answer_citations_abstain(citation_ids, supported):
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}],
        GroundedAnswer=[
            {"supported": supported, "answer": "Unsupported", "citation_ids": citation_ids}
        ],
    )
    result = MunicipalRag(model, Retriever([doc])).search("Question")
    assert result.status == "no_evidence"
    assert result.answer is None
    assert not result.sources


def test_foreign_municipal_document_is_rejected_before_model_call():
    doc = evidence_document()
    doc.metadata["municipality_id"] = "another-city"
    model = StructuredModel()
    with pytest.raises(ValueError, match="scope"):
        MunicipalRag(model, Retriever([doc])).search("Question")
    assert not model.calls


def test_foreign_corpus_and_invented_grade_citations_are_rejected():
    doc = evidence_document()
    doc.metadata["corpus_id"] = "another-corpus"
    with pytest.raises(ValueError, match="scope"):
        MunicipalRag(StructuredModel(), Retriever([doc])).search("Question")
    model = StructuredModel(RelevanceGrade=[{"relevant_chunk_ids": ["invented"]}])
    with pytest.raises(ValueError, match="unretrieved"):
        MunicipalRag(model, Retriever([evidence_document()])).search("Question")


def test_graph_has_no_hidden_evidence_from_previous_invocation():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}, {"relevant_chunk_ids": []}],
        GroundedAnswer=[
            {"supported": True, "answer": "Synthetic source answer", "citation_ids": [doc.id]}
        ],
    )
    rag = MunicipalRag(model, Retriever([doc]), max_attempts=1)
    assert rag.search("First question").sources
    assert rag.search("Unrelated second question").sources == []


def test_rag_rejects_unknown_or_mismatched_session_municipality():
    rag = MunicipalRag(StructuredModel(), Retriever([]))
    rag.validate_municipality(" Example CITY ")
    for name in (None, "Other City"):
        with pytest.raises(ValueError, match="municipality"):
            rag.validate_municipality(name)


def test_no_scope_argument_is_exposed_to_the_model():
    from agents.app.agent.tools import build_tools
    from agents.app.knowledge.catalog import JsonProcessCatalog

    search = next(
        tool
        for tool in build_tools(JsonProcessCatalog([]))
        if tool.name == "search_municipal_documents"
    )
    assert set(search.args) == {"query"}
    result = json.loads(search.invoke({"query": "What is the local deadline?"}))
    assert result["status"] == "not_configured"
    assert result["answer"] is None
    assert not result["sources"]


def test_phase3_evaluates_actual_graph_and_keeps_judge_scores_separate():
    from agents.app.rag.evaluation import Experiment, QueryDataset, evaluate_agentic_rag, summarize

    doc = evidence_document()
    retriever = Retriever([doc])
    dataset = QueryDataset.model_validate(
        {
            "scope": retriever.scope.model_dump(),
            "data_kind": "synthetic",
            "queries": [
                {
                    "id": "triage",
                    "question": "What is checked?",
                    "expected_document_ids": ["demo-permit-guide"],
                    "expected_phrases": ["site description"],
                    "reference_answer": "The synthetic clerk checks the site description.",
                },
                {"id": "fee", "question": "Exact fee?", "should_abstain": True},
            ],
        }
    )
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}, {"relevant_chunk_ids": []}],
        GroundedAnswer=[
            {
                "supported": True,
                "answer": "The synthetic clerk checks the site description.",
                "citation_ids": [doc.id],
            }
        ],
    )
    judge = StructuredModel(AnswerJudgment=[{"correct": True, "relevant": True, "grounded": True}])
    rows = evaluate_agentic_rag(
        dataset,
        MunicipalRag(model, retriever, max_attempts=1),
        Experiment(name="test", index="test"),
        judge,
    )
    assert rows[0]["source_recall"] == 1
    assert rows[0]["answer_phrase_coverage"] == 1
    assert rows[0]["correctness"] is True
    assert rows[1]["result_status"] == "no_evidence"
    assert rows[1]["abstention_correct"] is True
    assert rows[1]["correctness"] is None
    summary = summarize(rows)[0]
    assert summary["correctness_count"] == 1
    assert summary["abstention_correct_count"] == 2


def test_judge_failure_is_recorded_as_error_and_never_a_negative_judgment():
    from agents.app.rag.evaluation import Experiment, QueryDataset, evaluate_agentic_rag

    doc = evidence_document()
    retriever = Retriever([doc])
    dataset = QueryDataset.model_validate(
        {
            "scope": retriever.scope.model_dump(),
            "data_kind": "synthetic",
            "queries": [
                {
                    "id": "triage",
                    "question": "What is checked?",
                    "expected_document_ids": ["demo-permit-guide"],
                }
            ],
        }
    )
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}],
        GroundedAnswer=[
            {"supported": True, "answer": "Synthetic answer", "citation_ids": [doc.id]}
        ],
    )
    rows = evaluate_agentic_rag(
        dataset,
        MunicipalRag(model, retriever),
        Experiment(name="test", index="test"),
        StructuredModel(),
    )
    assert rows[0]["status"] == "error"
    assert rows[0]["error_code"] == "judge_failed"
    assert rows[0]["correctness"] is None
