"use client";
import { Save } from "lucide-react";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { CopyButton } from "@/components/markdown";
import { UnifiedDiff } from "@/editor/code-editor";
import { ApiError, post } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { GeneratedTest } from "@/types/api";

export function TestView({ test, onSaved }: { test: GeneratedTest; onSaved?: () => void }) {
  const toast = useToast();
  const [saved, setSaved] = useState(test.saved);
  const [busy, setBusy] = useState(false);
  const d = test.details;

  async function save(overwrite = false) {
    setBusy(true);
    try {
      await post(`/tests/${test.id}/save`, { overwrite });
      setSaved(true);
      toast.ok(`Saved to ${test.test_path}`);
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === "duplicate_file" && window.confirm(`${test.test_path} already exists. Replace it? The old content stays in version history.`)) return save(true);
      toast.error(e);
    } finally { setBusy(false); }
  }

  return (
    <article aria-label="Generated tests" className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{test.framework}</Badge>
        <Badge tone="warn" title="No code was executed to produce these tests' results">{test.status_label}</Badge>
        {d.syntax_valid === true && <Badge tone="ok" title="Confirmed by the Python parser">syntax valid</Badge>}
        {d.syntax_valid === false && <Badge tone="danger">syntax error in generated code</Badge>}
        <Badge title="Coverage is only reported when a coverage tool measured it">coverage: {d.coverage}</Badge>
        <code className="text-xs">{test.test_path}</code>
        <div className="ml-auto flex gap-1">
          <CopyButton text={test.code} label="Copy tests" />
          <Button size="sm" onClick={() => save()} loading={busy} disabled={saved}><Save className="h-3.5 w-3.5" /> {saved ? "Saved to project" : "Save to project"}</Button>
        </div>
      </div>
      {test.description && <p className="mt-2">{test.description}</p>}
      {d.behaviors.length > 0 && <><h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Behaviors tested</h3><ul className="list-disc pl-5">{d.behaviors.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
      {d.branches_covered.length > 0 && <><h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Branches targeted</h3><ul className="list-disc pl-5">{d.branches_covered.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
      {d.fixtures_mocks.length > 0 && <><h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Fixtures &amp; mocks</h3><ul className="list-disc pl-5">{d.fixtures_mocks.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
      {d.setup_instructions && <><h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Setup</h3><div className="flex items-center gap-2"><code className="flex-1 overflow-auto rounded bg-muted p-2 text-xs">{d.setup_instructions}</code><CopyButton text={d.setup_instructions} label="Copy command" /></div></>}
      <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Diff preview (new file vs. project)</h3>
      <div className="mt-1 max-h-80 overflow-auto"><UnifiedDiff diff={test.diff} /></div>
    </article>
  );
}
