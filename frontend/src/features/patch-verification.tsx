"use client";
import { CheckCircle2, CircleSlash, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Button, SeverityBadge } from "@/components/ui";
import { TestView } from "@/features/test-view";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { GeneratedTest, Verification } from "@/types/api";

/**
 * Deterministic checks on a proposed patch (parser + static tools), honest execution status, audit trail,
 * and AI-suggested regression tests. Checks never write to the project.
 */
export function PatchVerification({ patchId, initial, status }: { patchId: string; initial?: Verification; status: string }) {
  const toast = useToast();
  const [v, setV] = useState<Verification | undefined>(initial && initial.checked_at ? initial : undefined);
  const [events, setEvents] = useState(initial?.events ?? []);
  const [busy, setBusy] = useState<"verify" | "tests" | null>(null);
  const [tests, setTests] = useState<GeneratedTest | null>(null);

  async function verify() {
    setBusy("verify");
    try { const r = await post<Verification>(`/patches/${patchId}/verify`, { test_paths: [] }); setV(r); setEvents(r.events ?? []); } catch (e) { toast.error(e); } finally { setBusy(null); }
  }
  async function suggest() {
    setBusy("tests");
    try { setTests(await post<GeneratedTest>(`/patches/${patchId}/regression-tests`)); } catch (e) { toast.error(e); } finally { setBusy(null); }
  }

  return (
    <section aria-label="Patch verification" className="rounded-md border bg-card/50 p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verification</h3>
        <span className="text-2xs text-muted-foreground">Parser and static tools run on the proposed code; the project is not modified.</span>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={verify} loading={busy === "verify"} disabled={!!busy}>{v ? "Re-run checks" : "Run checks"}</Button>
          <Button size="sm" variant="outline" onClick={suggest} loading={busy === "tests"} disabled={!!busy}><FlaskConical className="h-3.5 w-3.5" /> Suggest regression tests</Button>
        </div>
      </div>
      {v?.syntax && v.static && v.execution && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {v.syntax.proposed_ok ? <Badge tone="ok"><CheckCircle2 className="h-3 w-3" /> proposed code parses</Badge> : <Badge tone="danger"><XCircle className="h-3 w-3" /> syntax error{v.syntax.proposed_error?.line ? ` (line ${v.syntax.proposed_error.line})` : ""}</Badge>}
            {v.static.tools.map((t) => <Badge key={t.tool} tone={t.status === "ran" ? "ok" : "neutral"} title={t.detail}>{t.tool}: {t.status}</Badge>)}
            <Badge tone="warn" title={v.execution.reason}><CircleSlash className="h-3 w-3" /> tests {v.execution.status === "executed" ? "executed" : "not executed"}</Badge>
          </div>
          {v.static.new_findings.length > 0 && (
            <div><p className="text-xs font-medium text-danger">New tool findings introduced ({v.static.new_findings.length})</p>
              <ul className="mt-0.5 space-y-0.5">{v.static.new_findings.map((f, i) => <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs"><SeverityBadge severity={f.severity} /><code className="font-mono">{f.tool} {f.rule_id}</code>{f.message}</li>)}</ul></div>
          )}
          {v.static.resolved_findings.length > 0 && <p className="text-xs text-ok">Resolved by this patch: {v.static.resolved_findings.map((f) => `${f.rule_id} (${f.message})`).join("; ")}</p>}
          {v.static.new_findings.length === 0 && v.static.resolved_findings.length === 0 && <p className="text-xs text-muted-foreground">No change in tool findings ({v.static.unchanged_count} unchanged).</p>}
          {v.execution.status === "executed" && v.execution.results?.map((r) => (
            <details key={r.test_path} className="rounded border p-2 text-xs"><summary><Badge tone={r.status === "passed" ? "ok" : "danger"}>{r.status}</Badge> <code className="font-mono">{r.test_path}</code></summary><pre className="mt-1 max-h-40 overflow-auto font-mono">{r.output ?? r.detail}</pre></details>
          ))}
          {v.notes && v.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{v.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
      {status === "applied" && initial?.post_apply && <p className="mt-2 text-xs text-muted-foreground">After applying: syntax {initial.post_apply.syntax_ok ? "valid" : "INVALID"}, {initial.post_apply.tool_findings} tool finding(s), checked by {initial.post_apply.analyzers_ran.join(", ") || "no analyzer"}.</p>}
      {events.length > 0 && <details className="mt-2 text-2xs text-muted-foreground"><summary className="cursor-pointer">Audit trail ({events.length})</summary><ul className="mt-1 space-y-0.5">{events.map((e, i) => <li key={i}>{formatDate(e.at)} · {e.event.replace(/_/g, " ")}</li>)}</ul></details>}
      {tests && <div className="mt-3 border-t pt-3"><p className="mb-1 text-xs font-medium">Suggested regression tests</p><TestView key={tests.id} test={tests} /></div>}
    </section>
  );
}
