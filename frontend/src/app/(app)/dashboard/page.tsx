"use client";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page";
import { Card, ErrorState, SeverityBadge, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import type { Dashboard } from "@/types/api";

const LABELS: [string, string][] = [
  ["projects", "Projects"], ["files", "Files"], ["debug_reports", "Debug reports"], ["reviews", "Code reviews"],
  ["generated_tests", "Generated tests"], ["patches_pending", "Patches pending"], ["patches_applied", "Patches applied"], ["patches_rejected", "Patches rejected"],
];

export default function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => get<Dashboard>("/dashboard"), []);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState error={error ?? "No data"} retry={reload} />;
  const max = Math.max(1, ...data.usage.last_14_days.map((d) => d.requests));
  const empty = data.totals.projects === 0;
  return (
    <PageBody>
      <PageHeader title="Dashboard" description="Live statistics from your own activity." />
      {empty && (
        <Card className="mb-4 p-4 text-sm">
          You have no projects yet. <Link className="text-primary underline" href="/projects">Create your first project</Link> to start debugging.
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {LABELS.map(([k, label]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold" data-testid={`stat-${k}`}>{data.totals[k] ?? 0}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <h2 className="mb-1 font-medium">AI requests, last 14 days</h2>
          <p className="mb-3 text-xs text-muted-foreground">{data.usage.requests} {data.usage.requests === 1 ? "request" : "requests"} · {data.usage.tokens.toLocaleString()} tokens. {data.usage.token_note}</p>
          {data.usage.last_14_days.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No AI usage yet.</p>
          ) : (
            <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Requests per day">
              {data.usage.last_14_days.map((d) => (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.requests} requests, ${d.tokens} tokens`}>
                  <div className="w-full rounded-t bg-primary" style={{ height: `${(d.requests / max) * 100}%`, minHeight: 4 }} />
                  <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-medium">Review findings</h2>
          {Object.keys(data.findings_by_severity).length === 0 ? (
            <p className="text-sm text-muted-foreground">No review findings yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {["critical", "high", "medium", "low", "info"].filter((s) => data.findings_by_severity[s]).map((s) => (
                <li key={s} className="flex items-center justify-between"><SeverityBadge severity={s} /> <span>{data.findings_by_severity[s]}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageBody>
  );
}
