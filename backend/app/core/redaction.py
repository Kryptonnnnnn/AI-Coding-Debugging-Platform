"""Secret detection and redaction. Used before sending code to AI providers and before logging."""
import re
from dataclasses import dataclass

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("AWS access key", re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Groq API key", re.compile(r"\bgsk_[A-Za-z0-9]{20,}\b")),
    ("OpenAI-style key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    (
        "Hard-coded credential",
        re.compile(
            r"""(?i)\b(password|passwd|secret|api[_-]?key|token|auth[_-]?token)\b\s*[:=]\s*["']([^"'\s]{8,})["']"""
        ),
    ),
    ("Database URL with password", re.compile(r"\b[a-z+]+://[^\s:/@]+:[^\s@/]{3,}@[^\s/]+")),
]

SENSITIVE_FILENAMES = re.compile(
    r"(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa|id_ed25519|\.npmrc|\.pypirc|credentials(\.json)?|\.dev\.vars)$"
)


@dataclass
class SecretFinding:
    kind: str
    line: int
    preview: str  # already masked


def _mask(v: str) -> str:
    return v[:2] + "…" + "*" * 4 if len(v) > 4 else "****"


def scan_secrets(text: str) -> list[SecretFinding]:
    out: list[SecretFinding] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for kind, pat in PATTERNS:
            m = pat.search(line)
            if m:
                out.append(SecretFinding(kind, lineno, _mask(m.group(0))))
    return out


def redact_secrets(text: str) -> str:
    def repl_cred(m: re.Match[str]) -> str:
        return m.group(0).replace(m.group(2), "[REDACTED]")

    for kind, pat in PATTERNS:
        if kind == "Hard-coded credential":
            text = pat.sub(repl_cred, text)
        else:
            text = pat.sub("[REDACTED]", text)
    return text


def is_sensitive_path(path: str) -> bool:
    return bool(SENSITIVE_FILENAMES.search(path))
