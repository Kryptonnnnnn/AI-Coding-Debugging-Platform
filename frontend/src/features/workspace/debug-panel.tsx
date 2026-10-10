"use client";
import { Bug } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Label, ListSkeleton, Select, Textarea } from "@/components/ui";
import { DebugReportView } from "@/features/debug-report-view";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { DebugResponse } from "@/types/api";
import type { WorkspaceCtx } from "./types";

const TASKS: [string, string][] = [
  ["debug", "Debug (root cause + fix)"], ["explain_error", "Explain error"], ["root_cause", "Find root cause"], ["suggest_fix", "Suggest fix"],
  ["alternatives", "Alternative fixes"], ["explain_code", "Explain code line by line"], ["edge_cases", "Identify edge cases"],
  ["readability", "Improve readability"], ["optimize", "Optimize performance"], ["refactor", "Refactor safely"], ["repro", "Minimal reproduction"],
];

export function DebugPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [task, setTask] = useState("debug");
  const [error, setError] = useState("");
  const [trace, setTrace] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [related, setRelated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DebugResponse | null>(null);

  async function run() {
    if (!ctx.file) return;
    setBusy(true); setResult(null);
    try {
      const f = await ctx.saveNow();
      setResult(await post<DebugResponse>("/debug", { project_id: ctx.projectId, file_id: (f ?? ctx.file).id, task, include_related: related, error_message: error, stack_trace: trace, expected, actual }));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  if (!ctx.file) return <EmptyState icon={<Bug className="h-4 w-4" />} title="Open a file to debug" hint="Select a file in the explorer first." />;
  return (
    <div className="h-full overflow-auto p-3">
      <div className="space-y-2.5">
        <div><Label htmlFor="task">Action</Label><Select id="task" value={task} onChange={(e) => setTask(e.target.value)}>{TASKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
        <div><Label htmlFor="err">Error message</Label><Textarea id="err" rows={2} value={error} onChange={(e) => setError(e.target.value)} placeholder="ZeroDivisionError: division by zero" /></div>
        <div><Label htmlFor="trace">Stack trace (optional)</Label><Textarea id="trace" rows={3} className="font-mono text-xs" value={trace} onChange={(e) => setTrace(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="exp">Expected behavior</Label><Textarea id="exp" rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          <div><Label htmlFor="act">Actual behavior</Label><Textarea id="act" rows={2} value={actual} onChange={(e) => setActual(e.target.value)} /></div>
        </div>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={related} onChange={(e) => setRelated(e.target.checked)} /><span>Include related files <span className="text-muted-foreground">(files this one imports or that import it, max 4; import analysis is static and not a full call graph)</span></span></label>
        <Button onClick={run} loading={busy} className="w-full"><Bug className="h-4 w-4" /> Analyze {ctx.file.path}</Button>
        <p className="text-xs text-muted-foreground">Sends this file (secrets redacted) and the details above to the configured AI provider. Nothing is changed until you apply a patch.</p>
      </div>
      <div className="mt-4 border-t pt-3">{busy ? <ListSkeleton rows={3} /> : result ? <DebugReportView data={result} filePath={ctx.file.path} onPatchChanged={() => void ctx.reloadActive()} /> : null}</div>
    </div>
  );
}
