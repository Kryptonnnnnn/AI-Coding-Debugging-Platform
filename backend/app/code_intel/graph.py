"""Static import-relationship analysis.

Python is parsed with `ast`. JavaScript/TypeScript use pattern matching on import/require statements.
This is *not* a semantic call graph: dynamic imports, aliases, re-exports through computed paths and
runtime module resolution are not followed. Other languages are reported as unsupported.
"""
import ast
import posixpath
import re
from dataclasses import dataclass, field

METHOD = {
    "python": "ast (import statements)",
    "javascript": "pattern match (import/require/export-from)",
    "typescript": "pattern match (import/require/export-from)",
}
JS_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_JS_IMPORT = re.compile(
    r"""(?:^|[\s;])(?:import\s+(?:[\w*{}\s,$]+\s+from\s+)?|export\s+(?:[\w*{}\s,$]+\s+)?from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']""",
    re.M,
)


@dataclass
class Node:
    path: str
    language: str
    supported: bool
    imports: list[str] = field(default_factory=list)       # resolved project files
    external: list[str] = field(default_factory=list)      # third-party / stdlib packages
    unresolved: list[str] = field(default_factory=list)    # relative imports that match no project file
    imported_by: list[str] = field(default_factory=list)


def _py_modules(paths: list[str]) -> dict[str, str]:
    """dotted module name -> file path (also registers suffixes so `src/` layouts resolve)."""
    out: dict[str, str] = {}
    for p in paths:
        if not p.endswith(".py"):
            continue
        parts = p[:-3].split("/")
        if parts[-1] == "__init__":
            parts = parts[:-1]
        if not parts:
            continue
        for i in range(len(parts)):
            out.setdefault(".".join(parts[i:]), p)
    return out


def _py_imports(path: str, code: str) -> tuple[list[tuple[str, int, bool]], bool]:
    """Returns ([(dotted, relative_level, is_submodule_guess)], parsed_ok).
    `from pkg import name` yields (pkg, ...) plus a guess (pkg.name, ..., True) in case `name` is a submodule."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return [], False
    found: list[tuple[str, int, bool]] = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            found += [(a.name, 0, False) for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            base = n.module or ""
            found.append((base, n.level, False))
            for a in n.names:  # `from pkg import submodule`
                found.append((f"{base}.{a.name}" if base else a.name, n.level, True))
    return found, True


def _resolve_py(path: str, dotted: str, level: int, mods: dict[str, str]) -> str | None:
    if level:
        pkg = path.split("/")[:-1]
        if level > 1:
            pkg = pkg[: len(pkg) - (level - 1)] if len(pkg) >= level - 1 else []
        cand = ".".join([*pkg, *(dotted.split(".") if dotted else [])])
        hit = mods.get(cand)
        if hit:
            return hit
        # relative to the importing file's directory, regardless of package root
        base = "/".join(path.split("/")[:-1])
        rel = posixpath.join(base, *(dotted.split(".") if dotted else ["__init__"]))
        return next((p for p in (rel + ".py", rel + "/__init__.py") if p in mods.values()), None)
    return mods.get(dotted)


def _resolve_js(path: str, spec: str, existing: set[str]) -> str | None:
    base = posixpath.normpath(posixpath.join(posixpath.dirname(path), spec))
    for cand in [base, *(base + e for e in JS_EXT), *(f"{base}/index{e}" for e in JS_EXT)]:
        if cand in existing:
            return cand
    return None


def build_graph(files: list[tuple[str, str, str]]) -> dict:
    """`files` = [(path, language, content)]. Returns nodes, edges, cycles and an honest method note."""
    paths = [p for p, _, _ in files]
    existing = set(paths)
    mods = _py_modules(paths)
    nodes: dict[str, Node] = {}
    for path, lang, code in files:
        n = Node(path, lang, lang in METHOD)
        nodes[path] = n
        if lang == "python":
            imps, ok = _py_imports(path, code)
            if not ok:
                n.unresolved.append("(file has a syntax error; imports not analysed)")
            seen: set[str] = set()
            for dotted, level, guess in imps:
                target = _resolve_py(path, dotted, level, mods)
                if target and target != path:
                    if target not in seen:
                        seen.add(target)
                        n.imports.append(target)
                elif not target and not guess:  # a failed submodule guess just means `name` is not a module
                    if level:
                        n.unresolved.append("." * level + dotted)
                    elif dotted and dotted.split(".")[0] not in n.external:
                        n.external.append(dotted.split(".")[0])
        elif lang in ("javascript", "typescript"):
            for m in _JS_IMPORT.finditer(code):
                spec = m.group(1)
                if spec.startswith("."):
                    target = _resolve_js(path, spec, existing)
                    if target and target != path:
                        if target not in n.imports:
                            n.imports.append(target)
                    elif not target and spec not in n.unresolved:
                        n.unresolved.append(spec)
                else:
                    pkg = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
                    if not spec.startswith(("node:", "http")) and pkg not in n.external:
                        n.external.append(pkg)
    for n in nodes.values():
        for t in n.imports:
            nodes[t].imported_by.append(n.path)
    return {
        "method": {l: m for l, m in METHOD.items() if any(n.language == l for n in nodes.values())},
        "disclaimer": "Static import analysis only: dynamic imports, aliases and runtime resolution are not followed. This is not a semantic call graph.",
        "nodes": [n.__dict__ for n in sorted(nodes.values(), key=lambda x: x.path)],
        "edges": sum(len(n.imports) for n in nodes.values()),
        "cycles": find_cycles(nodes),
        "unsupported": sorted({n.language for n in nodes.values() if not n.supported and n.language not in ("text", "markdown", "json", "yaml", "toml", "html", "css")}),
    }


def find_cycles(nodes: dict[str, Node], limit: int = 10) -> list[list[str]]:
    """Strongly connected components with more than one file (circular imports)."""
    index, low, stack, on, out, counter = {}, {}, [], set(), [], [0]

    def strong(v: str) -> None:
        index[v] = low[v] = counter[0]; counter[0] += 1
        stack.append(v); on.add(v)
        for w in nodes[v].imports:
            if w not in index:
                strong(w); low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop(); on.discard(w); comp.append(w)
                if w == v:
                    break
            if len(comp) > 1:
                out.append(sorted(comp))

    import sys
    old = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old, 5000))
    try:
        for v in sorted(nodes):
            if v not in index:
                strong(v)
    finally:
        sys.setrecursionlimit(old)
    return out[:limit]


def related(graph: dict, path: str, limit: int = 4) -> list[dict]:
    """Direct imports first, then direct importers. Each entry says why it is related."""
    by = {n["path"]: n for n in graph["nodes"]}
    n = by.get(path)
    if not n:
        return []
    out = [{"path": p, "relation": "imported by this file"} for p in n["imports"]]
    out += [{"path": p, "relation": "imports this file"} for p in n["imported_by"] if p not in n["imports"]]
    return out[:limit]
