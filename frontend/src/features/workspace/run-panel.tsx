"use client";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Select, Spinner } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ExecJob, SandboxStatus } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function RunPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [kind, setKind] = useState<"run" | "test">("run");
  const [job, setJob] = useState<ExecJob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { get<SandboxStatus>("/sandbox/status").then(setStatus).catch(toast.error); return () => { if (timer.current) clearInterval(timer.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!ctx.file) return;
    try {
      const f = await ctx.saveNow();
      let j = await post<ExecJob>(`/projects/${ctx.projectId}/executions`, { file_id: (f ?? ctx.file).id, kind });
      setJob(j);
      timer.current = setInterval(async () => {
        j = await get<ExecJob>(`/executions/${j.id}`);
        setJob(j);
        if (j.status === "completed" || j.status === "failed") { if (timer.current) clearInterval(timer.current); }
      }, 1000);
    } catch (e) { toast.error(e); }
  }

  if (!status) return <Spinner />;
  if (!status.available) {
    return (
      <div className="p-3 text-sm">
        <EmptyState title="Execution is disabled" hint={`${status.reason} Code is never run in the API process, and no results are simulated. Static analysis, debugging and patching still work.`} />
        <p className="text-center text-xs text-muted-foreground">See sandbox/README.md to enable the local Docker sandbox.</p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-3 text-sm">
      <div className="flex gap-2">
        <Select aria-label="Execution kind" className="w-36" value={kind} onChange={(e) => setKind(e.target.value as "run" | "test")}><option value="run">Run file</option><option value="test">Run pytest</option></Select>
        <Button className="flex-1" onClick={run} disabled={!ctx.file || !status.supported_languages.includes(ctx.file.language)}><Play className="h-4 w-4" /> Execute in sandbox</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Isolated container · no network · {status.limits.timeout_seconds}s limit · {status.limits.memory_mb} MB.</p>
      {job && (
        <div className="mt-3">
          <div className="flex items-center gap-2"><Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{job.status}</Badge><code>{job.file_path}</code></div>
          {job.result && <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{`exit ${job.result.exit_code ?? "n/a"}${job.result.timed_out ? " (timed out)" : ""} · ${job.result.duration_ms} ms${job.result.truncated ? " · output truncated" : ""}\n${job.result.stdout}${job.result.stderr ? `\n[stderr]\n${job.result.stderr}` : ""}`}</pre>}
        </div>
      )}
    </div>
  );
}
