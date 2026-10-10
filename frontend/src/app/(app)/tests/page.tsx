"use client";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Badge, Card, EmptyState, ErrorState, Pagination, ListSkeleton } from "@/components/ui";
import { TestView } from "@/features/test-view";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { GeneratedTest, Page } from "@/types/api";

export default function TestsPage() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => get<Page<GeneratedTest>>(`/tests?page=${page}`), [page]);
  useEffect(() => { setOpen(new URLSearchParams(window.location.search).get("open")); }, []);
  const selected = data?.items.find((t) => t.id === open);
  return (
    <PageBody>
      <PageHeader title="Test generation" description="Generate tests from a file in a project workspace (Tests tab). Generated tests are labelled until they are actually executed." />
      {loading ? <ListSkeleton /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
        <Card><EmptyState title="No generated tests yet" hint="Open a source file in a project and use the Tests tab." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Card className="divide-y self-start">
            {data.items.map((t) => (
              <button key={t.id} onClick={() => setOpen(t.id)} className={`block w-full p-3 text-left hover:bg-muted ${open === t.id ? "bg-primary/5" : ""}`}>
                <p className="truncate text-sm font-medium">{t.test_path}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Badge>{t.framework}</Badge>{t.saved ? "saved" : "not saved"} · {formatDate(t.created_at)}</p>
              </button>
            ))}
            <Pagination page={page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </Card>
          <Card className="p-4">{selected ? <TestView key={selected.id} test={selected} onSaved={reload} /> : <EmptyState title="Select a generated test" />}</Card>
        </div>
      )}
    </PageBody>
  );
}
