"use client";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { DiffView, UnifiedDiff } from "@/editor/code-editor";
import { Badge, Button } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Patch } from "@/types/api";

/** Shows a proposed change as a diff and requires an explicit click to apply or reject it. */
export function PatchReview({ patch, language, onResolved }: { patch: Patch; language: string; onResolved?: (p: Patch) => void }) {
  const [mode, setMode] = useState<"side" | "inline" | "unified">("side");
  const [busy, setBusy] = useState<"apply" | "reject" | null>(null);
  const [current, setCurrent] = useState(patch);
  const toast = useToast();

  async function act(kind: "apply" | "reject") {
    setBusy(kind);
    try {
      const p = await post<Patch>(`/patches/${current.id}/${kind}`);
      setCurrent(p);
      toast.ok(kind === "apply" ? "Patch applied. The previous version is saved in history." : "Patch rejected. No files were changed.");
      onResolved?.(p);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{current.title}</h3>
        <Badge tone={current.status === "applied" ? "ok" : current.status === "rejected" ? "danger" : "warn"}>{current.status}</Badge>
        <span className="text-xs text-muted-foreground">+{current.added} / −{current.removed}</span>
        <div className="ml-auto flex gap-1" role="group" aria-label="Diff view mode">
          {(["side", "inline", "unified"] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? "primary" : "outline"} onClick={() => setMode(m)}>
              {m === "side" ? "Side by side" : m === "inline" ? "Inline" : "Unified text"}
            </Button>
          ))}
        </div>
      </div>
      {current.explanation && (
        <details className="rounded-md border p-2 text-sm" open>
          <summary className="cursor-pointer font-medium">Explanation</summary>
          <Markdown>{current.explanation}</Markdown>
        </details>
      )}
      <div className="min-h-[220px] flex-1 overflow-hidden rounded-md border">
        {mode === "unified" || current.original_content === undefined ? (
          <div className="h-full overflow-auto"><UnifiedDiff diff={current.diff} /></div>
        ) : (
          <DiffView original={current.original_content} modified={current.proposed_content ?? ""} language={language} sideBySide={mode === "side"} />
        )}
      </div>
      {current.status === "proposed" ? (
        <div className="flex gap-2">
          <Button onClick={() => act("apply")} loading={busy === "apply"} disabled={!!busy}><Check className="h-4 w-4" /> Apply patch</Button>
          <Button variant="outline" onClick={() => act("reject")} loading={busy === "reject"} disabled={!!busy}><X className="h-4 w-4" /> Reject</Button>
          <p className="self-center text-xs text-muted-foreground">Nothing changes until you apply.</p>
        </div>
      ) : null}
    </div>
  );
}
