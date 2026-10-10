"use client";
import { Check, Download, Eye, FileDiff, FlaskConical, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, CodeBlock, Dialog, Skeleton } from "@/components/ui";
import { CopyButton, Markdown } from "@/components/markdown";
import { PatchReview } from "@/features/patch-review";
import { usePatchActions } from "@/features/use-patch";
import { downloadText, get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { DebugResponse, Patch } from "@/types/api";

const confTone = { low: "danger", medium: "warn", high: "ok" } as const;
const TASK_LABEL: Record<string, string> = { debug: "Debugging", explain_error: "Error explanation", root_cause: "Root cause", suggest_fix: "Fix suggestion", alternatives: "Alternative fixes", explain_code: "Code explanation", edge_cases: "Edge cases", readability: "Readability", optimize: "Performance", refactor: "Refactoring", repro: "Reproduction" };

function Block({ title, kind, children, icon }: { title: string; kind: "ai" | "source" | "tool" | "plain"; children: React.ReactNode; icon?: React.ReactNode }) {
  const styles = { ai: "border-primary/30 bg-primary/[0.04]", source: "border-border bg-card", tool: "border-ok/30 bg-ok/[0.04]", plain: "border-border bg-card" }[kind];
  const label = { ai: "AI hypothesis", source: "From your code", tool: "Confirmed by tool", plain: "" }[kind];
  return (
    <section className={cn("mt-3 rounded-lg border", styles)}>
      <header className="flex items-center gap-1.5 border-b border-inherit px-3 py-1.5">
        {icon}<h3 className="text-xs font-semibold">{title}</h3>
        {label && <span className={cn("ml-auto text-2xs font-medium", kind === "ai" ? "text-primary" : kind === "tool" ? "text-ok" : "text-muted-foreground")}>{label}</span>}
      </header>
      <div className="px-3 py-2 text-[13px]">{children}</div>
    </section>
  );
}

function FixBar({ patch, path, language, correctedCode, onChanged }: { patch: Patch; path: string; language: string; correctedCode: string | null; onChanged?: () => void }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const a = usePatchActions(patch, { path, onChange: onChanged });
  const p = a.patch;
  const [full, setFull] = useState<Patch | null>(null);
  useEffect(() => { if (diffOpen) get<Patch>(`/patches/${p.id}`).then(setFull).catch(() => setFull(null)); }, [diffOpen, p.id, p.status]);
  return (
    <div className="mt-3 rounded-lg border border-primary/40 bg-primary/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileDiff className="h-4 w-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{p.title}</p><p className="font-mono text-2xs text-muted-foreground">{path} · <span className="text-ok">+{p.added}</span> <span className="text-danger">−{p.removed}</span></p></div>
        <Badge tone={p.status === "applied" ? "ok" : p.status === "rejected" ? "danger" : "warn"}>{p.status}</Badge>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setDiffOpen(true)}><Eye className="h-3.5 w-3.5" /> View diff</Button>
        {p.status === "proposed" && (<>
          <Button size="sm" onClick={a.apply} loading={a.busy === "apply"} disabled={!!a.busy}><Check className="h-3.5 w-3.5" /> Apply fix</Button>
          <Button size="sm" variant="outline" onClick={a.reject} loading={a.busy === "reject"} disabled={!!a.busy}><X className="h-3.5 w-3.5" /> Reject fix</Button>
        </>)}
        {p.status === "applied" && <Button size="sm" variant="outline" onClick={a.restore} loading={a.busy === "restore"} disabled={!!a.busy || a.restored}><RotateCcw className="h-3.5 w-3.5" /> {a.restored ? "Restored" : "Restore previous version"}</Button>}
        {correctedCode && <CopyButton text={correctedCode} label="Copy fix" />}
      </div>
      <Dialog open={diffOpen} onClose={() => setDiffOpen(false)} title="Proposed change" description="Review the exact lines that would change." wide>
        <div className="h-[62vh]">{full ? <PatchReview patch={full} language={language} path={path} onResolved={() => onChanged?.()} /> : <Skeleton className="h-full" />}</div>
      </Dialog>
    </div>
  );
}

export function DebugReportView({ data, onPatchChanged, filePath, patch }: { data: DebugResponse; onPatchChanged?: () => void; filePath?: string; patch?: Patch | null }) {
  const r = data.report;
  const toast = useToast();
  const path = filePath ?? (data.report.evidence[0]?.file || "file");
  const [fetched, setFetched] = useState<Patch | null>(patch ?? null);
  useEffect(() => {
    if (!data.patch_id || patch) return;
    get<Patch>(`/patches/${data.patch_id}`).then(setFetched).catch(() => setFetched(null));
  }, [data.patch_id, patch]);

  return (
    <article aria-label="Debugging report" className="text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{TASK_LABEL[data.task] ?? data.task}</Badge>
        <Badge tone={confTone[r.confidence]} title={r.confidence_reasoning}>Confidence: {r.confidence}</Badge>
        <Badge tone="neutral">{data.language}</Badge>
        <span className="ml-auto text-2xs text-muted-foreground">{data.provider} · {data.model}</span>
      </div>
      <h2 className="mt-2.5 text-[15px] font-semibold leading-snug">{r.summary}</h2>

      {data.patch_id && fetched && <FixBar patch={fetched} path={path} language={data.language} correctedCode={r.corrected_code} onChanged={onPatchChanged} />}
      {data.patch_id && !fetched && <Skeleton className="mt-3 h-20" />}

      {r.root_cause && (
        <Block title="Likely root cause" kind="ai" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}>
          <Markdown>{r.root_cause}</Markdown>
          {r.confidence_reasoning && <p className="mt-1 text-xs text-muted-foreground">{r.confidence_reasoning}</p>}
        </Block>
      )}

      {r.evidence.length > 0 && (
        <Block title="Evidence" kind="source">
          <ul className="space-y-2.5">
            {r.evidence.map((e, i) => (
              <li key={i}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <code className="font-mono">{e.file || "snippet"}</code>
                  {e.line_verified
                    ? <Badge tone="ok" title="The quoted text was found in the file by the server"><ShieldCheck className="h-3 w-3" /> line {e.line_start}{e.line_end && e.line_end !== e.line_start ? `–${e.line_end}` : ""} (verified)</Badge>
                    : <Badge tone="warn" title="The quoted text could not be located, so no line number is shown">line not verified</Badge>}
                </div>
                {e.quote && <CodeBlock code={e.quote} language={data.language} title={e.file || "quote"} maxHeight={160} />}
                {e.note && <p className="mt-1 text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.tool_findings.length > 0 && (
        <Block title="Static analysis" kind="tool" icon={<ShieldCheck className="h-3.5 w-3.5 text-ok" />}>
          <ul className="space-y-1.5">{data.tool_findings.map((f, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-1.5"><Badge tone="ok">{f.tool} {f.rule_id}</Badge><span className="font-mono text-2xs text-muted-foreground">line {f.line ?? "?"}</span><span>{f.message}</span></li>
          ))}</ul>
        </Block>
      )}

      {(r.suggested_fix || r.fix_explanation) && (
        <Block title="Proposed fix" kind="ai">
          {r.suggested_fix && <Markdown>{r.suggested_fix}</Markdown>}
          {r.fix_explanation && <><p className="mt-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Why it works</p><Markdown>{r.fix_explanation}</Markdown></>}
          {r.corrected_code && !data.patch_id && <div className="mt-2"><CodeBlock code={r.corrected_code} language={data.language} title="Corrected code" maxHeight={240} /></div>}
        </Block>
      )}

      {r.alternative_fixes.length > 0 && (
        <Block title="Alternative fixes" kind="ai">
          {r.alternative_fixes.map((a, i) => (
            <div key={i} className="mb-2 last:mb-0"><p className="font-medium">{a.title}</p><Markdown>{a.description}</Markdown>{a.corrected_code && <CodeBlock code={a.corrected_code} language={data.language} maxHeight={200} />}</div>
          ))}
        </Block>
      )}
      {r.sections.map((s, i) => <Block key={i} title={s.heading} kind="ai"><Markdown>{s.body}</Markdown></Block>)}

      {(r.regressions.length > 0 || r.verification_steps.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {r.regressions.length > 0 && <Block title="Possible regressions" kind="plain"><ul className="list-disc space-y-1 pl-4">{r.regressions.map((x, i) => <li key={i}>{x}</li>)}</ul></Block>}
          {r.verification_steps.length > 0 && <Block title="How to verify" kind="plain" icon={<FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />}><ol className="list-decimal space-y-1 pl-4">{r.verification_steps.map((x, i) => <li key={i}>{x}</li>)}</ol></Block>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" variant="outline" onClick={() => downloadText(`/reports/${data.id}/export.md`, `debug-report-${data.id.slice(0, 8)}.md`).catch(toast.error)}><Download className="h-3.5 w-3.5" /> Export Markdown</Button>
        <p className="min-w-0 flex-1 text-2xs text-muted-foreground">{data.disclaimer}{data.meta && ` Tokens: ${data.meta.usage.prompt_tokens} in / ${data.meta.usage.completion_tokens} out (${data.meta.usage.source === "provider" ? "reported by provider" : "estimated"}). Files sent: ${data.meta.context.files.map((f) => f.path).join(", ") || "none"}.${data.meta.related_files?.length ? ` Related files included: ${data.meta.related_files.map((r) => `${r.path} (${r.relation})`).join(", ")}.` : ""}`}</p>
      </div>
    </article>
  );
}
