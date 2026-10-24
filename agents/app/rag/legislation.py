"""Lossless article spans and an offline lexical index for curated public legislation."""

import json
import re
import sqlite3
from hashlib import sha256
from pathlib import Path

# Formatting and line wrapping vary across repository Markdown and official HTML.
ARTICLE = re.compile(
    r'(?m)^[ \t]*(?:["“>*#]+[ \t]*)?Art\.[ \t\r\n]*(?:\*+[ \t]*)?'
    r"(\d+)[º°o]?(?:[ \t\r\n]*-[ \t\r\n]*([A-Z]))?(?:\.|\b)"
)


def article_spans(text: str) -> list[dict]:
    """Return exact offsets, retaining paragraphs, amendments and historical wording.

    Occurrences deliberately remain distinct: repeated numbering can mean an
    amending quotation, a transitional provision or an earlier version.
    """
    matches = list(ARTICLE.finditer(text))
    counts = {}
    result = []
    for index, match in enumerate(matches):
        number = match[1] + ("-" + match[2] if match[2] else "")
        counts[number] = counts.get(number, 0) + 1
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        result.append(
            {"article": number, "occurrence": counts[number], "start": match.start(), "end": end}
        )
    return result


def split_span(text: str, start: int, end: int, limit: int = 6500) -> list[tuple[int, int]]:
    """Prefer a paragraph/line boundary; never delete characters or split a word."""
    parts = []
    while end - start > limit:
        cut = text.rfind("\n\n", start + limit // 2, start + limit)
        if cut < 0:
            cut = text.rfind("\n", start + limit // 2, start + limit)
        if cut < 0:
            cut = text.rfind(" ", start + 1, start + limit)
        if cut < 0:
            cut = start + limit
        else:
            cut += 1
        parts.append((start, cut))
        start = cut
    parts.append((start, end))
    return parts


def prepare_chunks(document: dict, text: str) -> tuple[list[dict], list[dict]]:
    """Only index the explicitly selected articles; record every excluded span."""
    checksum = sha256(text.encode()).hexdigest()
    spans = article_spans(text)
    chunks, exclusions = [], []
    if spans and spans[0]["start"]:
        exclusions.append({"start": 0, "end": spans[0]["start"], "reason": "preamble_archive_only"})
    for span in spans:
        number = span["article"]
        selected = document.get("selected_articles", [])
        allowed = (
            document["index_policy"] == "selected_articles"
            and number in selected
            and span["occurrence"] == 1
        )
        if not allowed:
            exclusions.append({**span, "reason": "outside_selection_or_ambiguous_occurrence"})
            continue
        parts = split_span(text, span["start"], span["end"])
        for part, (start, end) in enumerate(parts, 1):
            body = text[start:end]
            identity = f"{document['document_id']}:{checksum}:{number}:{start}:{end}"
            chunks.append(
                {
                    "chunk_id": "law_" + sha256(identity.encode()).hexdigest(),
                    "document_id": document["document_id"],
                    "source_sha256": checksum,
                    "article": number,
                    "occurrence": 1,
                    "part": part,
                    "part_count": len(parts),
                    "start_index": start,
                    "end_index": end,
                    "text": body,
                    **{
                        key: document[key]
                        for key in (
                            "title",
                            "jurisdiction",
                            "law_number",
                            "law_year",
                            "source_url",
                            "effective_status",
                            "applicability",
                            "verified_at",
                            "service_types",
                            "local_path",
                            "quality_notes",
                        )
                    },
                    "municipality": "Cascavel",
                    "municipality_ibge": "4104808",
                    "uf": "PR",
                    "requires_human_review": True,
                    "legal_validation": "pending",
                }
            )
    return chunks, exclusions


def build_lexical_index(path: Path, chunks: list[dict]) -> None:
    with sqlite3.connect(path) as db:
        db.execute("DROP TABLE IF EXISTS laws")
        db.execute(
            "CREATE VIRTUAL TABLE laws USING fts5("
            "chunk_id UNINDEXED, document_id UNINDEXED, text, metadata UNINDEXED, "
            "tokenize='unicode61 remove_diacritics 2')"
        )
        db.executemany(
            "INSERT INTO laws VALUES (?, ?, ?, ?)",
            [
                (c["chunk_id"], c["document_id"], c["text"], json.dumps(c, ensure_ascii=False))
                for c in chunks
            ],
        )


def search_laws(path: Path, query: str, *, k: int = 5) -> list[dict]:
    """Read-only BM25 search; user text never becomes FTS syntax or SQL."""
    if not 1 <= k <= 20:
        raise ValueError("k must be between 1 and 20")
    tokens = re.findall(r"\w+", query, flags=re.UNICODE)[:32]
    if not tokens:
        return []
    expression = " OR ".join('"' + t.replace('"', '""') + '"' for t in tokens)
    # A missing index must not silently create an empty database.
    with sqlite3.connect(path.resolve(strict=True).as_uri() + "?mode=ro", uri=True) as db:
        rows = db.execute(
            "SELECT metadata FROM laws WHERE laws MATCH ? ORDER BY bm25(laws), chunk_id LIMIT ?",
            (expression, k),
        ).fetchall()
    return [json.loads(row[0]) for row in rows]
