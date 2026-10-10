"use client";
import { ArrowDownToLine, ArrowUpFromLine, GitFork, Package, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, EmptyState, ListSkeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Related } from "@/types/api";
import type { WorkspaceCtx } from "./types";

function Group({ title, icon, items, ctx, empty }: { title: string; icon: React.ReactNode; items: string[]; ctx: WorkspaceCtx; empty: string }) {
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{icon}{title} <span className="font-normal">({items.length})</span></h3>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : (
        <ul className="space-y-0.5">{items.map((p) => {
          const f = ctx.files.find((x) => x.path === p);
          return <li key={p}><button disabled={!f} onClick={() => f && ctx.openFile(f.id)} className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs hover:bg-muted disabled:opacity-60">{p}</button></li>;
        })}</ul>
      )}
    </section>
  );
}

/** Import relationships of the active file. Static analysis only; the method and its limits are stated. */
export function RelatedPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [data, setData] = useState<Related | null>(null);
  const fid = ctx.file?.id;
  const sha = ctx.file?.sha256;
  useEffect(() => {
    if (!fid) return;
    setData(null);
    get<Related>(`/projects/${ctx.projectId}/files/${fid}/related`).then(setData).catch(toast.error);
  }, [fid, sha, ctx.files.length, ctx.projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx.file) return <EmptyState icon={<GitFork className="h-4 w-4" />} title="Open a file to see its relationships" />;
  if (!data) return <ListSkeleton rows={3} />;
  if (!data.supported) return <EmptyState icon={<GitFork className="h-4 w-4" />} title={`No import analysis for ${data.language}`} hint="Import relationships are analysed for Python (via the parser) and JavaScript/TypeScript (pattern matching) only." />;
  return (
    <div className="h-full overflow-auto p-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Group title="Imports" icon={<ArrowDownToLine className="h-3 w-3" />} items={data.imports} ctx={ctx} empty="Imports no other project files." />
        <Group title="Imported by" icon={<ArrowUpFromLine className="h-3 w-3" />} items={data.imported_by} ctx={ctx} empty="No other project file imports this one." />
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"><Package className="h-3 w-3" />External ({data.external.length})</h3>
          <div className="flex flex-wrap gap-1">{data.external.length ? data.external.map((e) => <Badge key={e}>{e}</Badge>) : <span className="text-xs text-muted-foreground">None.</span>}</div>
        </section>
      </div>
      {data.cycles.length > 0 && <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />Circular import: {data.cycles.map((c) => c.join(" ⇄ ")).join("; ")}</p>}
      {data.unresolved.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Unresolved relative imports: {data.unresolved.join(", ")}</p>}
      <p className="mt-3 text-2xs text-muted-foreground">Method: {data.method}. {data.disclaimer} Turn on “Include related files” in the Debug tab to send these as extra context (max 4).</p>
    </div>
  );
}
