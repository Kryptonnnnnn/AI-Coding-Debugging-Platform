"""Keyword-based file ranking for "which files are relevant to this question?".

This is lexical retrieval (identifier/path/term matching), not semantic embeddings, and the API says so.
"""
import math
import re

STOP = set("the and for are but not you all any can her was one our out has have how what why when where which who this that with from into does did "
           "code file function class method please show explain make find about there their them then than been being would could should "
           "using use used get got set".split())
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")
_DEF = re.compile(r"^\s*(?:async\s+)?(?:def|class|function|interface|type|const|let|var|func)\s+([A-Za-z_]\w*)", re.M)


def _split_ident(s: str) -> list[str]:
    parts = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s).replace("_", " ").replace("-", " ").lower().split()
    return [p for p in parts if len(p) > 2]


def terms(text: str) -> list[str]:
    out: list[str] = []
    for w in _WORD.findall(text):
        for p in {w.lower(), *_split_ident(w)}:
            if len(p) > 2 and p not in STOP:
                out.append(p)
    return list(dict.fromkeys(out))


def rank_files(question: str, files: list[tuple[str, str]], limit: int = 6) -> list[dict]:
    q = terms(question)
    if not q:
        return []
    results = []
    for path, content in files:
        ptoks = set(_split_ident(path.replace("/", " ").replace(".", " ")))
        defs = {t for d in _DEF.findall(content) for t in [d.lower(), *_split_ident(d)]}
        low = content.lower()
        score, matched = 0.0, []
        for t in q:
            s = 0.0
            if t in ptoks:
                s += 3
            if t in defs:
                s += 2.5
            c = low.count(t)
            if c:
                s += min(2.0, math.log1p(c))
            if s:
                score += s
                matched.append(t)
        if score:
            results.append({"path": path, "score": round(score, 2), "matched_terms": matched[:8]})
    results.sort(key=lambda r: (-r["score"], r["path"]))
    return results[:limit]
