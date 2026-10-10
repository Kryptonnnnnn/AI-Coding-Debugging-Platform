"use client";
import { Ban, Boxes, Check, Lock, ShieldAlert, Terminal } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ExecJob, SandboxStatus } from "@/types/api";

const LIMIT_LABEL: Record<string, string> = { timeout_seconds: "Timeout (s)", memory_mb: "Memory (MB)", cpus: "CPUs", pids: "Processes", max_output_bytes: "Max output (bytes)", network: "Network" };

const GUARANTEES = [
  "Runs in a separate, throw-away container, never inside the API process",
  "No network access, non-root user, read-only root filesystem",
  "CPU, memory, process-count and wall-clock limits; output size capped",
  "No secrets, Docker socket or host files are exposed to the code",
];

export default function SandboxPage() {
  const status = useAsync(() => get<SandboxStatus>("/sandbox/status"), []);
  const jobs = useAsync(() => get<ExecJob[]>("/executions"), []);
  if (status.loading) return <PageBody><Skeleton className="h-40" /></PageBody>;
  if (status.error || !status.data) return <ErrorState error={status.error ?? "No data"} retry={status.reload} />;
  const s = status.data;
  return (
    <PageBody>
      <PageHeader title="Sandbox & execution" description="Code is only ever executed inside an isolated container. Analysis, debugging and patching work without it."
        actions={<Button variant="outline" onClick={() => { status.reload(); jobs.reload(); }}>Re-check status</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start gap-3 p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.available ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>{s.available ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{s.available ? "Sandbox available" : "Code execution is disabled"}</h2><Badge tone={s.available ? "ok" : "warn"}>{s.available ? "enabled" : "disabled"}</Badge></div>
              {!s.available && (
                <div className="mt-1.5 space-y-2 text-[13px] text-muted-foreground">
                  <p>{s.reason}</p>
                  <p>This is intentional: when isolation isn&apos;t verified, the platform refuses to run code and never shows simulated results. Production hosting uses this safe default.</p>
                  <p className="flex items-start gap-1.5 rounded-md border bg-muted/30 p-2 text-xs"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /><span>Only enable execution on your own machine with the bundled Docker sandbox (see <code className="font-mono">sandbox/README.md</code>), or behind a separate, hardened execution service. Never on a shared or public server without strong isolation.</span></p>
                </div>
              )}
              {s.available && <p className="mt-1.5 text-[13px] text-muted-foreground">Provider: {s.provider}. Executions run with the limits shown on the right.</p>}
            </div>
          </div>
          <div className="border-t p-4">
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Isolation guarantees (when enabled)</h3>
            <ul className="space-y-1.5">{GUARANTEES.map((g) => <li key={g} className="flex items-start gap-2 text-[13px]"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{g}</li>)}</ul>
          </div>
        </Card>
        <Card className="self-start p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-medium"><Boxes className="h-3.5 w-3.5" /> Limits</h2>
          <dl className="space-y-2 text-xs">
            {Object.entries(s.limits).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{LIMIT_LABEL[k] ?? k.replace(/_/g, " ")}</dt><dd className="font-mono">{String(v)}</dd></div>)}
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Languages</dt><dd className="font-mono">{s.supported_languages.join(", ")}</dd></div>
          </dl>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 text-[13px] font-medium">Recent executions</h2>
      <Card className="overflow-hidden">
        {jobs.loading ? <ListSkeleton rows={2} /> : !jobs.data || jobs.data.length === 0 ? <EmptyState icon={<Terminal className="h-4 w-4" />} title="No executions" hint={s.available ? "Run a file from a project's Output tab." : "Nothing has been run. Execution is disabled."} /> : (
          <div className="divide-y">{jobs.data.map((j) => (
            <details key={j.id} className="px-3 py-2"><summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[13px]"><Badge tone={j.status === "completed" && j.result?.exit_code === 0 ? "ok" : j.status === "failed" ? "danger" : "warn"}>{j.status}</Badge><code className="font-mono text-xs">{j.file_path}</code><span className="text-xs text-muted-foreground">{j.kind}</span><span className="ml-auto text-2xs text-muted-foreground">{formatDate(j.created_at)}</span></summary>
              {j.result && <pre className="mt-2 max-h-60 overflow-auto rounded-md border bg-background p-2 font-mono text-xs">{`exit ${j.result.exit_code ?? "n/a"}${j.result.timed_out ? " (timed out)" : ""} · ${j.result.duration_ms} ms${j.result.truncated ? " · output truncated" : ""}\n${j.result.stdout}${j.result.stderr ? `\n[stderr]\n${j.result.stderr}` : ""}`}</pre>}
            </details>))}</div>
        )}
      </Card>
    </PageBody>
  );
}
