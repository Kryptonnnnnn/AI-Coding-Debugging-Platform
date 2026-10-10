"use client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page";
import { Button, Card, ErrorState, Spinner } from "@/components/ui";
import { ReviewView } from "@/features/review-view";
import { useAsync } from "@/hooks/use-async";
import { del, get } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Review } from "@/types/api";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => get<Review>(`/reviews/${id}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState error={error ?? "Not found"} retry={reload} />;
  return (
    <PageBody>
      <PageHeader title="Code review" description={new Date(data.created_at).toLocaleString()}
        actions={<div className="flex gap-2"><Link href="/reviews" className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">All reviews</Link>
          <Button variant="outline" onClick={async () => { if (!window.confirm("Delete this review?")) return; try { await del(`/reviews/${id}`); router.replace("/reviews"); } catch (e) { toast.error(e); } }}><Trash2 className="h-4 w-4 text-danger" /> Delete</Button></div>} />
      <Card className="p-4"><ReviewView review={data} /></Card>
    </PageBody>
  );
}
