"use client";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Card, EmptyState, ErrorState, Pagination, SeverityBadge, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Page, Review } from "@/types/api";

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => get<Page<Review>>(`/reviews?page=${page}`), [page]);
  return (
    <PageBody>
      <PageHeader title="Code reviews" description="Start a review from a project workspace (Review tab). Results are saved here." />
      {loading ? <Spinner /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
        <Card><EmptyState title="No reviews yet" hint="Open a project and run a quick, standard or deep review." action={<Link href="/projects" className="text-primary underline">Go to projects</Link>} /></Card>
      ) : (
        <Card className="divide-y">
          {data.items.map((r) => (
            <Link key={r.id} href={`/reviews/${r.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted">
              <Badge tone="primary">{r.depth}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{r.scope.join(", ")}</span>
              <span className="flex gap-1">{["critical", "high", "medium", "low", "info"].filter((s) => r.counts?.[s]).map((s) => <span key={s} className="flex items-center gap-0.5"><SeverityBadge severity={s} />{r.counts?.[s]}</span>)}</span>
              <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
            </Link>
          ))}
          <Pagination page={page} pageSize={data.page_size} total={data.total} onChange={setPage} />
        </Card>
      )}
    </PageBody>
  );
}
