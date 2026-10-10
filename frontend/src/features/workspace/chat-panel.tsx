"use client";
import { Plus, Search, Send, Trash2, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Badge, Button, EmptyState, Select, Spinner, Textarea } from "@/components/ui";
import { ApiError, del, get, patch, post, streamPost } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ContextSummary, Conversation, Message, Page, Patch } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function ChatPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [cid, setCid] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useSelection, setUseSelection] = useState(false);
  const [preview, setPreview] = useState<ContextSummary | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const loadConvs = useCallback(async () => {
    try { setConvs((await get<Page<Conversation>>(`/conversations?project_id=${ctx.projectId}&q=${encodeURIComponent(q)}`)).items); } catch (e) { toast.error(e); }
  }, [ctx.projectId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadConvs(); }, [loadConvs]);

  // The active file is pre-selected as context, but the user stays in control.
  useEffect(() => { if (ctx.file) setSelected((s) => (s.size === 0 ? new Set([ctx.file!.id]) : s)); }, [ctx.file?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected.size === 0) { setPreview(null); return; }
    post<ContextSummary>(`/projects/${ctx.projectId}/context-preview`, { file_ids: [...selected] }).then(setPreview).catch(() => setPreview(null));
  }, [selected, ctx.projectId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages, streaming]);

  async function openConv(id: string) {
    setCid(id); setLoadingMsgs(true);
    try { setMessages(await get<Message[]>(`/conversations/${id}/messages`)); } catch (e) { toast.error(e); } finally { setLoadingMsgs(false); }
  }
  async function newConv() { setCid(""); setMessages([]); }
  async function rename() {
    const title = window.prompt("Rename conversation", convs.find((c) => c.id === cid)?.title);
    if (!title?.trim()) return;
    try { await patch(`/conversations/${cid}`, { title: title.trim() }); void loadConvs(); } catch (e) { toast.error(e); }
  }
  async function remove() {
    if (!window.confirm("Delete this conversation?")) return;
    try { await del(`/conversations/${cid}`); await newConv(); void loadConvs(); } catch (e) { toast.error(e); }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true); setInput(""); setStreaming("");
    let id = cid;
    try {
      await ctx.saveNow();
      if (!id) {
        const c = await post<Conversation>("/conversations", { project_id: ctx.projectId, title: text.slice(0, 60) });
        id = c.id; setCid(id);
      }
      setMessages((m) => [...m, { id: "tmp", role: "user", content: text, context_files: [], created_at: new Date().toISOString() }]);
      abort.current = new AbortController();
      let acc = "";
      await streamPost(`/conversations/${id}/stream`, { content: text, file_ids: [...selected], selection: useSelection && ctx.selection ? ctx.selection : null }, (ev, data) => {
        if (ev === "token") { acc += data as string; setStreaming(acc); }
        if (ev === "error") { const d = data as { message: string }; toast.error(new Error(d.message)); }
      }, abort.current.signal);
      await openConv(id);
      void loadConvs();
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(e instanceof ApiError ? e : new Error("The request failed"));
      if (id) await openConv(id).catch(() => {});
    } finally { setStreaming(""); setBusy(false); }
  }

  async function proposeChange(code: string) {
    if (!ctx.file) { toast.error(new Error("Open a file first.")); return; }
    const sel = useSelection ? ctx.selection : "";
    const proposed = sel && ctx.draft.includes(sel) ? ctx.draft.replace(sel, code) : code;
    try {
      await ctx.saveNow();
      const p = await post<Patch>("/patches", { file_id: ctx.file.id, title: "Chat suggestion", explanation: "Proposed from the assistant chat. Review the diff before applying.", proposed_content: proposed });
      ctx.openPatch(p.id);
    } catch (e) { toast.error(e); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        <Select aria-label="Conversation" value={cid} onChange={(e) => (e.target.value ? openConv(e.target.value) : newConv())} className="h-8 flex-1">
          <option value="">New conversation</option>
          {convs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Button size="icon" variant="ghost" aria-label="New conversation" onClick={newConv}><Plus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Rename conversation" disabled={!cid} onClick={rename}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Delete conversation" disabled={!cid} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center gap-1 border-b px-2 py-1"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input aria-label="Search conversations" placeholder="Search conversations…" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 flex-1 bg-transparent text-xs outline-none" /></div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {loadingMsgs ? <Spinner /> : messages.length === 0 && !streaming ? (
          <EmptyState title="Ask about your code" hint="Choose which files to share below. Only those files (and your selection, if enabled) are sent to the AI provider." />
        ) : messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-6 rounded-lg bg-primary/10 p-2.5" : "mr-2"}>
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">{m.role === "user" ? "You" : "Assistant"}</p>
            {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.content}</p> : <Markdown onInsertCode={proposeChange}>{m.content}</Markdown>}
            {m.role === "user" && m.context_files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Context sent: {m.context_files.map((f) => f.path).join(", ")}</p>}
          </div>
        ))}
        {streaming && <div className="mr-2"><p className="mb-0.5 text-xs font-medium text-muted-foreground">Assistant</p><Markdown>{streaming}</Markdown></div>}
        <div ref={bottom} />
      </div>
      <div className="space-y-2 border-t p-2">
        <details className="rounded-md border p-2 text-xs">
          <summary className="cursor-pointer font-medium">Context to send: {selected.size} file(s){useSelection && ctx.selection ? " + selection" : ""}{preview ? ` · ${preview.total_chars.toLocaleString()} chars` : ""}</summary>
          <div className="mt-2 max-h-28 space-y-1 overflow-auto">
            {ctx.files.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5"><input type="checkbox" checked={selected.has(f.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} /><span className="truncate">{f.path}</span></label>
            ))}
            {ctx.files.length === 0 && <p className="text-muted-foreground">No files in this project. The assistant will answer without code context.</p>}
          </div>
          <label className="mt-2 flex items-center gap-1.5"><input type="checkbox" checked={useSelection} disabled={!ctx.selection} onChange={(e) => setUseSelection(e.target.checked)} /> Include editor selection{ctx.selection ? ` (${ctx.selection.length} chars)` : " (select text in the editor)"}</label>
          {preview?.secret_warnings.length ? <p role="alert" className="mt-2 text-danger">⚠ {preview.secret_warnings.length} possible secret(s) in selected files will be redacted before sending.</p> : null}
          {preview?.files.some((f) => f.truncated) && <p className="mt-1 text-warn">Some files are truncated to fit the context limit.</p>}
          <p className="mt-1 text-muted-foreground">The project file list (names only) is always included for context.</p>
        </details>
        <div className="flex gap-2">
          <Textarea aria-label="Message" rows={2} value={input} placeholder="Ask about this code…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          <Button aria-label="Send message" onClick={send} loading={busy} disabled={!input.trim()}><Send className="h-4 w-4" /></Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Ctrl/⌘+Enter to send. <Badge>AI answers may be wrong</Badge></p>
      </div>
    </div>
  );
}
