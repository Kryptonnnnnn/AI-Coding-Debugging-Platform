"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page";
import { Card, ErrorState, Skeleton } from "@/components/ui";
import { PatchReview } from "@/features/patch-review";
import { useAsync } from "@/hooks/use-async";
import { get } from "@/lib/api";
import type { FileMeta, Patch } from "@/types/api";

export default function PatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(async () => {
    const p = await get<Patch>(`/patches/${id}`);
    const files = await get<FileMeta[]>(`/projects/${p.project_id}/files`);
    return { p, language: files.find((f) => f.id === p.file_id)?.language ?? "text", path: files.find((f) => f.id === p.file_id)?.path ?? "" };
  }, [id]);
  if (loading) return <PageBody><Skeleton className="h-64" /></PageBody>;
  if (error || !data) return <ErrorState error={error ?? "Not found"} retry={reload} />;
  return (
    <PageBody>
      <PageHeader title="Patch review" description={data.path} actions={<Link className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-[13px] font-medium hover:bg-muted" href={`/projects/${data.p.project_id}`}>Open project</Link>} />
      <Card className="h-[70vh] p-4"><PatchReview patch={data.p} language={data.language} path={data.path} /></Card>
    </PageBody>
  );
}
