"use client";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Button, Card, EmptyState, Label, Select, SeverityBadge, Spinner, Textarea } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { FileMeta, FileFull, Page, Project, ToolFinding, ToolStatus } from "@/types/api";

interface Result { language: string; findings: ToolFinding[]; tools: ToolStatus[] }

export default function SecurityPage() {
  const toast = useToast();
  const projects = useAsync(() => get<Page<Project>>("/projects?page_size=100"), []);
  const [pid, setPid] = useState("");
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [fid, setFid] = useState("");
  const [snippet, setSnippet] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [warnings, setWarnings] = useState<{ line: number; kind: string }[]>([]);

  async function pickProject(id: string) {
    setPid(id); setFid(""); setResult(null);
    setFiles(id ? await get<FileMeta[]>(`/projects/${id}/files`).catch((e) => { toast.error(e); return []; }) : []);
  }
  async function run() {
    setBusy(true); setResult(null); setWarnings([]);
    try {
      if (fid) {
        const f = await get<FileFull>(`/projects/${pid}/files/${fid}`);
        setWarnings(f.secret_warnings);
        setResult(await post<Result>("/analysis/static", { file_id: fid, security: true }));
      } else {
        setResult(await post<Result>("/analysis/static", { content: snippet, path: "snippet.py", security: true }));
      }
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <PageBody>
      <PageHeader title="Security analysis" description="Deterministic checks only: parsers, Ruff and Bandit (Python), plus a secret scan. For AI-assisted security review, run a Deep review in a workspace." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div><Label htmlFor="sp">Project</Label>
            <Select id="sp" value={pid} onChange={(e) => pickProject(e.target.value)}>
              <option value="">— paste a Python snippet instead —</option>
              {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select></div>
          {pid ? (
            <div><Label htmlFor="sf">File</Label>
              <Select id="sf" value={fid} onChange={(e) => setFid(e.target.value)}><option value="">Select a file…</option>{files.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}</Select></div>
          ) : (
            <div><Label htmlFor="sn">Python code</Label><Textarea id="sn" rows={10} className="font-mono text-xs" value={snippet} onChange={(e) => setSnippet(e.target.value)} placeholder="import os&#10;..." /></div>
          )}
          <Button onClick={run} loading={busy} disabled={pid ? !fid : !snippet.trim()}><ShieldAlert className="h-4 w-4" /> Run analysis</Button>
        </Card>
        <Card className="p-4">
          {busy ? <Spinner label="Analyzing" /> : !result ? <EmptyState title="No analysis yet" hint="Choose a file or paste code, then run the analysis." /> : (
            <div className="text-sm">
              <div className="mb-3 flex flex-wrap gap-1">{result.tools.map((t) => <Badge key={t.tool} tone={t.status === "ran" ? "ok" : "warn"} title={t.detail}>{t.tool}: {t.status}</Badge>)}</div>
              {warnings.length > 0 && <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/5 p-2"><p className="font-medium text-danger">Possible secrets detected</p><ul className="list-disc pl-5 text-xs">{warnings.map((w, i) => <li key={i}>{w.kind}{w.line ? ` (line ${w.line})` : ""}</li>)}</ul></div>}
              {result.findings.length === 0 ? <p className="text-muted-foreground">No findings from the tools that ran. This is not a guarantee of safety.</p> : (
                <ul className="space-y-2">{result.findings.map((f, i) => (
                  <li key={i} className="rounded border p-2"><div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><Badge tone="ok">{f.tool} {f.rule_id}</Badge><span className="text-xs">line {f.line ?? "?"}</span></div><p className="mt-1">{f.message}</p>{f.remediation && <p className="text-xs text-muted-foreground">{f.remediation}</p>}</li>))}</ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </PageBody>
  );
}
