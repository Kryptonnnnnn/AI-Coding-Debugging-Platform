"use client";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, EmptyState, Spinner } from "@/components/ui";
import { UnifiedDiff } from "@/editor/code-editor";
import { get, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Version } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function HistoryPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [view, setView] = useState<{ v: Version; content: string } | null>(null);
  const fid = ctx.file?.id;
  const sha = ctx.file?.sha256;

  useEffect(() => {
    if (!fid) return;
    setVersions(null);
    get<Version[]>(`/projects/${ctx.projectId}/files/${fid}/versions`).then(setVersions).catch(toast.error);
  }, [fid, sha, ctx.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(v: Version) {
    try { const full = await get<Version & { content: string }>(`/projects/${ctx.projectId}/files/${v.file_id}/versions/${v.id}`); setView({ v, content: full.content }); } catch (e) { toast.error(e); }
  }
  async function restore(v: Version) {
    if (!window.confirm(`Restore version ${v.version_no}? The current content is kept in history.`)) return;
    try { await post(`/projects/${ctx.projectId}/files/${v.file_id}/versions/${v.id}/restore`); toast.ok("Version restored"); setView(null); await ctx.reloadActive(); } catch (e) { toast.error(e); }
  }
  if (!ctx.file) return <EmptyState title="Open a file to see its history" />;
  if (!versions) return <Spinner />;
  const current = versions[0]?.sha256 === ctx.file.sha256 ? versions[0].id : null;
  return (
    <div className="h-full overflow-auto p-3">
      {versions.length === 0 ? <EmptyState title="No versions yet" /> : (
        <ul className="divide-y rounded-md border">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <span className="font-medium">v{v.version_no}</span><Badge tone={v.reason === "patch_apply" ? "primary" : "neutral"}>{v.reason.replace("_", " ")}</Badge>
              {v.id === current && <Badge tone="ok">current</Badge>}
              <span className="flex-1 text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
              <Button size="sm" variant="outline" onClick={() => open(v)}>View diff</Button>
              <Button size="sm" variant="outline" disabled={v.id === current} onClick={() => restore(v)}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!view} onClose={() => setView(null)} title={view ? `v${view.v.version_no} vs current` : ""} wide>
        {view && <UnifiedDiffFromTexts a={view.content} b={ctx.file.content} />}
      </Dialog>
    </div>
  );
}

/** Small line diff (LCS) so the history view needs no extra server call. */
function UnifiedDiffFromTexts({ a, b }: { a: string; b: string }) {
  const x = a.split("\n"), y = b.split("\n");
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push(" " + x[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push("-" + x[i++]); else out.push("+" + y[j++]);
  }
  while (i < x.length) out.push("-" + x[i++]);
  while (j < y.length) out.push("+" + y[j++]);
  return <UnifiedDiff diff={out.join("\n")} />;
}
