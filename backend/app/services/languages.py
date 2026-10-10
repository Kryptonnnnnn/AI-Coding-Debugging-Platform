import re

EXT = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".java": "java", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".go": "go", ".sql": "sql",
    ".json": "json", ".md": "markdown", ".yml": "yaml", ".yaml": "yaml", ".html": "html", ".css": "css",
    ".sh": "shell", ".toml": "toml", ".txt": "text",
}
SUPPORTED = ["python", "javascript", "typescript", "java", "c", "cpp", "go", "sql"]

_SNIPPETS: list[tuple[str, re.Pattern[str]]] = [
    ("python", re.compile(r"^\s*(def \w+\(|import \w+|from \w+ import|print\()", re.M)),
    ("go", re.compile(r"^\s*(package \w+|func \w+\()", re.M)),
    ("java", re.compile(r"\b(public|private)\s+(static\s+)?(class|void|int)\b|System\.out\.")),
    ("cpp", re.compile(r"#include\s*<(iostream|vector|string)>|std::")),
    ("c", re.compile(r"#include\s*<(stdio|stdlib|string)\.h>")),
    ("typescript", re.compile(r":\s*(string|number|boolean)\b|interface \w+|\bas \w+")),
    ("javascript", re.compile(r"\b(const|let|var)\s+\w+\s*=|function\s+\w+\(|=>|console\.log")),
    ("sql", re.compile(r"^\s*(select|insert|update|delete|create table)\b", re.I | re.M)),
]


def detect_language(path: str = "", content: str = "") -> str:
    m = re.search(r"\.[A-Za-z0-9]+$", path or "")
    if m and m.group(0).lower() in EXT:
        return EXT[m.group(0).lower()]
    for lang, pat in _SNIPPETS:
        if pat.search(content[:5000]):
            return lang
    return "text"
