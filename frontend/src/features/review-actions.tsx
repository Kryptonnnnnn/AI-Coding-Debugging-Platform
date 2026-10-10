"use client";
import { Bookmark, BookmarkCheck, Download, GitCompare } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Dialog, Input, Label, Select, SeverityBadge } from "@/components/ui";
import { downloadText, get, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { BriefFinding, Comparison, Page, Review } from "@/types/api";

function Group({ title, tone, items }: { title: string; tone: "danger" | "ok" | "neutral"; items: BriefFinding[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-3">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><Badge tone={tone}>{title}</Badge><span className="text-muted-foreground">{items.length}</span></h3>
      <ul className="divide-y rounded-md border">{items.map((f) => (
        <li key={f.fingerprint} className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-[13px]"><SeverityBadge severity={f.severity} /><span className="min-w-0 flex-1 truncate">{f.title}</span><code className="font-mono text-2xs text-muted-foreground">{f.file_path}{f.line_start ? `:${f.line_start}` : ""}</code><Badge>{f.source === "tool" ? "tool" : "AI"}</Badge></li>
      ))}</ul>
    </section>
  );
}

/** Export, baseline and compare for a saved review. Comparison is computed server-side from stored findings. */
export function ReviewActions({ review, projectId, onChanged }: { review: Review; projectId: string | null; onChanged?: (r: Review) => void }) {
  const toast = useToast();
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [label, setLabel] = useState(review.label ?? "");
  const [cmpOpen, setCmpOpen] = useState(false);
  const [others, setOthers] = useState<Review[]>([]);
  const [otherId, setOtherId] = useState("");
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveBaseline(on: boolean) {
    setBusy(true);
    try { const r = await post<Review>(`/reviews/${review.id}/baseline`, { is_baseline: on, label }); toast.ok(on ? "Saved as baseline" : "Baseline removed"); setBaselineOpen(false); onChanged?.(r); } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  async function openCompare() {
    setCmpOpen(true); setCmp(null);
    try {
      const page = await get<Page<Review>>(`/reviews?page_size=50${projectId ? `&project_id=${projectId}` : ""}`);
      const list = page.items.filter((r) => r.id !== review.id);
      setOthers(list); setOtherId(list[0]?.id ?? "");
    } catch (e) { toast.error(e); }
  }
  async function run() {
    setBusy(true);
    try {
      // older review = baseline side
      const other = others.find((r) => r.id === otherId)!;
      const [a, b] = new Date(other.created_at) < new Date(review.created_at) ? [other.id, review.id] : [review.id, other.id];
      setCmp(await get<Comparison>(`/reviews/${a}/compare/${b}`));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => downloadText(`/reviews/${review.id}/export.md`, `code-review-${review.id.slice(0, 8)}.md`).catch(toast.error)}><Download className="h-3.5 w-3.5" /> Export Markdown</Button>
      <Button size="sm" variant="outline" onClick={() => (review.is_baseline ? void saveBaseline(false) : setBaselineOpen(true))}>
        {review.is_baseline ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> : <Bookmark className="h-3.5 w-3.5" />} {review.is_baseline ? `Baseline${review.label ? `: ${review.label}` : ""}` : "Save as baseline"}
      </Button>
      <Button size="sm" variant="outline" onClick={openCompare}><GitCompare className="h-3.5 w-3.5" /> Compare</Button>

      <Dialog open={baselineOpen} onClose={() => setBaselineOpen(false)} title="Save as baseline" description="Later reviews can be compared against this one.">
        <form onSubmit={(e) => { e.preventDefault(); void saveBaseline(true); }} className="space-y-3">
          <div><Label htmlFor="bl">Label (optional)</Label><Input id="bl" maxLength={120} autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. before auth refactor" /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setBaselineOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Save baseline</Button></div>
        </form>
      </Dialog>

      <Dialog open={cmpOpen} onClose={() => setCmpOpen(false)} title="Compare reviews" description="Matches findings by file, rule and text, not line number, so moved code is not reported as new." wide>
        {others.length === 0 && !cmp ? <p className="text-[13px] text-muted-foreground">There is no other saved review of this project to compare with. Run another review first.</p> : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1"><Label htmlFor="cmp-other">Compare this review with</Label>
                <Select id="cmp-other" value={otherId} onChange={(e) => { setOtherId(e.target.value); setCmp(null); }}>
                  {others.map((r) => <option key={r.id} value={r.id}>{r.is_baseline ? "★ " : ""}{r.label || r.depth} · {formatDate(r.created_at)}</option>)}
                </Select></div>
              <Button onClick={run} loading={busy} disabled={!otherId}>Compare</Button>
            </div>
            {cmp && (
              <div className="mt-3 text-[13px]">
                <p className="text-xs text-muted-foreground">Older: {cmp.baseline.label || cmp.baseline.depth} ({formatDate(cmp.baseline.created_at)}) → newer: {formatDate(cmp.current.created_at)}. {cmp.compared_files.length} file(s) compared.</p>
                <div className="mt-2 flex gap-2 text-xs"><Badge tone="danger">{cmp.new.length} new</Badge><Badge tone="ok">{cmp.resolved.length} resolved</Badge><Badge>{cmp.unchanged.length} unchanged</Badge></div>
                <Group title="New" tone="danger" items={cmp.new} /><Group title="No longer reported" tone="ok" items={cmp.resolved} /><Group title="Unchanged" tone="neutral" items={cmp.unchanged} />
                <ul className="mt-3 list-disc space-y-0.5 pl-4 text-2xs text-muted-foreground">{cmp.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
