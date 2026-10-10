"use client";
import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, EmptyState, ListSkeleton, SeverityBadge } from "@/components/ui";
import { get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatBytes } from "@/lib/utils";
import type { Overview } from "@/types/api";
import type { WorkspaceCtx } from "./types";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-md border bg-card px-2.5 py-1.5"><p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-base font-semibold tabular-nums">{value}</p></div>;
}

/** Project analytics computed from stored data only. */
export function OverviewPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => { get<Overview>(`/projects/${ctx.projectId}/overview`).then(setO).catch(toast.error); }, [ctx.projectId, ctx.files.length, ctx.file?.sha256]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o) return <ListSkeleton rows={3} />;
  if (o.files === 0) return <EmptyState icon={<BarChart3 className="h-4 w-4" />} title="No files yet" hint="Statistics appear once the project has files." />;
  const total = Math.max(1, o.bytes);
  const p = o.activity_counts.patches;
  return (
    <div className="h-full overflow-auto p-3 text-[13px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Files" value={o.files} /><Stat label="Size" value={formatBytes(o.bytes)} />
        <Stat label="Debug reports" value={o.activity_counts.debug_reports} /><Stat label="Reviews" value={o.activity_counts.reviews} />
        <Stat label="Patches" value={`${p.applied ?? 0} applied · ${p.proposed ?? 0} open`} />
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Languages (by size)</h3>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="Language share by bytes">
            {o.languages.map((l, i) => <span key={l.language} title={`${l.language}: ${formatBytes(l.bytes)}`} style={{ width: `${(l.bytes / total) * 100}%`, opacity: 1 - i * 0.12 }} className="bg-primary" />)}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">{o.languages.map((l) => <li key={l.language} className="flex justify-between"><span>{l.language}</span><span className="text-muted-foreground">{l.files} file{l.files === 1 ? "" : "s"} · {formatBytes(l.bytes)}</span></li>)}</ul>
        </section>
        <section>
          <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Most edited files</h3>
          <ul className="space-y-0.5 text-xs">{o.most_edited_files.map((f) => <li key={f.path} className="flex justify-between gap-2"><span className="truncate font-mono">{f.path}</span><span className="text-muted-foreground">{f.versions} versions</span></li>)}</ul>
          <h3 className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Imports</h3>
          <p className="text-xs">{o.imports.edges} internal import{o.imports.edges === 1 ? "" : "s"}{o.imports.cycles ? <> · <Badge tone="warn">{o.imports.cycles} circular</Badge></> : ""}</p>
          {o.imports.most_imported.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{o.imports.most_imported.map((m) => <li key={m.path} className="flex justify-between gap-2"><span className="truncate font-mono">{m.path}</span><span className="text-muted-foreground">imported by {m.imported_by}</span></li>)}</ul>}
        </section>
        {o.latest_review && (
          <section className="lg:col-span-2">
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Latest review ({o.latest_review.depth})</h3>
            <div className="flex flex-wrap items-center gap-2">{["critical", "high", "medium", "low", "info"].filter((s) => o.latest_review!.findings_by_severity[s]).map((s) => <span key={s} className="flex items-center gap-1"><SeverityBadge severity={s} /><span className="text-xs tabular-nums">{o.latest_review!.findings_by_severity[s]}</span></span>)}</div>
            {o.latest_review.files_with_most_findings.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Most findings: {o.latest_review.files_with_most_findings.map(([f, c]) => `${f} (${c})`).join(", ")}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
