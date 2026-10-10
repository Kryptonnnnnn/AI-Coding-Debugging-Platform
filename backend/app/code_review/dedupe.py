"""Duplicate detection and stable fingerprints for review findings."""
import difflib
import hashlib
import re

_STOP = set("the and for are but not use used using with from this that should would could can may might into when where which have has been being than then "
            "code line file value values error issue instead make sure avoid ensure".split())


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[`'\"]", "", s.lower())).strip()


def tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z_][a-z0-9_]{2,}", s.lower()) if w not in _STOP}


def fingerprint(file_path: str, kind: str, text: str, evidence: str = "") -> str:
    """Stable across line shifts: file + kind(rule id or category) + normalized text/evidence, no line numbers."""
    basis = f"{file_path}|{_norm(kind)}|{_norm(evidence) or _norm(text)}"
    return hashlib.sha1(basis.encode()).hexdigest()


def overlaps(a_start, a_end, b_start, b_end) -> bool:
    if a_start is None or b_start is None:
        return False
    return a_start <= (b_end or b_start) and b_start <= (a_end or a_start)


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def same_issue_as_tool(ai, tool) -> bool:
    """An AI finding duplicates a tool finding when they refer to the same lines AND talk about the same thing."""
    if ai.file_path != tool.file_path or not overlaps(ai.line_start, ai.line_end, tool.line_start, tool.line_end):
        return False
    a = tokens(f"{ai.title} {ai.description} {ai.remediation}")
    t = tokens(f"{tool.title} {tool.description} {tool.rule_id}")
    return jaccard(a, t) >= 0.12 or len(a & t) >= 2


def same_issue_as_ai(x, y) -> bool:
    if x.file_path != y.file_path:
        return False
    if x.line_start is not None and y.line_start is not None and not overlaps(x.line_start, x.line_end, y.line_start, y.line_end):
        return False
    r = difflib.SequenceMatcher(None, _norm(x.title or x.description), _norm(y.title or y.description)).ratio()
    return r >= 0.8 or jaccard(tokens(f"{x.title} {x.description}"), tokens(f"{y.title} {y.description}")) >= 0.6


def merge_duplicates(tool_rows: list, ai_rows: list) -> tuple[list, list, int]:
    """Returns (tool_rows, kept_ai_rows, merged_count). Tool rows get merged_count incremented for each folded AI finding."""
    kept: list = []
    merged = 0
    for ai in ai_rows:
        host = next((t for t in tool_rows if same_issue_as_tool(ai, t)), None)
        if host is not None:
            host.merged_count = (host.merged_count or 0) + 1
            merged += 1
            continue
        twin = next((k for k in kept if same_issue_as_ai(ai, k)), None)
        if twin is not None:
            twin.merged_count = (twin.merged_count or 0) + 1
            merged += 1
            continue
        kept.append(ai)
    return tool_rows, kept, merged
