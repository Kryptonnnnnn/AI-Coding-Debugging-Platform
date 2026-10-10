"use client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page";
import { Button, Card, ErrorState, Skeleton, useConfirm } from "@/components/ui";
import { ReviewView } from "@/features/review-view";
import { useAsync } from "@/hooks/use-async";
import { del, get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Review } from "@/types/api";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useAsync(() => get<Review>(`/reviews/${id}`), [id]);
  if (loading) return <PageBody><Skeleton className="h-64" /></PageBody>;
  if (error || !data) return <ErrorState error={error ?? "Not found"} retry={reload} />;
  return (
    <PageBody>
      <PageHeader title="Code review" description={new Date(data.created_at).toLocaleString()}
        actions={<div className="flex gap-2"><Link href="/reviews" className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-[13px] font-medium hover:bg-muted">All reviews</Link>
          <Button variant="outline" onClick={async () => { if (!(await confirm({ title: "Delete this review?", tone: "danger", confirmLabel: "Delete", body: "The review and its findings are removed permanently." }))) return; try { await del(`/reviews/${id}`); router.replace("/reviews"); } catch (e) { toast.error(e); } }}><Trash2 className="h-3.5 w-3.5 text-danger" /> Delete</Button></div>} />
      <Card className="p-4"><ReviewView review={data} /></Card>
    </PageBody>
  );
}
