"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Select, SeverityBadge } from "@/components/ui";
import type { Review } from "@/types/api";

export function ReviewView({ review }: { review: Review }) {
  const [sev, setSev] = useState("");
  const shown = review.findings.filter((f) => !sev || f.severity === sev);
  return (
    <article aria-label="Code review" className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{review.depth} review</Badge>
        <span className="text-xs text-muted-foreground">{review.provider} · {review.model} · {review.scope.length} file(s): {review.scope.join(", ")}</span>
      </div>
      <p className="mt-2">{review.summary}</p>
      <div className="mt-3 flex items-center gap-2">
        <Select aria-label="Filter by severity" className="w-44" value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="">All severities ({review.findings.length})</option>
          {["critical", "high", "medium", "low", "info"].map((s) => <option key={s} value={s}>{s} ({review.findings.filter((f) => f.severity === s).length})</option>)}
        </Select>
      </div>
      {shown.length === 0 ? <p className="mt-4 text-muted-foreground">No findings{sev ? " at this severity" : ""}. That does not prove the code is free of problems.</p> : (
        <ul className="mt-3 space-y-2">
          {shown.map((f) => (
            <li key={f.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={f.severity} />
                <Badge>{f.category}</Badge>
                {f.source === "tool" || f.tool_confirmed ? <Badge tone="ok" title="Confirmed by a deterministic tool (parser, Ruff, Bandit or secret scanner)"><ShieldCheck className="h-3 w-3" /> tool-confirmed</Badge> : <Badge tone="warn" title="AI-generated hypothesis; no deterministic tool agrees">AI hypothesis</Badge>}
                <code className="text-xs">{f.file_path || "project"}{f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}` : ""}</code>
                {f.file_path && !f.line_start && <span className="text-xs text-muted-foreground">(line not verified)</span>}
              </div>
              <p className="mt-1.5 font-medium">{f.title}</p>
              <p className="text-muted-foreground">{f.description}</p>
              {f.evidence && <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">{f.evidence}</pre>}
              {f.remediation && <p className="mt-1"><span className="font-medium">Fix: </span>{f.remediation}</p>}
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{review.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </article>
  );
}
