"use client";
import { ChevronDown, ChevronRight, FilePlus2, FileText, Folder, Pencil, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, Dialog, Input, Label } from "@/components/ui";
import { api, del, get, put, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn, formatBytes } from "@/lib/utils";
import type { FileMeta, UploadResult } from "@/types/api";

interface Node { name: string; path: string; file?: FileMeta; children: Map<string, Node> }

function build(files: FileMeta[]): Node {
  const root: Node = { name: "", path: "", children: new Map() };
  for (const f of files) {
    let cur = root;
    const parts = f.path.split("/");
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!cur.children.has(p)) cur.children.set(p, { name: p, path, children: new Map() });
      cur = cur.children.get(p)!;
      if (i === parts.length - 1) cur.file = f;
    });
  }
  return root;
}

function Row({ node, depth, activeId, onOpen, collapsed, toggle }: { node: Node; depth: number; activeId: string | null; onOpen: (id: string) => void; collapsed: Set<string>; toggle: (p: string) => void }) {
  const items = [...node.children.values()].sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
  return (
    <ul role={depth === 0 ? "tree" : "group"}>
      {items.map((n) => {
        const isFile = !!n.file && n.children.size === 0;
        const open = !collapsed.has(n.path);
        return (
          <li key={n.path} role="treeitem" aria-expanded={isFile ? undefined : open} aria-selected={isFile ? n.file!.id === activeId : undefined}>
            <button
              className={cn("flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-muted", isFile && n.file!.id === activeId && "bg-primary/10 font-medium text-primary")}
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => (isFile ? onOpen(n.file!.id) : toggle(n.path))}
              title={n.path}
            >
              {isFile ? <FileText className="h-3.5 w-3.5 shrink-0" /> : open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {!isFile && <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{n.name}</span>
            </button>
            {!isFile && open && <Row node={n} depth={depth + 1} activeId={activeId} onOpen={onOpen} collapsed={collapsed} toggle={toggle} />}
          </li>
        );
      })}
    </ul>
  );
}

export function FileTree({ projectId, files, activeId, onOpen, onChanged }: { projectId: string; files: FileMeta[]; activeId: string | null; onOpen: (id: string) => void; onChanged: (opts?: { deletedId?: string; openId?: string }) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ file_id: string; path: string; line: number; text: string }[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"new" | "rename" | null>(null);
  const [path, setPath] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())), [files, q]);
  const tree = useMemo(() => build(filtered), [filtered]);
  const active = files.find((f) => f.id === activeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (dialog === "new") {
        const f = await post<{ id: string }>(`/projects/${projectId}/files`, { path: path.trim(), content: "" });
        onChanged({ openId: f.id });
      } else if (active) {
        await put(`/projects/${projectId}/files/${active.id}`, { path: path.trim() });
        onChanged();
      }
      setDialog(null);
    } catch (err) { toast.error(err); }
  }
  async function remove() {
    if (!active || !window.confirm(`Delete ${active.path}? Its version history is deleted too.`)) return;
    try { await del(`/projects/${projectId}/files/${active.id}`); toast.ok("File deleted"); onChanged({ deletedId: active.id }); } catch (e) { toast.error(e); }
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const form = new FormData();
    Array.from(list).forEach((f) => form.append("files", f));
    try {
      const r = await api<UploadResult>(`/projects/${projectId}/upload`, { form });
      toast.ok(`Uploaded: ${r.created.length} new, ${r.updated.length} updated${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0].reason})` : ""}`);
      onChanged();
    } catch (e) { toast.error(e); }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function searchContent() {
    if (q.trim().length < 2) return;
    try { setHits(await get(`/projects/${projectId}/search?q=${encodeURIComponent(q.trim())}`)); } catch (e) { toast.error(e); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button size="icon" variant="ghost" aria-label="New file" title="New file" onClick={() => { setPath(""); setDialog("new"); }}><FilePlus2 className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Upload files or ZIP" title="Upload files or ZIP" onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Rename file" title="Rename file" disabled={!active} onClick={() => { setPath(active!.path); setDialog("rename"); }}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Delete file" title="Delete file" disabled={!active} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        <input ref={fileInput} type="file" multiple className="hidden" aria-label="Upload input" accept=".zip,.py,.js,.jsx,.ts,.tsx,.java,.c,.h,.cpp,.cc,.hpp,.go,.sql,.json,.md,.txt,.yml,.yaml,.html,.css,.sh,.toml" onChange={(e) => upload(e.target.files)} />
      </div>
      <div className="flex gap-1 border-b p-2">
        <Input aria-label="Filter files" placeholder="Filter files…" value={q} onChange={(e) => { setQ(e.target.value); setHits(null); }} onKeyDown={(e) => e.key === "Enter" && searchContent()} className="h-8" />
        <Button size="icon" variant="outline" aria-label="Search inside files" title="Search inside files (Enter)" onClick={searchContent} disabled={q.trim().length < 2}><Search className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {hits ? (
          <div>
            <button className="mb-1 text-xs text-primary underline" onClick={() => setHits(null)}>← back to files</button>
            {hits.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No matches.</p> : hits.map((h, i) => (
              <button key={i} className="block w-full rounded p-1.5 text-left text-xs hover:bg-muted" onClick={() => onOpen(h.file_id)}><span className="font-medium">{h.path}:{h.line}</span><br /><span className="text-muted-foreground">{h.text}</span></button>
            ))}
          </div>
        ) : files.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No files yet. Create one, or upload source files or a ZIP.</p>
        ) : filtered.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No files match.</p> : (
          <Row node={tree} depth={0} activeId={activeId} onOpen={onOpen} collapsed={collapsed} toggle={(p) => setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; })} />
        )}
      </div>
      {active && <p className="border-t p-2 text-xs text-muted-foreground">{active.language} · {formatBytes(active.size_bytes)}</p>}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={dialog === "new" ? "New file" : "Rename file"}>
        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="fpath">Path (e.g. src/app.py)</Label><Input id="fpath" required autoFocus value={path} onChange={(e) => setPath(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit">{dialog === "new" ? "Create" : "Rename"}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
