"use client";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { TestView } from "@/features/test-view";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { GeneratedTest } from "@/types/api";
import type { WorkspaceCtx } from "./types";

export function TestsPanel({ ctx }: { ctx: WorkspaceCtx }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<GeneratedTest | null>(null);
  async function run() {
    if (!ctx.file) return;
    setBusy(true); setTest(null);
    try {
      const f = await ctx.saveNow();
      setTest(await post<GeneratedTest>("/tests/generate", { project_id: ctx.projectId, file_id: (f ?? ctx.file).id }));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }
  if (!ctx.file) return <EmptyState title="Open a file to generate tests" />;
  return (
    <div className="h-full overflow-auto p-3">
      <Button className="w-full" onClick={run} loading={busy}><FlaskConical className="h-4 w-4" /> Generate tests for {ctx.file.path}</Button>
      <p className="mt-1 text-xs text-muted-foreground">Supported: Python (pytest), JavaScript/TypeScript (Vitest/Jest). Tests are not run unless the sandbox is enabled.</p>
      <div className="mt-4 border-t pt-3">{busy ? <Spinner label="Generating" /> : test ? <TestView key={test.id} test={test} onSaved={ctx.refresh} /> : <EmptyState title="No tests generated yet" />}</div>
    </div>
  );
}
