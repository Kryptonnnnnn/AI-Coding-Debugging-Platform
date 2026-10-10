import hashlib
import io
import posixpath
import zipfile
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.errors import AppError

EXCLUDED_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build", ".next", "target", ".idea", ".vscode"}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".gz", ".tar", ".exe", ".dll", ".so", ".dylib",
              ".class", ".jar", ".pyc", ".woff", ".woff2", ".ttf", ".mp3", ".mp4", ".db", ".sqlite"}


def normalize_path(raw: str) -> str:
    """Return a safe, relative POSIX path or raise. Rejects traversal, absolute and odd paths."""
    if not raw or "\x00" in raw or "\\" in raw:
        raise AppError("Invalid file path.", code="invalid_path")
    p = raw.strip()
    if p.startswith("/") or (len(p) > 1 and p[1] == ":"):
        raise AppError("Absolute paths are not allowed.", code="invalid_path")
    norm = posixpath.normpath(p)
    parts = norm.split("/")
    if norm != p or norm in (".", "") or any(x in ("..", "") for x in parts):
        raise AppError("Path traversal is not allowed.", code="invalid_path")
    if len(norm) > 400 or len(parts) > 20:
        raise AppError("Path is too long.", code="invalid_path")
    return norm


def decode_text(data: bytes) -> str:
    if b"\x00" in data[:8192]:
        raise AppError("Binary files are not supported.", code="invalid_encoding")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise AppError("File is not valid UTF-8 text.", code="invalid_encoding") from e


def sha(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def check_file_size(content: str) -> int:
    n = len(content.encode())
    if n > get_settings().max_file_bytes:
        raise AppError(f"File exceeds the {get_settings().max_file_bytes // 1024} KB limit.", status_code=413, code="file_too_large")
    return n


@dataclass
class Extracted:
    files: dict[str, str]
    skipped: list[dict]


def extract_zip(data: bytes) -> Extracted:
    """Safely read a ZIP in memory. Nothing is ever written to disk and entries are never trusted."""
    s = get_settings()
    if len(data) > s.max_zip_bytes:
        raise AppError("Archive too large.", status_code=413, code="archive_too_large")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise AppError("Not a valid ZIP archive.", code="invalid_archive") from e
    infos = zf.infolist()
    if len(infos) > s.max_project_files * 2:
        raise AppError("Archive has too many entries.", code="invalid_archive")
    if sum(i.file_size for i in infos) > s.max_project_bytes * 4:
        raise AppError("Archive expands to too much data (possible zip bomb).", status_code=413, code="archive_too_large")
    files: dict[str, str] = {}
    skipped: list[dict] = []
    total = 0
    for info in infos:
        name = info.filename
        if info.is_dir():
            continue
        # Reject (not skip) dangerous structure: traversal, absolute paths, symlinks.
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise AppError(f"Archive contains a symlink: rejected.", code="unsafe_archive")
        try:
            path = normalize_path(name)
        except AppError as e:
            raise AppError("Archive contains an unsafe path and was rejected.", code="unsafe_archive") from e
        parts = path.split("/")
        if any(p in EXCLUDED_DIRS for p in parts[:-1]) or posixpath.splitext(path)[1].lower() in BINARY_EXT:
            skipped.append({"path": path, "reason": "excluded (dependency/binary)"})
            continue
        if info.file_size > s.max_file_bytes:
            skipped.append({"path": path, "reason": "too large"})
            continue
        try:
            text = decode_text(zf.read(info))
        except AppError:
            skipped.append({"path": path, "reason": "not valid UTF-8 text"})
            continue
        if path in files:
            skipped.append({"path": path, "reason": "duplicate entry"})
            continue
        total += len(text.encode())
        if total > s.max_project_bytes or len(files) >= s.max_project_files:
            raise AppError("Project size limit exceeded.", status_code=413, code="project_too_large")
        files[path] = text
    return Extracted(files, skipped)
