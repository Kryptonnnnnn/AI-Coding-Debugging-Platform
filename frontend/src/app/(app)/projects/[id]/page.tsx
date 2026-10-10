"use client";
import { Bot, Bug, ChevronDown, FlaskConical, History, PanelBottom, PanelLeft, PanelRight, Save, Search, SearchCheck, ShieldCheck, Terminal, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell-context";
import { Badge, Button, Dialog, ErrorState, Input, Select, Skeleton, Tabs, Tooltip, useConfirm } from "@/components/ui";
import { CodeEditor } from "@/editor/code-editor";
import { PatchReview } from "@/features/patch-review";
import { AnalysisPanel } from "@/features/workspace/analysis-panel";
import { ChatPanel } from "@/features/workspace/chat-panel";
import { DebugPanel } from "@/features/workspace/debug-panel";
import { FileTree } from "@/features/workspace/file-tree";
import { HistoryPanel } from "@/features/workspace/history-panel";
import { ReviewPanel } from "@/features/workspace/review-panel";
import { RunPanel } from "@/features/workspace/run-panel";
import { TestsPanel } from "@/features/workspace/tests-panel";
import type { AssistantTab, BottomTab, WorkspaceCtx } from "@/features/workspace/types";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { get, put } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn, formatBytes, LANGUAGES } from "@/lib/utils";
import type { FileFull, FileMeta, Patch, Project } from "@/types/api";

const ASSISTANT_TABS: { id: AssistantTab; label: string; icon: React.ReactNode }[] = [
  { id: "chat", label: "Assistant", icon: <Bot className="h-3.5 w-3.5" /> },
  { id: "debug", label: "Debug", icon: <Bug className="h-3.5 w-3.5" /> },
  { id: "review", label: "Review", icon: <SearchCheck className="h-3.5 w-3.5" /> },
  { id: "tests", label: "Tests", icon: <FlaskConical className="h-3.5 w-3.5" /> },
];
const BOTTOM_TABS: { id: BottomTab; label: string; icon: React.ReactNode }[] = [
  { id: "analysis", label: "Analysis", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
  { id: "output", label: "Output", icon: <Terminal className="h-3.5 w-3.5" /> },
];
const base = (p: string) => p.split("/").pop() ?? p;

function Splitter({ orientation, onDrag, label }: { orientation: "vertical" | "horizontal"; onDrag: (d: number) => void; label: string }) {
  const last = useRef(0);
  const v = orientation === "vertical";
  return (
    <div role="separator" aria-orientation={orientation} aria-label={label} tabIndex={0}
      className={cn("shrink-0 touch-none bg-border transition-colors hover:bg-primary/70 focus-visible:bg-primary", v ? "w-px cursor-col-resize px-[2px] -mx-[2px] bg-clip-content" : "h-px cursor-row-resize py-[2px] -my-[2px] bg-clip-content")}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = v ? e.clientX : e.clientY; document.body.style.userSelect = "none"; }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { const c = v ? e.clientX : e.clientY; onDrag(c - last.current); last.current = c; } }}
      onPointerUp={() => { document.body.style.userSelect = ""; }}
      onKeyDown={(e) => { const k = v ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]; if (e.key === k[0]) onDrag(-16); if (e.key === k[1]) onDrag(16); }} />
  );
}

export default function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const toast = useToast();
  const confirm = useConfirm();
  const { setCrumbs } = useShell();
  const desktop = useMediaQuery("(min-width: 900px)");

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [buffers, setBuffers] = useState<Record<string, FileFull>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const [patch, setPatch] = useState<Patch | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQ, setQuickQ] = useState("");
  const [highlightUpload, setHighlightUpload] = useState(false);

  const [aTab, setATab] = useLocalStorage<AssistantTab>("aicp.ws.atab", "chat");
  const [bTab, setBTab] = useLocalStorage<BottomTab>("aicp.ws.btab", "analysis");
  const [leftW, setLeftW] = useLocalStorage("aicp.ws.left", 248);
  const [rightW, setRightW] = useLocalStorage("aicp.ws.right", 440);
  const [bottomH, setBottomH] = useLocalStorage("aicp.ws.bottomH", 260);
  const [showLeft, setShowLeft] = useLocalStorage("aicp.ws.showLeft", true);
  const [showRight, setShowRight] = useLocalStorage("aicp.ws.showRight", true);
  const [showBottom, setShowBottom] = useLocalStorage("aicp.ws.showBottom", false);
  const [mobile, setMobile] = useState<"files" | "editor" | "assistant" | "output">("editor");

  const refs = useRef({ buffers, drafts, activeId });
  useEffect(() => { refs.current = { buffers, drafts, activeId }; });

  const file = activeId ? buffers[activeId] ?? null : null;
  const draft = file ? drafts[file.id] ?? file.content : "";
  const dirtyIds = useMemo(() => new Set(Object.keys(drafts).filter((id) => buffers[id] && drafts[id] !== buffers[id].content)), [drafts, buffers]);
  const dirty = !!file && dirtyIds.has(file.id);

  const loadFiles = useCallback(async () => { const fs = await get<FileMeta[]>(`/projects/${projectId}/files`); setFiles(fs); return fs; }, [projectId]);

  const openFile = useCallback(async (fid: string) => {
    try {
      if (!refs.current.buffers[fid]) {
        const f = await get<FileFull>(`/projects/${projectId}/files/${fid}`);
        setBuffers((b) => ({ ...b, [fid]: f }));
      }
      setOpenIds((ids) => (ids.includes(fid) ? ids : [...ids, fid]));
      setActiveId(fid); setSelection(""); setMobile("editor");
    } catch (e) { toast.error(e); }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dropTab = useCallback((fid: string) => {
    setOpenIds((ids) => {
      const next = ids.filter((i) => i !== fid);
      setActiveId((a) => (a === fid ? next[next.length - 1] ?? null : a));
      return next;
    });
    setDrafts((d) => { const n = { ...d }; delete n[fid]; return n; });
    setBuffers((b) => { const n = { ...b }; delete n[fid]; return n; });
  }, []);

  const closeTab = useCallback(async (fid: string) => {
    if (dirtyIds.has(fid) && !(await confirm({ title: "Discard unsaved changes?", tone: "danger", confirmLabel: "Discard", body: `${base(buffers[fid]?.path ?? "This file")} has changes that are not saved.` }))) return;
    dropTab(fid);
  }, [dirtyIds, buffers, confirm, dropTab]);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        setProject(await get<Project>(`/projects/${projectId}`));
        const fs = await loadFiles();
        const q = new URLSearchParams(window.location.search);
        const tab = q.get("tab");
        if (tab === "debug" || tab === "review" || tab === "tests") { setATab(tab); setShowRight(true); }
        if (q.get("focus") === "upload") setHighlightUpload(true);
        const code = fs.find((f) => ["python", "javascript", "typescript", "java", "c", "cpp", "go", "sql"].includes(f.language)) ?? fs[0];
        if (code) await openFile(code.id);
      } catch (e) { setError(e as Error); } finally { setLoading(false); }
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // breadcrumbs for the shell
  useEffect(() => {
    if (!project) return;
    setCrumbs([{ label: "Projects", href: "/projects" }, { label: project.name }, ...(file ? [{ label: file.path }] : [])]);
    return () => setCrumbs(null);
  }, [project, file?.path, setCrumbs]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = useCallback(async (): Promise<FileFull | null> => {
    const { buffers: b, drafts: d, activeId: a } = refs.current;
    const f = a ? b[a] : null;
    if (!f) return null;
    const text = d[f.id];
    if (text === undefined || text === f.content) return f;
    setSaving(true);
    try {
      const saved = await put<FileFull>(`/projects/${projectId}/files/${f.id}`, { content: text });
      setBuffers((x) => ({ ...x, [f.id]: saved }));
      setDrafts((x) => { const n = { ...x }; delete n[f.id]; return n; });
      refs.current = { ...refs.current, buffers: { ...refs.current.buffers, [f.id]: saved }, drafts: { ...refs.current.drafts, [f.id]: saved.content } };
      void loadFiles();
      return saved;
    } finally { setSaving(false); }
  }, [projectId, loadFiles]);

  const reloadActive = useCallback(async () => {
    const a = refs.current.activeId;
    if (!a) return;
    const fresh = await get<FileFull>(`/projects/${projectId}/files/${a}`);
    setBuffers((b) => ({ ...b, [a]: fresh }));
    setDrafts((d) => { const n = { ...d }; delete n[a]; return n; });
    await loadFiles();
  }, [projectId, loadFiles]);

  const openPatch = useCallback(async (pid: string) => {
    try { setPatch(await get<Patch>(`/patches/${pid}`)); } catch (e) { toast.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: Ctrl/Cmd+S save, +P quick open, +J toggle bottom panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); saveNow().then((f) => f && toast.ok("Saved")).catch(toast.error); }
      if (k === "p") { e.preventDefault(); setQuickQ(""); setQuickOpen(true); }
      if (k === "j") { e.preventDefault(); setShowBottom((s) => !s); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow, setShowBottom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyIds.size) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds]);

  if (loading) return <div className="space-y-2 p-4"><Skeleton className="h-9" /><Skeleton className="h-[60vh]" /></div>;
  if (error || !project) return <ErrorState error={error ?? "Project not found"} />;

  const ctx: WorkspaceCtx = {
    projectId, files, file, draft, selection, saveNow, reloadActive,
    openFile: (i) => void openFile(i), openPatch: (i) => void openPatch(i),
    refresh: async () => { await loadFiles(); },
    showAssistant: (t) => { setATab(t); setShowRight(true); setMobile("assistant"); },
    showBottom: (t) => { setBTab(t); setShowBottom(true); setMobile("output"); },
  };

  const explorer = (
    <FileTree projectId={projectId} files={files} activeId={activeId} highlightUpload={highlightUpload && files.length === 0} onOpen={(i) => void openFile(i)}
      onChanged={async (o) => {
        const fs = await loadFiles();
        const alive = new Set(fs.map((f) => f.id));
        if (o?.deletedId) dropTab(o.deletedId);
        for (const id of openIds) if (!alive.has(id)) dropTab(id);
        if (o?.openId) { await openFile(o.openId); return; }
        // refresh clean buffers (rename/upload may have changed them); never clobber unsaved edits
        for (const id of openIds) {
          if (alive.has(id) && !dirtyIds.has(id)) {
            const fresh = await get<FileFull>(`/projects/${projectId}/files/${id}`).catch(() => null);
            if (fresh) setBuffers((b) => ({ ...b, [id]: fresh }));
          }
        }
        if (!refs.current.activeId && fs[0]) await openFile(fs[0].id);
      }} />
  );

  const tabsBar = (
    <div role="tablist" aria-label="Open files" className="flex h-9 shrink-0 items-end gap-px overflow-x-auto border-b bg-card/60 px-1">
      {openIds.map((id) => {
        const f = buffers[id];
        if (!f) return null;
        const active = id === activeId;
        return (
          <div key={id} role="presentation" className={cn("group flex h-8 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 pl-2.5 pr-1 text-[13px]", active ? "bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60")}>
            <button role="tab" aria-selected={active} title={f.path} onClick={() => { setActiveId(id); setSelection(""); }} className="flex items-center gap-1.5">
              {base(f.path)}
              {dirtyIds.has(id) && <span className="h-1.5 w-1.5 rounded-full bg-warn" role="img" aria-label="unsaved changes" />}
            </button>
            <button aria-label={`Close ${base(f.path)}`} onClick={() => void closeTab(id)} className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"><X className="h-3 w-3" /></button>
          </div>
        );
      })}
    </div>
  );

  const editorPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {openIds.length > 0 && tabsBar}
      {file && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
          <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">{file.path}</span>
          {file.secret_warnings.length > 0 && <Badge tone="danger" title={file.secret_warnings.map((w) => w.kind).join(", ")}>⚠ possible secrets</Badge>}
          <div className="ml-auto flex items-center gap-1.5">
            <Select aria-label="Language" className="h-7 w-32" value={file.language}
              onChange={async (e) => { try { const f = await put<FileFull>(`/projects/${projectId}/files/${file.id}`, { language: e.target.value }); setBuffers((b) => ({ ...b, [file.id]: { ...f, content: b[file.id].content } })); void loadFiles(); } catch (err) { toast.error(err); } }}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </Select>
            <Tooltip label="Save" shortcut="Ctrl S"><Button size="sm" onClick={() => saveNow().then((f) => f && toast.ok("Saved")).catch(toast.error)} disabled={!dirty} loading={saving}><Save className="h-3.5 w-3.5" /> Save</Button></Tooltip>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {file ? (
          <CodeEditor path={file.path} value={draft} language={file.language} onChange={(v) => setDrafts((d) => ({ ...d, [file.id]: v }))} onSelection={setSelection} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-[13px] text-muted-foreground">
            <p className="font-medium text-foreground">{files.length ? "Select a file to start" : "This project is empty"}</p>
            <p className="max-w-xs text-xs">{files.length ? "Choose a file in the explorer, or press Ctrl P to search." : "Create a file with the + button, or upload source files or a ZIP, then paste or edit code here."}</p>
          </div>
        )}
      </div>
    </div>
  );

  const assistantPane = (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs label="Assistant" tabs={ASSISTANT_TABS} value={aTab} onChange={setATab} />
      <div className="min-h-0 flex-1">
        {aTab === "chat" && <ChatPanel ctx={ctx} />}
        {aTab === "debug" && <DebugPanel ctx={ctx} />}
        {aTab === "review" && <ReviewPanel ctx={ctx} />}
        {aTab === "tests" && <TestsPanel ctx={ctx} />}
      </div>
    </div>
  );

  const bottomPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1"><Tabs label="Diagnostics" tabs={BOTTOM_TABS} value={bTab} onChange={setBTab} /></div>
        {desktop && <Tooltip label="Hide panel" shortcut="Ctrl J" side="top"><button aria-label="Hide bottom panel" onClick={() => setShowBottom(false)} className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted"><ChevronDown className="h-3.5 w-3.5" /></button></Tooltip>}
      </div>
      <div className="min-h-0 flex-1">
        {bTab === "analysis" && <AnalysisPanel ctx={ctx} />}
        {bTab === "history" && <HistoryPanel ctx={ctx} />}
        {bTab === "output" && <RunPanel ctx={ctx} />}
      </div>
    </div>
  );

  const toggle = (label: string, on: boolean, set: (v: boolean) => void, icon: React.ReactNode, shortcut?: string) => (
    <Tooltip label={`${on ? "Hide" : "Show"} ${label}`} shortcut={shortcut}>
      <button aria-label={`${on ? "Hide" : "Show"} ${label}`} aria-pressed={on} onClick={() => set(!on)} className={cn("inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted", on ? "text-foreground" : "text-muted-foreground")}>{icon}</button>
    </Tooltip>
  );

  const quickList = files.filter((f) => f.path.toLowerCase().includes(quickQ.toLowerCase())).slice(0, 12);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-card/40 px-2">
        {desktop && <>
          {toggle("explorer", showLeft, setShowLeft, <PanelLeft className="h-3.5 w-3.5" />)}
          {toggle("bottom panel", showBottom, setShowBottom, <PanelBottom className="h-3.5 w-3.5" />, "Ctrl J")}
          {toggle("assistant", showRight, setShowRight, <PanelRight className="h-3.5 w-3.5" />)}
        </>}
        <Tooltip label="Quick open file" shortcut="Ctrl P"><button onClick={() => { setQuickQ(""); setQuickOpen(true); }} aria-label="Quick open file" className="ml-1 flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs text-muted-foreground hover:bg-muted"><Search className="h-3 w-3" /> Open file</button></Tooltip>
        {!desktop && (
          <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Workspace section">
            {(["files", "editor", "assistant", "output"] as const).map((m) => (
              <button key={m} aria-pressed={mobile === m} onClick={() => setMobile(m)} className={cn("rounded px-2 py-0.5 text-2xs capitalize", mobile === m ? "bg-muted font-medium" : "text-muted-foreground")}>{m}</button>
            ))}
          </div>
        )}
      </div>

      {desktop === undefined ? <Skeleton className="m-3 flex-1" /> : desktop ? (
        <div className="flex min-h-0 flex-1">
          {showLeft && <><div style={{ width: leftW }} className="shrink-0 bg-card/30">{explorer}</div><Splitter orientation="vertical" label="Resize file explorer" onDrag={(d) => setLeftW((w) => Math.min(520, Math.max(170, w + d)))} /></>}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">{editorPane}</div>
            {showBottom && <><Splitter orientation="horizontal" label="Resize bottom panel" onDrag={(d) => setBottomH((h) => Math.min(560, Math.max(120, h - d)))} /><div style={{ height: bottomH }} className="shrink-0 bg-card/30">{bottomPane}</div></>}
          </div>
          {showRight && <><Splitter orientation="vertical" label="Resize assistant panel" onDrag={(d) => setRightW((w) => Math.min(780, Math.max(320, w - d)))} /><div style={{ width: rightW }} className="shrink-0 bg-card/30">{assistantPane}</div></>}
        </div>
      ) : (
        <div className="min-h-0 flex-1">{mobile === "files" ? explorer : mobile === "assistant" ? assistantPane : mobile === "output" ? bottomPane : editorPane}</div>
      )}

      <div className="flex h-6 shrink-0 items-center gap-3 border-t bg-card px-3 text-2xs text-muted-foreground" role="status">
        <span className={cn("flex items-center gap-1", dirty && "text-warn")}><span className={cn("h-1.5 w-1.5 rounded-full", saving ? "animate-pulse bg-primary" : dirty ? "bg-warn" : "bg-ok")} />{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
        {file && <><span>{file.language}</span><span>{formatBytes(new Blob([draft]).size)}</span></>}
        <span className="ml-auto hidden sm:inline">{files.length} file{files.length === 1 ? "" : "s"} · Ctrl P open · Ctrl S save · Ctrl J panel</span>
      </div>

      <Dialog open={quickOpen} onClose={() => setQuickOpen(false)} title="Open file">
        <Input aria-label="Search files" autoFocus placeholder="Type a file name…" value={quickQ} onChange={(e) => setQuickQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && quickList[0]) { setQuickOpen(false); void openFile(quickList[0].id); } }} />
        <ul className="mt-2 max-h-72 overflow-auto">
          {quickList.map((f) => <li key={f.id}><button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-xs hover:bg-muted" onClick={() => { setQuickOpen(false); void openFile(f.id); }}>{f.path}<span className="text-2xs text-muted-foreground">{f.language}</span></button></li>)}
          {quickList.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">No matching files.</li>}
        </ul>
      </Dialog>
      <Dialog open={!!patch} onClose={() => setPatch(null)} title="Review proposed change" description="Review the exact lines that would change. Nothing is applied until you confirm." wide>
        {patch && <div className="h-[65vh]"><PatchReview patch={patch} language={file?.language ?? "text"} path={buffers[patch.file_id]?.path} onResolved={async () => { await reloadActive(); }} /></div>}
      </Dialog>
    </div>
  );
}
