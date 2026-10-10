"use client";
import { Download, FileDiff } from "lucide-react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui";
import { CopyButton, Markdown } from "@/components/markdown";
import { downloadText } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { DebugResponse } from "@/types/api";

const confTone = { low: "danger", medium: "warn", high: "ok" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4"><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</section>;
}

export function DebugReportView({ data, onOpenPatch }: { data: DebugResponse; onOpenPatch?: (id: string) => void }) {
  const r = data.report;
  const toast = useToast();
  return (
    <article aria-label="Debugging report" className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">AI hypothesis</Badge>
        <Badge tone={confTone[r.confidence]}>Confidence: {r.confidence}</Badge>
        <span className="text-xs text-muted-foreground">{data.provider} · {data.model} · {data.task.replace("_", " ")}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => downloadText(`/reports/${data.id}/export.md`, `debug-report-${data.id.slice(0, 8)}.md`).catch(toast.error)}>
            <Download className="h-3.5 w-3.5" /> Export Markdown
          </Button>
        </div>
      </div>
      <h2 className="mt-3 text-base font-semibold">{r.summary}</h2>
      {r.root_cause && <Section title="Likely root cause"><Markdown>{r.root_cause}</Markdown></Section>}
      {r.confidence_reasoning && <p className="mt-1 text-xs text-muted-foreground">{r.confidence_reasoning}</p>}
      {data.tool_findings.length > 0 && (
        <Section title="Deterministic tool findings">
          <ul className="space-y-1">
            {data.tool_findings.map((f, i) => (
              <li key={i} className="rounded border p-2"><Badge tone="ok">{f.tool} {f.rule_id}</Badge> <span className="text-xs">line {f.line ?? "?"}</span> {f.message}</li>
            ))}
          </ul>
        </Section>
      )}
      {r.evidence.length > 0 && (
        <Section title="Evidence">
          <ul className="space-y-2">
            {r.evidence.map((e, i) => (
              <li key={i} className="rounded border p-2">
                <div className="flex items-center gap-2 text-xs">
                  <code>{e.file || "snippet"}</code>
                  {e.line_verified ? <Badge tone="ok" title="The quoted text was found in the file by the server">line {e.line_start}{e.line_end && e.line_end !== e.line_start ? `–${e.line_end}` : ""} (verified)</Badge> : <Badge tone="warn" title="The quoted text could not be located, so no line number is shown">line not verified</Badge>}
                </div>
                {e.quote && <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">{e.quote}</pre>}
                {e.note && <p className="mt-1">{e.note}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {r.suggested_fix && <Section title="Suggested fix"><Markdown>{r.suggested_fix}</Markdown></Section>}
      {r.fix_explanation && <Section title="Why this works"><Markdown>{r.fix_explanation}</Markdown></Section>}
      {data.patch_id && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
          <FileDiff className="h-4 w-4 text-primary" /> <span className="flex-1">A proposed patch was created. Review it before applying.</span>
          {onOpenPatch ? <Button size="sm" onClick={() => onOpenPatch(data.patch_id!)}>Review patch</Button> : <Link className="text-primary underline" href={`/patches/${data.patch_id}`}>Review patch</Link>}
        </div>
      )}
      {r.corrected_code && <Section title="Corrected code"><div className="mb-1 flex justify-end"><CopyButton text={r.corrected_code} label="Copy code" /></div><pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{r.corrected_code}</pre></Section>}
      {r.alternative_fixes.length > 0 && (
        <Section title="Alternative fixes">
          {r.alternative_fixes.map((a, i) => (<div key={i} className="mb-2 rounded border p-2"><p className="font-medium">{a.title}</p><Markdown>{a.description}</Markdown>{a.corrected_code && <pre className="overflow-auto rounded bg-muted p-2 text-xs">{a.corrected_code}</pre>}</div>))}
        </Section>
      )}
      {r.sections.map((s, i) => <Section key={i} title={s.heading}><Markdown>{s.body}</Markdown></Section>)}
      {r.regressions.length > 0 && <Section title="Potential regressions"><ul className="list-disc pl-5">{r.regressions.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>}
      {r.verification_steps.length > 0 && <Section title="Verify"><ol className="list-decimal pl-5">{r.verification_steps.map((x, i) => <li key={i}>{x}</li>)}</ol></Section>}
      <p className="mt-4 text-xs text-muted-foreground">{data.disclaimer}</p>
      {data.meta && <p className="mt-1 text-xs text-muted-foreground">Tokens: {data.meta.usage.prompt_tokens} in / {data.meta.usage.completion_tokens} out ({data.meta.usage.source === "provider" ? "reported by provider" : "estimated"}). Files sent: {data.meta.context.files.map((f) => f.path).join(", ") || "none"}.</p>}
    </article>
  );
}
