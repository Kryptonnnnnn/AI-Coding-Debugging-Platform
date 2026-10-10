"use client";
import { Check, Columns2, FileDiff, Rows2, RotateCcw, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { CopyButton, Markdown } from "@/components/markdown";
import { DiffView, UnifiedDiff } from "@/editor/code-editor";
import { cn } from "@/lib/utils";
import type { Patch } from "@/types/api";
import { PatchVerification } from "./patch-verification";
import { usePatchActions } from "./use-patch";

const STATUS_TONE = { applied: "ok", rejected: "danger", proposed: "warn" } as const;

/** Diff of a proposed change with apply / reject / restore controls. Nothing changes until the user confirms. */
export function PatchReview({ patch: initial, language, path, onResolved }: { patch: Patch; language: string; path?: string; onResolved?: (p: Patch) => void }) {
  const [mode, setMode] = useState<"side" | "inline" | "unified">("side");
  const { patch, busy, apply, reject, restore, restored } = usePatchActions(initial, { path, onChange: onResolved });
  const modes = [
    { id: "side", label: "Side by side", icon: Columns2 },
    { id: "inline", label: "Inline", icon: Rows2 },
    { id: "unified", label: "Unified text", icon: FileDiff },
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold">{patch.title}</h3>
          <p className="font-mono text-2xs text-muted-foreground">{path ?? "file"}</p>
        </div>
        <Badge tone={STATUS_TONE[patch.status]}>{patch.status}</Badge>
        <span className="font-mono text-2xs"><span className="text-ok">+{patch.added}</span> <span className="text-danger">−{patch.removed}</span></span>
        <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Diff view mode">
          {modes.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", mode === m.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <m.icon className="h-3 w-3" /> {m.label}
            </button>
          ))}
        </div>
      </div>
      {patch.explanation && (
        <details className="rounded-md border bg-card/50 px-3 py-2 text-[13px]" open>
          <summary className="text-xs font-medium text-muted-foreground">Why this change</summary>
          <Markdown>{patch.explanation}</Markdown>
        </details>
      )}
      <div className="min-h-[220px] flex-1 overflow-hidden rounded-md border">
        {mode === "unified" || patch.original_content === undefined ? (
          <div className="h-full overflow-auto"><UnifiedDiff diff={patch.diff} /></div>
        ) : (
          <DiffView original={patch.original_content} modified={patch.proposed_content ?? ""} language={language} sideBySide={mode === "side"} />
        )}
      </div>
      <div className="max-h-[40%] overflow-auto"><PatchVerification patchId={patch.id} initial={patch.verification} status={patch.status} /></div>
      <div className="flex flex-wrap items-center gap-2">
        {patch.status === "proposed" ? (
          <>
            <Button onClick={apply} loading={busy === "apply"} disabled={!!busy}><Check className="h-3.5 w-3.5" /> Apply patch</Button>
            <Button variant="outline" onClick={reject} loading={busy === "reject"} disabled={!!busy}><X className="h-3.5 w-3.5" /> Reject</Button>
            <p className="text-xs text-muted-foreground">Nothing changes until you apply.</p>
          </>
        ) : patch.status === "applied" ? (
          <>
            <Button variant="outline" onClick={restore} loading={busy === "restore"} disabled={!!busy || restored}><RotateCcw className="h-3.5 w-3.5" /> {restored ? "Previous version restored" : "Restore previous version"}</Button>
            <p className="text-xs text-muted-foreground">Applied. The earlier version is kept in history.</p>
          </>
        ) : <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Undo2 className="h-3 w-3" /> Rejected. No files were changed.</p>}
        <span className="ml-auto"><CopyButton text={patch.proposed_content ?? patch.diff} label="Copy fix" /></span>
      </div>
    </div>
  );
}
