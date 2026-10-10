"use client";
import { Archive, ArchiveRestore, FolderKanban, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader, SearchBar } from "@/components/page";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, Label, ListSkeleton, Menu, MenuItem, MenuSeparator, Pagination, Textarea, useConfirm } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { del, get, patch, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Page, Project } from "@/types/api";

export default function ProjectsPage() {
  const toast = useToast();
  const confirm = useConfirm();
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
    if (!(await confirm({ title: `Delete “${p.name}”?`, tone: "danger", confirmLabel: "Delete project", body: "All its files, version history, reports and patches are deleted permanently." }))) return;
    try { await del(`/projects/${p.id}`); toast.ok("Project deleted"); reload(); } catch (e) { toast.error(e); }
  }

  return (
    <PageBody>
      <PageHeader title="My projects" description="Each project holds your files, version history and saved analyses."
        actions={<Button onClick={() => open("new")}><Plus className="h-3.5 w-3.5" /> New project</Button>} />
      <SearchBar>
        <div className="relative w-64 max-w-full"><Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label="Search projects" placeholder="Search projects…" className="pl-7" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Button variant={archived ? "primary" : "outline"} onClick={() => { setArchived(!archived); setPage(1); }}>
          {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {archived ? "Showing archived" : "Show archived"}
        </Button>
      </SearchBar>
      <Card className="overflow-hidden">
        {loading ? <ListSkeleton /> : error || !data ? <ErrorState error={error ?? "No data"} retry={reload} /> : data.items.length === 0 ? (
          <EmptyState icon={<FolderKanban className="h-4 w-4" />} title={q ? "No matching projects" : archived ? "No archived projects" : "No projects yet"} hint={q ? "Try a different search." : "Create a project, then paste or upload code."}
            action={!q && !archived ? <Button onClick={() => open("new")}>Create project</Button> : undefined} />
        ) : (
          <>
            <div className="hidden grid-cols-[1fr_6rem_10rem_2rem] gap-3 border-b bg-muted/30 px-3 py-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground sm:grid"><span>Name</span><span>Files</span><span>Updated</span><span /></div>
            <ul className="divide-y">
              {data.items.map((p) => (
                <li key={p.id} className="grid grid-cols-[1fr_2rem] items-center gap-3 px-3 py-2.5 hover:bg-muted/30 sm:grid-cols-[1fr_6rem_10rem_2rem]">
                  <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><FolderKanban className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0"><span className="flex items-center gap-1.5 text-[13px] font-medium hover:text-primary">{p.name}{p.archived && <Badge>archived</Badge>}</span><span className="block truncate text-xs text-muted-foreground">{p.description || "No description"}</span></span>
                  </Link>
                  <span className="hidden text-xs tabular-nums sm:block">{p.file_count}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(p.updated_at)}</span>
                  <Menu label={`Actions for ${p.name}`} trigger={<MoreHorizontal className="m-1 h-4 w-4 text-muted-foreground" />}>
                    <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onSelect={() => open(p)}>Rename / edit</MenuItem>
                    <MenuItem icon={p.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} onSelect={() => toggleArchive(p)}>{p.archived ? "Restore" : "Archive"}</MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} danger onSelect={() => remove(p)}>Delete…</MenuItem>
                  </Menu>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={12} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
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
