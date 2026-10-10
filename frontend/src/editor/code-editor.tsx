"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { monacoLanguage } from "@/lib/utils";

const Monaco = dynamic(() => import("@monaco-editor/react").then((m) => m.default), { ssr: false, loading: () => <Spinner label="Loading editor" /> });
const Diff = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false, loading: () => <Spinner label="Loading diff" /> });

function useMonacoTheme() {
  const [t, setT] = useState("light");
  useEffect(() => {
    const read = () => setT(document.documentElement.classList.contains("dark") ? "vs-dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return t;
}

export function CodeEditor({ value, language, onChange, readOnly, onSelection, path }: {
  value: string; language: string; onChange?: (v: string) => void; readOnly?: boolean; path?: string;
  onSelection?: (text: string) => void;
}) {
  const theme = useMonacoTheme();
  return (
    <Monaco
      height="100%"
      path={path}
      language={monacoLanguage(language)}
      value={value}
      theme={theme}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={(editor) => {
        editor.onDidChangeCursorSelection(() => {
          const sel = editor.getSelection();
          const model = editor.getModel();
          onSelection?.(sel && model && !sel.isEmpty() ? model.getValueInRange(sel) : "");
        });
      }}
      options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, wordWrap: "on", ariaLabel: "Code editor" }}
    />
  );
}

export function DiffView({ original, modified, language, sideBySide = true }: { original: string; modified: string; language: string; sideBySide?: boolean }) {
  const theme = useMonacoTheme();
  return (
    <Diff
      height="100%"
      language={monacoLanguage(language)}
      original={original}
      modified={modified}
      theme={theme}
      options={{ readOnly: true, renderSideBySide: sideBySide, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
    />
  );
}

/** Plain unified diff with +/- highlighting. Works without Monaco and is what tests assert against. */
export function UnifiedDiff({ diff }: { diff: string }) {
  if (!diff.trim()) return <p className="p-3 text-sm text-muted-foreground">No changes.</p>;
  return (
    <pre className="overflow-auto rounded-md border bg-card p-0 text-xs leading-5" aria-label="Unified diff">
      {diff.split("\n").map((l, i) => (
        <div key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "bg-ok/15 px-3" : l.startsWith("-") && !l.startsWith("---") ? "bg-danger/15 px-3" : l.startsWith("@@") ? "bg-primary/10 px-3 text-primary" : "px-3 text-muted-foreground"}>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
