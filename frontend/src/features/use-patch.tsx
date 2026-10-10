"use client";
import { useCallback, useState } from "react";
import { useConfirm } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Patch, Version } from "@/types/api";

/**
 * Patch lifecycle against the real API. Status only changes after the backend confirms.
 * Applying always goes through an explicit confirmation dialog.
 */
export function usePatchActions(initial: Patch, opts: { path?: string; onChange?: (p: Patch) => void } = {}) {
  const [patch, setPatch] = useState(initial);
  const [busy, setBusy] = useState<"apply" | "reject" | "restore" | null>(null);
  const [restored, setRestored] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const { onChange, path } = opts;

  const apply = useCallback(async () => {
    const ok = await confirm({
      title: "Apply this patch?",
      confirmLabel: "Apply patch",
      body: <>This will change <code className="font-mono text-foreground">{path ?? "the file"}</code> (+{patch.added} / −{patch.removed} lines). The current version stays in history so you can restore it.</>,
    });
    if (!ok) return;
    setBusy("apply");
    try {
      const p = await post<Patch>(`/patches/${patch.id}/apply`);
      setPatch(p); onChange?.(p);
      toast.ok("Patch applied. The previous version is saved in history.");
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  }, [confirm, patch, path, onChange, toast]);

  const reject = useCallback(async () => {
    setBusy("reject");
    try {
      const p = await post<Patch>(`/patches/${patch.id}/reject`);
      setPatch(p); onChange?.(p);
      toast.ok("Patch rejected. No files were changed.");
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  }, [patch.id, onChange, toast]);

  /** Restores the file version that existed immediately before this patch was applied. */
  const restore = useCallback(async () => {
    setBusy("restore");
    try {
      const versions = await get<Version[]>(`/projects/${patch.project_id}/files/${patch.file_id}/versions`);
      const applied = versions.find((v) => v.patch_id === patch.id);
      const prev = applied && versions.find((v) => v.version_no === applied.version_no - 1);
      if (!prev) throw new Error("The version before this patch could not be found in history.");
      const ok = await confirm({ title: `Restore version ${prev.version_no}?`, confirmLabel: "Restore", body: "The file returns to its content before the patch. The patched content stays in history." });
      if (!ok) return;
      await post(`/projects/${patch.project_id}/files/${patch.file_id}/versions/${prev.id}/restore`);
      setRestored(true); onChange?.(patch);
      toast.ok(`Restored version ${prev.version_no}`);
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  }, [patch, confirm, onChange, toast]);

  return { patch, busy, apply, reject, restore, restored };
}
