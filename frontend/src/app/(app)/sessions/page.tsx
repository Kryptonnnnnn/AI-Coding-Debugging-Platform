"use client";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Card, EmptyState, ErrorState, Input, Pagination, Select, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Page, Session } from "@/types/api";

function target(s: Session) {
  if (!s.ref_id) return null;
  if (s.kind.startsWith("debug")) return `/debug-history?open=${s.ref_id}`;
  if (s.kind === "review") return `/reviews/${s.ref_id}`;
  if (s.kind === "tests") return `/tests?open=${s.ref_id}`;
  return null;
}

export default function SessionsPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => get<Page<Session>>(`/sessions?q=${encodeURIComponent(q)}&kind=${kind}&page=${page}`), [q, kind, page]);
  return (
    <PageBody>
      <PageHeader title="Code sessions" description="Every debugging, review and test-generation run is saved here." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search sessions" placeholder="Search sessions…" className="max-w-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select aria-label="Filter by type" className="w-44" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">All types</option><option value="debug">Debugging</option><option value="review">Reviews</option><option value="tests">Tests</option>
        </Select>
      </div>
      {loading ? <Spinner /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
        <Card><EmptyState title="No sessions yet" hint="Run a debug analysis, review or test generation from a project workspace." /></Card>
      ) : (
        <Card className="divide-y">
          {data.items.map((s) => {
            const href = target(s);
            return (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <Badge tone="primary">{s.kind.replace(":", " · ")}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">{href ? <Link className="hover:text-primary" href={href}>{s.title}</Link> : s.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
              </div>
            );
          })}
          <Pagination page={page} pageSize={data.page_size} total={data.total} onChange={setPage} />
        </Card>
      )}
    </PageBody>
  );
}
