"use client";
import { ChevronDown, ChevronRight, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, CodeBlock, Input, Select, SeverityBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Finding, Review } from "@/types/api";

const ORDER = ["critical", "high", "medium", "low", "info"] as const;
const LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Informational" };

function FindingRow({ f, language }: { f: Finding; language: string }) {
  const [open, setOpen] = useState(false);
  const confirmed = f.source === "tool" || f.tool_confirmed;
  const loc = f.file_path ? `${f.file_path}${f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}` : ""}` : "project";
  return (
    <li className="border-b last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/40">
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">{f.title || f.description.slice(0, 80)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <code className="font-mono text-2xs text-muted-foreground">{loc}</code>
            <Badge>{f.category}</Badge>
            {confirmed
              ? <Badge tone="ok" title="Confirmed by a deterministic tool (parser, Ruff, Bandit or secret scanner)"><ShieldCheck className="h-3 w-3" /> tool-confirmed</Badge>
              : <Badge tone="primary" title="AI-generated hypothesis; no deterministic tool agrees"><Sparkles className="h-3 w-3" /> AI hypothesis</Badge>}
            {f.file_path && !f.line_start && <span className="text-2xs text-muted-foreground">line not verified</span>}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 pl-8 text-[13px]">
          <p className="text-muted-foreground">{f.description}</p>
          {f.evidence && <CodeBlock code={f.evidence} language={language} title={`${f.file_path}${f.line_start ? `:${f.line_start}` : ""}`} maxHeight={160} />}
          {f.remediation && <p className="rounded-md border border-ok/30 bg-ok/[0.05] px-2.5 py-1.5"><span className="font-medium">Remediation: </span>{f.remediation}</p>}
        </div>
      )}
    </li>
  );
}

export function ReviewView({ review }: { review: Review }) {
  const [sev, setSev] = useState("");
  const [src, setSrc] = useState("");
  const [q, setQ] = useState("");
  const counts = useMemo(() => Object.fromEntries(ORDER.map((s) => [s, review.findings.filter((f) => f.severity === s).length])), [review]);
  const shown = review.findings.filter((f) =>
    (!sev || f.severity === sev) &&
    (!src || (src === "tool" ? f.source === "tool" || f.tool_confirmed : f.source === "ai" && !f.tool_confirmed)) &&
    (!q || `${f.title} ${f.description} ${f.file_path} ${f.category}`.toLowerCase().includes(q.toLowerCase())));
  const langOf = (p: string) => ({ py: "python", js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", go: "go", java: "java", sql: "sql" }[p.split(".").pop() ?? ""] ?? "text");

  return (
    <article aria-label="Code review" className="text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{review.depth} review</Badge>
        <span className="text-2xs text-muted-foreground">{review.provider} · {review.model} · {review.scope.length} file(s)</span>
      </div>
      <p className="mt-2">{review.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ORDER.filter((s) => counts[s]).map((s) => (
          <button key={s} onClick={() => setSev(sev === s ? "" : s)} aria-pressed={sev === s} className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5", sev === s && "border-primary bg-primary/10")}>
            <SeverityBadge severity={s} /><span className="text-2xs tabular-nums">{counts[s]}</span>
          </button>
        ))}
        {review.findings.length === 0 && <span className="text-xs text-muted-foreground">No findings.</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label="Search findings" placeholder="Search findings…" className="pl-7" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Filter by severity" className="w-36" value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="">All severities</option>{ORDER.map((s) => <option key={s} value={s}>{LABEL[s]} ({counts[s]})</option>)}
        </Select>
        <Select aria-label="Filter by source" className="w-40" value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="">All sources</option><option value="tool">Tool-confirmed</option><option value="ai">AI hypotheses</option>
        </Select>
      </div>
      {shown.length === 0 ? <p className="mt-4 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{review.findings.length ? "No findings match these filters." : "No findings. That does not prove the code is free of problems."}</p> : (
        <div className="mt-3 space-y-3">
          {ORDER.map((s) => {
            const group = shown.filter((f) => f.severity === s);
            if (!group.length) return null;
            return (
              <section key={s} aria-label={`${LABEL[s]} findings`} className="overflow-hidden rounded-lg border">
                <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5"><SeverityBadge severity={s} /><span className="text-2xs text-muted-foreground">{group.length} finding{group.length === 1 ? "" : "s"}</span></header>
                <ul>{group.map((f) => <FindingRow key={f.id} f={f} language={langOf(f.file_path)} />)}</ul>
              </section>
            );
          })}
        </div>
      )}
      {review.limitations.length > 0 && (
        <details className="mt-4 rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <summary className="font-medium">Scope and limitations</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{review.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </article>
  );
}
