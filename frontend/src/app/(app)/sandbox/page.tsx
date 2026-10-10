"use client";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ExecJob, SandboxStatus } from "@/types/api";

export default function SandboxPage() {
  const status = useAsync(() => get<SandboxStatus>("/sandbox/status"), []);
  const jobs = useAsync(() => get<ExecJob[]>("/executions"), []);
  if (status.loading) return <Spinner />;
  if (status.error || !status.data) return <ErrorState error={status.error ?? "No data"} retry={status.reload} />;
  const s = status.data;
  return (
    <PageBody>
      <PageHeader title="Sandbox & execution" description="Code never runs in the API process. Execution happens only in an isolated Docker container, if you enable it."
        actions={<Button variant="outline" onClick={() => { status.reload(); jobs.reload(); }}>Re-check</Button>} />
      <Card className="mb-4 p-4">
        <div className="flex items-center gap-2"><Badge tone={s.available ? "ok" : "warn"}>{s.available ? "Available" : "Disabled"}</Badge><span className="text-sm">provider: {s.provider}</span></div>
        {!s.available && <p className="mt-2 text-sm text-muted-foreground">{s.reason} Execution fails closed: no results are ever simulated. See <code>sandbox/README.md</code> to enable it locally.</p>}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {Object.entries(s.limits).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd className="font-medium">{String(v)}</dd></div>)}
          <div><dt className="text-muted-foreground">languages</dt><dd className="font-medium">{s.supported_languages.join(", ")}</dd></div>
        </dl>
      </Card>
      <h2 className="mb-2 font-medium">Recent executions</h2>
      {jobs.loading ? <Spinner /> : !jobs.data || jobs.data.length === 0 ? <Card><EmptyState title="No executions" hint="Run a file from a project workspace once the sandbox is available." /></Card> : (
        <Card className="divide-y">{jobs.data.map((j) => (
          <details key={j.id} className="p-3"><summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"><Badge tone={j.status === "completed" && j.result?.exit_code === 0 ? "ok" : j.status === "failed" ? "danger" : "warn"}>{j.status}</Badge><code>{j.file_path}</code><span>{j.kind}</span><span className="text-xs text-muted-foreground">{formatDate(j.created_at)}</span></summary>
            {j.result && <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 text-xs">{`exit ${j.result.exit_code ?? "n/a"}${j.result.timed_out ? " (timed out)" : ""} · ${j.result.duration_ms} ms${j.result.truncated ? " · output truncated" : ""}\n${j.result.stdout}${j.result.stderr ? `\n[stderr]\n${j.result.stderr}` : ""}`}</pre>}
          </details>))}</Card>
      )}
    </PageBody>
  );
}
