"use client";
import { SearchCheck } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Label, Select, ListSkeleton } from "@/components/ui";
import { ReviewActions } from "@/features/review-actions";
import { ReviewView } from "@/features/review-view";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Review } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function ReviewPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [depth, setDepth] = useState("standard");
  const [scope, setScope] = useState<"file" | "project">("file");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  async function run() {
    setBusy(true); setReview(null);
    try {
      await ctx.saveNow();
      setReview(await post<Review>("/reviews", { project_id: ctx.projectId, depth, file_ids: scope === "file" && ctx.file ? [ctx.file.id] : [] }));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  return (
    <div className="h-full overflow-auto p-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="depth">Depth</Label><Select id="depth" value={depth} onChange={(e) => setDepth(e.target.value)}><option value="quick">Quick</option><option value="standard">Standard</option><option value="deep">Deep</option></Select></div>
        <div><Label htmlFor="scope">Scope</Label><Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as "file" | "project")}><option value="file" disabled={!ctx.file}>Current file</option><option value="project">Whole project (manifest)</option></Select></div>
      </div>
      <Button className="mt-2 w-full" onClick={run} loading={busy} disabled={scope === "file" && !ctx.file}><SearchCheck className="h-4 w-4" /> Run review</Button>
      <p className="mt-1 text-xs text-muted-foreground">Project reviews skip secrets/dependency folders and cap the number of files by depth. Reviews are not exhaustive.</p>
      <div className="mt-4 border-t pt-3">{busy ? <ListSkeleton rows={3} /> : review ? <><div className="mb-3 flex flex-wrap gap-1.5"><ReviewActions review={review} projectId={ctx.projectId} onChanged={setReview} /></div><ReviewView review={review} /></> : <EmptyState title="No review yet" />}</div>
    </div>
  );
}
