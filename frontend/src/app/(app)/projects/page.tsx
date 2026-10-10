"use client";
import { Archive, ArchiveRestore, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/page";
import { Button, Card, Dialog, EmptyState, ErrorState, Input, Label, Pagination, Spinner, Textarea } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { del, get, patch, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Page, Project } from "@/types/api";

export default function ProjectsPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const { data, error, loading, reload } = useAsync(
    () => get<Page<Project>>(`/projects?q=${encodeURIComponent(q)}&page=${page}&page_size=12&archived=${archived}`),
    [q, page, archived],
  );

  function open(p: Project | "new") {
    setEditing(p);
    setName(p === "new" ? "" : p.name);
    setDesc(p === "new" ? "" : p.description);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing === "new") await post("/projects", { name, description: desc });
      else if (editing) await patch(`/projects/${editing.id}`, { name, description: desc });
      toast.ok("Project saved");
      setEditing(null);
      reload();
    } catch (err) { toast.error(err); }
  }
  async function toggleArchive(p: Project) {
    try { await patch(`/projects/${p.id}`, { archived: !p.archived }); toast.ok(p.archived ? "Project restored" : "Project archived"); reload(); } catch (e) { toast.error(e); }
  }
  async function remove(p: Project) {
    if (!window.confirm(`Delete “${p.name}” and all its files, versions and reports? This cannot be undone.`)) return;
    try { await del(`/projects/${p.id}`); toast.ok("Project deleted"); reload(); } catch (e) { toast.error(e); }
  }

  return (
    <PageBody>
      <PageHeader title="My projects" description="Each project holds your files, version history and saved analyses."
        actions={<Button onClick={() => open("new")}><Plus className="h-4 w-4" /> New project</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search projects" placeholder="Search projects…" className="max-w-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Button variant={archived ? "primary" : "outline"} onClick={() => { setArchived(!archived); setPage(1); }}>
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {archived ? "Showing archived" : "Show archived"}
        </Button>
      </div>
      {loading ? <Spinner /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
        <Card><EmptyState title={q ? "No matching projects" : archived ? "No archived projects" : "No projects yet"} hint={q ? "Try a different search." : "Create a project, then paste or upload code."}
          action={!q && !archived ? <Button onClick={() => open("new")}>Create project</Button> : undefined} /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p) => (
              <Card key={p.id} className="flex flex-col p-4">
                <Link href={`/projects/${p.id}`} className="flex items-center gap-2 font-medium hover:text-primary"><FolderKanban className="h-4 w-4" /> {p.name}</Link>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || "No description"}</p>
                <p className="mt-2 text-xs text-muted-foreground">{p.file_count} files · updated {formatDate(p.updated_at)}</p>
                <div className="mt-3 flex gap-1">
                  <Button size="sm" variant="outline" aria-label={`Rename ${p.name}`} onClick={() => open(p)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="outline" aria-label={`${p.archived ? "Restore" : "Archive"} ${p.name}`} onClick={() => toggleArchive(p)}>{p.archived ? "Restore" : "Archive"}</Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={12} total={data.total} onChange={setPage} />
        </>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New project" : "Edit project"}>
        <form onSubmit={save} className="space-y-3">
          <div><Label htmlFor="pname">Name</Label><Input id="pname" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><Label htmlFor="pdesc">Description</Label><Textarea id="pdesc" rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Dialog>
    </PageBody>
  );
}
