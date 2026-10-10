"use client";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Button, Card, EmptyState, ErrorState, Input, Pagination, Spinner } from "@/components/ui";
import { DebugReportView } from "@/features/debug-report-view";
import { useAsync } from "@/hooks/use-async";
import { del, get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { DebugResponse, Page } from "@/types/api";

type Item = DebugResponse & { summary: string };

export default function DebugHistoryPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => get<Page<Item>>(`/reports?q=${encodeURIComponent(q)}&page=${page}`), [q, page]);
  const [detail, setDetail] = useState<DebugResponse | null>(null);

  useEffect(() => { setSelected(new URLSearchParams(window.location.search).get("open")); }, []);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    get<DebugResponse>(`/reports/${selected}`).then(setDetail).catch((e) => { toast.error(e); setDetail(null); });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(id: string) {
    if (!window.confirm("Delete this report?")) return;
    try { await del(`/reports/${id}`); toast.ok("Report deleted"); if (selected === id) setSelected(null); reload(); } catch (e) { toast.error(e); }
  }

  return (
    <PageBody>
      <PageHeader title="Debug history" description="Saved debugging reports. Export any report as Markdown." />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div>
          <Input aria-label="Search reports" placeholder="Search reports…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="mb-3" />
          {loading ? <Spinner /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
            <Card><EmptyState title="No reports yet" hint="Open a project and run “Debug” on a file." /></Card>
          ) : (
            <Card className="divide-y">
              {data.items.map((r) => (
                <div key={r.id} className={`flex items-start gap-2 p-3 ${selected === r.id ? "bg-primary/5" : ""}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(r.id)}>
                    <p className="truncate text-sm font-medium">{r.summary || "Report"}</p>
                    <p className="text-xs text-muted-foreground">{r.task.replace("_", " ")} · {r.language} · {formatDate(r.created_at)}</p>
                  </button>
                  <Button size="icon" variant="ghost" aria-label="Delete report" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              ))}
              <Pagination page={page} pageSize={data.page_size} total={data.total} onChange={setPage} />
            </Card>
          )}
        </div>
        <Card className="min-h-[300px] p-4">
          {detail ? <DebugReportView data={detail} /> : <EmptyState title="Select a report" hint="Choose a report on the left to read it." />}
        </Card>
      </div>
    </PageBody>
  );
}
