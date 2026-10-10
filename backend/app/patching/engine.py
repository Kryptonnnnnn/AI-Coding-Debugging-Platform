"""Diff creation, validation and strict application. Never silently corrupts a file."""
import difflib
import re
from dataclasses import dataclass

from app.core.errors import AppError, Conflict

_HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def make_diff(old: str, new: str, path: str) -> str:
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True), new.splitlines(keepends=True), f"a/{path}", f"b/{path}", n=3
        )
    )


@dataclass
class DiffStats:
    added: int
    removed: int


def diff_stats(diff: str) -> DiffStats:
    a = r = 0
    for line in diff.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            a += 1
        elif line.startswith("-") and not line.startswith("---"):
            r += 1
    return DiffStats(a, r)


def apply_unified_diff(original: str, diff: str) -> str:
    """Apply a single-file unified diff strictly; context must match exactly or Conflict is raised."""
    src = original.splitlines(keepends=True)
    out: list[str] = []
    pos = 0
    lines = diff.splitlines(keepends=True)
    i = 0
    seen_hunk = False
    while i < len(lines):
        m = _HUNK.match(lines[i])
        if not m:
            if seen_hunk and lines[i].strip() and not lines[i].startswith(("---", "+++", "diff", "index")):
                raise AppError("Malformed patch.", code="invalid_patch")
            i += 1
            continue
        seen_hunk = True
        start = int(m.group(1)) - (1 if int(m.group(2) or 1) > 0 else 0)
        if start < pos:
            raise AppError("Overlapping hunks in patch.", code="invalid_patch")
        out.extend(src[pos:start])
        pos = start
        i += 1
        while i < len(lines) and not _HUNK.match(lines[i]):
            ln = lines[i]
            tag, body = ln[:1], ln[1:]
            if tag == "\\":
                i += 1
                continue
            if tag in (" ", "-"):
                if pos >= len(src) or src[pos].rstrip("\r\n") != body.rstrip("\r\n"):
                    raise Conflict(f"Patch does not apply cleanly near line {pos + 1}: file content has changed.", code="patch_conflict")
                if tag == " ":
                    out.append(src[pos])
                pos += 1
            elif tag == "+":
                out.append(body)
            elif ln.strip() == "":
                pass
            else:
                raise AppError("Malformed patch.", code="invalid_patch")
            i += 1
    if not seen_hunk:
        raise AppError("Patch contains no hunks.", code="invalid_patch")
    out.extend(src[pos:])
    return "".join(out)


def validate_proposed(original: str, proposed: str) -> None:
    if proposed == original:
        raise AppError("The proposed change is identical to the current file.", code="no_change")
    if not proposed.strip() and original.strip():
        raise AppError("Refusing a patch that would empty the file.", code="invalid_patch")
