"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, EmptyState, SeverityBadge, Spinner } from "@/components/ui";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ToolFinding, ToolStatus } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function AnalysisPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ findings: ToolFinding[]; tools: ToolStatus[] } | null>(null);
  async function run() {
    if (!ctx.file) return;
    setBusy(true);
    try {
      const f = await ctx.saveNow();
      setRes(await post("/analysis/static", { file_id: (f ?? ctx.file).id }));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  if (!ctx.file) return <EmptyState title="Open a file to analyze" />;
  return (
    <div className="h-full overflow-auto p-3 text-sm">
      <Button className="w-full" onClick={run} loading={busy}><ShieldCheck className="h-4 w-4" /> Run static analysis</Button>
      <p className="mt-1 text-xs text-muted-foreground">Deterministic tools only (no AI): Python parser, Ruff, Bandit; Node syntax check for JavaScript. Other languages report “skipped”.</p>
      <div className="mt-4 border-t pt-3">
        {busy ? <Spinner label="Analyzing" /> : !res ? <EmptyState title="No analysis run yet" /> : (
          <>
            <div className="mb-3 flex flex-wrap gap-1">{res.tools.map((t) => <Badge key={t.tool} tone={t.status === "ran" ? "ok" : "warn"} title={t.detail}>{t.tool}: {t.status}</Badge>)}</div>
            {res.tools.filter((t) => t.status !== "ran" && t.detail).map((t) => <p key={t.tool} className="mb-1 text-xs text-muted-foreground">{t.tool}: {t.detail}</p>)}
            {res.findings.length === 0 ? <p className="text-muted-foreground">No findings from the tools that ran.</p> : (
              <ul className="space-y-2">{res.findings.map((f, i) => (
                <li key={i} className="rounded border p-2"><div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><Badge tone="ok">{f.tool} {f.rule_id}</Badge><span className="text-xs">line {f.line ?? "?"}</span></div><p className="mt-1">{f.message}</p>{f.remediation && <p className="text-xs text-muted-foreground">{f.remediation}</p>}</li>))}</ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
