"use client";
import { Bot, Bug, FlaskConical, History, PanelLeft, PanelRight, Play, Save, SearchCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Dialog, ErrorState, Select, Spinner, Tabs } from "@/components/ui";
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
import type { WorkspaceCtx } from "@/features/workspace/types";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { get, put } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { LANGUAGES } from "@/lib/utils";
import type { FileFull, FileMeta, Patch, Project } from "@/types/api";

type Tab = "chat" | "debug" | "review" | "tests" | "analysis" | "history" | "run";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "chat", label: "Chat", icon: <Bot className="h-3.5 w-3.5" /> },
  { id: "debug", label: "Debug", icon: <Bug className="h-3.5 w-3.5" /> },
  { id: "review", label: "Review", icon: <SearchCheck className="h-3.5 w-3.5" /> },
  { id: "tests", label: "Tests", icon: <FlaskConical className="h-3.5 w-3.5" /> },
  { id: "analysis", label: "Analysis", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
  { id: "run", label: "Run", icon: <Play className="h-3.5 w-3.5" /> },
];

function Splitter({ onDrag, label }: { onDrag: (dx: number) => void; label: string }) {
  const down = useRef(false);
  useEffect(() => {
    let last = 0;
    const move = (e: PointerEvent) => { if (down.current) { onDrag(e.clientX - last); last = e.clientX; } };
    const up = () => { down.current = false; document.body.style.userSelect = ""; };
    const start = (e: PointerEvent) => { last = e.clientX; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointerdown", start, true);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointerdown", start, true); };
  }, [onDrag]);
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary"
      onPointerDown={() => { down.current = true; document.body.style.userSelect = "none"; }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") onDrag(-16); if (e.key === "ArrowRight") onDrag(16); }} />
  );
}

export default function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<FileFull | null>(null);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useLocalStorage<Tab>("aicp.ws.tab", "chat");
  const [leftW, setLeftW] = useLocalStorage("aicp.ws.left", 240);
  const [rightW, setRightW] = useLocalStorage("aicp.ws.right", 420);
  const [mobile, setMobile] = useState<"files" | "editor" | "assist">("editor");
  const [patch, setPatch] = useState<Patch | null>(null);
  const desktop = useMediaQuery("(min-width: 768px)");
  const draftRef = useRef(draft);
  const fileRef = useRef(file);
  useEffect(() => { draftRef.current = draft; fileRef.current = file; });

  const dirty = !!file && draft !== file.content;

  const loadFiles = useCallback(async () => setFiles(await get<FileMeta[]>(`/projects/${projectId}/files`)), [projectId]);
  const openFile = useCallback(async (fid: string) => {
    try {
      if (fileRef.current && draftRef.current !== fileRef.current.content && !window.confirm("You have unsaved changes in this file. Discard them?")) return;
      const f = await get<FileFull>(`/projects/${projectId}/files/${fid}`);
      setFile(f); setDraft(f.content); setSelection(""); setMobile("editor");
    } catch (e) { toast.error(e); }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        setProject(await get<Project>(`/projects/${projectId}`));
        const fs = await get<FileMeta[]>(`/projects/${projectId}/files`);
        setFiles(fs);
        if (fs[0]) { const f = await get<FileFull>(`/projects/${projectId}/files/${fs[0].id}`); setFile(f); setDraft(f.content); }
      } catch (e) { setError(e as Error); } finally { setLoading(false); }
    })();
  }, [projectId]);

  const saveNow = useCallback(async (): Promise<FileFull | null> => {
    const f = fileRef.current;
    if (!f) return null;
    if (draftRef.current === f.content) return f;
    setSaving(true);
    try {
      const saved = await put<FileFull>(`/projects/${projectId}/files/${f.id}`, { content: draftRef.current });
      setFile(saved); fileRef.current = saved;
      void loadFiles();
      return saved;
    } finally { setSaving(false); }
  }, [projectId, loadFiles]);

  const reloadActive = useCallback(async () => {
    const f = fileRef.current;
    if (!f) return;
    const fresh = await get<FileFull>(`/projects/${projectId}/files/${f.id}`);
    setFile(fresh); setDraft(fresh.content); await loadFiles();
  }, [projectId, loadFiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveNow().then(() => toast.ok("Saved")).catch(toast.error); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const openPatch = useCallback(async (pid: string) => {
    try { setPatch(await get<Patch>(`/patches/${pid}`)); } catch (e) { toast.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;
  if (error || !project) return <ErrorState error={error ?? "Project not found"} />;

  const ctx: WorkspaceCtx = {
    projectId, files, file, draft, selection, saveNow, openFile: (i) => void openFile(i), openPatch: (i) => void openPatch(i), reloadActive,
    refresh: async () => { await loadFiles(); },
  };

  const explorer = (
    <FileTree projectId={projectId} files={files} activeId={file?.id ?? null} onOpen={(i) => void openFile(i)}
      onChanged={async (o) => {
        await loadFiles();
        if (o?.deletedId && file?.id === o.deletedId) { setFile(null); setDraft(""); }
        else if (o?.openId) await openFile(o.openId);
        else if (file) await reloadActive();
      }} />
  );

  const editor = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <span className="min-w-0 truncate text-sm font-medium">{file ? file.path : "No file open"}</span>
        {dirty && <Badge tone="warn">unsaved</Badge>}
        {file && file.secret_warnings.length > 0 && <Badge tone="danger" title={file.secret_warnings.map((w) => w.kind).join(", ")}>⚠ possible secrets</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Select aria-label="Language" className="h-8 w-32" value={file?.language ?? "text"} disabled={!file}
            onChange={async (e) => { if (!file) return; try { const f = await put<FileFull>(`/projects/${projectId}/files/${file.id}`, { language: e.target.value }); setFile({ ...f, content: file.content }); void loadFiles(); } catch (err) { toast.error(err); } }}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </Select>
          <Button size="sm" onClick={() => saveNow().then(() => toast.ok("Saved")).catch(toast.error)} disabled={!dirty} loading={saving}><Save className="h-3.5 w-3.5" /> Save</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {file ? (
          <CodeEditor path={file.path} value={draft} language={file.language} onChange={setDraft} onSelection={setSelection} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{files.length ? "Select a file to start" : "This project is empty"}</p>
            <p>{files.length ? "Choose a file in the explorer." : "Create a file with the + button, or upload source files or a ZIP, then paste or edit code here."}</p>
          </div>
        )}
      </div>
    </div>
  );

  const assistant = (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === "chat" && <ChatPanel ctx={ctx} />}
        {tab === "debug" && <DebugPanel ctx={ctx} />}
        {tab === "review" && <ReviewPanel ctx={ctx} />}
        {tab === "tests" && <TestsPanel ctx={ctx} />}
        {tab === "analysis" && <AnalysisPanel ctx={ctx} />}
        {tab === "history" && <HistoryPanel ctx={ctx} />}
        {tab === "run" && <RunPanel ctx={ctx} />}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-sm">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">Projects</Link><span className="text-muted-foreground">/</span>
        <span className="font-medium">{project.name}</span>
        <div className="ml-auto flex gap-1 md:hidden" role="group" aria-label="Workspace section">
          <Button size="icon" variant={mobile === "files" ? "primary" : "outline"} aria-label="Show files" onClick={() => setMobile("files")}><PanelLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant={mobile === "editor" ? "primary" : "outline"} onClick={() => setMobile("editor")}>Editor</Button>
          <Button size="icon" variant={mobile === "assist" ? "primary" : "outline"} aria-label="Show assistant" onClick={() => setMobile("assist")}><PanelRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {desktop === undefined ? <Spinner /> : desktop ? (
        <div className="flex min-h-0 flex-1">
          <div style={{ width: leftW }} className="shrink-0 border-r">{explorer}</div>
          <Splitter label="Resize file explorer" onDrag={(dx) => setLeftW((w) => Math.min(480, Math.max(160, w + dx)))} />
          <div className="min-w-0 flex-1">{editor}</div>
          <Splitter label="Resize assistant panel" onDrag={(dx) => setRightW((w) => Math.min(760, Math.max(300, w - dx)))} />
          <div style={{ width: rightW }} className="shrink-0 border-l">{assistant}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{mobile === "files" ? explorer : mobile === "assist" ? assistant : editor}</div>
      )}

      <Dialog open={!!patch} onClose={() => setPatch(null)} title="Review proposed change" wide>
        {patch && <div className="h-[65vh]"><PatchReview patch={patch} language={file?.language ?? "text"} onResolved={async () => { await reloadActive(); }} /></div>}
      </Dialog>
    </div>
  );
}
