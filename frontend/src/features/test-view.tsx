"use client";
import { FlaskConical, Save } from "lucide-react";
import { useState } from "react";
import { Badge, Button, CodeBlock, useConfirm } from "@/components/ui";
import { UnifiedDiff } from "@/editor/code-editor";
import { ApiError, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { GeneratedTest } from "@/types/api";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <section className="mt-3"><h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><ul className="list-disc space-y-0.5 pl-4">{items.map((b, i) => <li key={i}>{b}</li>)}</ul></section>;
}

export function TestView({ test, onSaved }: { test: GeneratedTest; onSaved?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [saved, setSaved] = useState(test.saved);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"code" | "diff">("code");
  const d = test.details;
  const lang = test.test_path.endsWith(".py") ? "python" : test.test_path.match(/\.(ts|tsx)$/) ? "typescript" : "javascript";

  async function save(overwrite = false): Promise<void> {
    setBusy(true);
    try {
      await post(`/tests/${test.id}/save`, { overwrite });
      setSaved(true);
      toast.ok(`Saved to ${test.test_path}`);
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === "duplicate_file") {
        setBusy(false);
        if (await confirm({ title: `Replace ${test.test_path}?`, confirmLabel: "Replace", body: "The existing file already exists. Its old content stays in version history." })) return save(true);
        return;
      }
      toast.error(e);
    } finally { setBusy(false); }
  }

  return (
    <article aria-label="Generated tests" className="text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent"><FlaskConical className="h-3 w-3" /> {test.framework}</Badge>
        <Badge tone="warn" title="These tests were generated but not run">{test.status_label}</Badge>
        {d.syntax_valid === true && <Badge tone="ok" title="Confirmed by the Python parser">syntax valid</Badge>}
        {d.syntax_valid === false && <Badge tone="danger">syntax error in generated code</Badge>}
        <Badge title="Coverage is only reported when a coverage tool measured it">coverage: {d.coverage}</Badge>
        <div className="ml-auto"><Button size="sm" onClick={() => save()} loading={busy} disabled={saved}><Save className="h-3.5 w-3.5" /> {saved ? "Saved to project" : "Save to project"}</Button></div>
      </div>
      {test.description && <p className="mt-2 text-muted-foreground">{test.description}</p>}
      <div className="mt-3 flex gap-1 border-b" role="tablist" aria-label="Test view">
        {(["code", "diff"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-2.5 py-1.5 text-xs font-medium ${tab === t ? "border-b-2 border-primary" : "text-muted-foreground"}`}>{t === "code" ? "Test code" : "Diff preview"}</button>)}
      </div>
      <div className="mt-2">{tab === "code" ? <CodeBlock code={test.code} language={lang} title={test.test_path} maxHeight={360} /> : <div className="max-h-96 overflow-auto"><UnifiedDiff diff={test.diff} /></div>}</div>
      <List title="Behaviors tested" items={d.behaviors} />
      <List title="Branches targeted" items={d.branches_covered} />
      <List title="Fixtures & mocks" items={d.fixtures_mocks} />
      {d.setup_instructions && <section className="mt-3"><h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Setup</h3><CodeBlock code={d.setup_instructions} language="bash" title="command" maxHeight={80} /></section>}
    </article>
  );
}
