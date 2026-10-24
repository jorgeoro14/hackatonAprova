"""Load only the explicit local files in an operator-supplied corpus manifest."""

from hashlib import sha256
from pathlib import Path

from langchain_core.documents import Document

from .schemas import CorpusManifest


def load_manifest(path: Path) -> CorpusManifest:
    return CorpusManifest.model_validate_json(path.read_text(encoding="utf-8-sig"))


def _read_pages(path: Path) -> list[tuple[int, str]]:
    suffix = path.suffix.casefold()
    if suffix in {".txt", ".md"}:
        return [(0, path.read_text(encoding="utf-8-sig"))]
    if suffix == ".pdf":
        from pypdf import PdfReader

        return [(i + 1, page.extract_text() or "") for i, page in enumerate(PdfReader(path).pages)]
    if suffix == ".docx":
        from docx import Document as WordDocument
        from docx.table import Table

        blocks = []
        for block in WordDocument(path).iter_inner_content():
            if isinstance(block, Table):
                blocks.append("\n".join("\t".join(c.text for c in r.cells) for r in block.rows))
            else:
                blocks.append(block.text)
        return [(0, "\n\n".join(blocks))]
    raise ValueError("Supported source formats: UTF-8 TXT/Markdown, text PDF and DOCX")


def load_documents(manifest: CorpusManifest, source_root: Path) -> list[Document]:
    root = source_root.resolve(strict=True)
    documents = []
    for source in manifest.documents:
        relative = Path(source.path)
        if relative.is_absolute():
            raise ValueError("Source paths must be relative to the manifest directory")
        path = (root / relative).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("Source path must stay inside the manifest directory")
        checksum = sha256(path.read_bytes()).hexdigest()
        pages = _read_pages(path)
        # Fail rather than quietly losing scanned pages or publishing a partial corpus.
        if not pages or any(not text.strip() for _, text in pages):
            raise ValueError(
                "Source contains an empty/unreadable page; extract text or apply OCR first"
            )
        metadata = {
            **manifest.scope.model_dump(exclude={"municipality_name"}),
            **source.model_dump(mode="json", exclude={"path"}, exclude_none=True),
            "source": relative.as_posix(),
            "content_sha256": checksum,
            "data_kind": manifest.data_kind,
        }
        documents.extend(
            Document(page_content=text, metadata={**metadata, "page": page}) for page, text in pages
        )
    return documents
