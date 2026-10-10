"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Input, Label } from "@/components/ui";
import { post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Project } from "@/types/api";

/** Creates a real project through the API, then opens its workspace (optionally with a query hint). */
export function CreateProjectDialog({ open, onClose, query = "", title = "New project" }: { open: boolean; onClose: () => void; query?: string; title?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await post<Project>("/projects", { name: name.trim() });
      toast.ok("Project created");
      onClose();
      router.push(`/projects/${p.id}${query}`);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} description="A project holds your files, version history and saved analyses.">
      <form onSubmit={submit} className="space-y-3">
        <div><Label htmlFor="cp-name">Project name</Label><Input id="cp-name" required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. payments-service" /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create project</Button></div>
      </form>
    </Dialog>
  );
}
