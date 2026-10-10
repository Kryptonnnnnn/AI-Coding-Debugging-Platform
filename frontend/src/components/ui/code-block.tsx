"use client";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import { useMemo } from "react";
import { CopyButton } from "@/components/markdown";
import { cn } from "@/lib/utils";

const LANGS: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = { bash, cpp, go, java, javascript, json, python, sql, typescript };
for (const [n, l] of Object.entries(LANGS)) hljs.registerLanguage(n, l);
const ALIAS: Record<string, string> = { c: "cpp", shell: "bash", text: "plaintext", markdown: "plaintext" };

/** Syntax-highlighted, read-only code with line numbers and copy. highlight.js escapes all input. */
export function CodeBlock({ code, language = "text", title, className, maxHeight = 320 }: { code: string; language?: string; title?: string; className?: string; maxHeight?: number }) {
  const html = useMemo(() => {
    const lang = ALIAS[language] ?? language;
    if (!hljs.getLanguage(lang)) return null;
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value.split("\n");
  }, [code, language]);
  const lines = html ?? code.split("\n");
  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", className)}>
      <div className="flex items-center justify-between border-b bg-muted/40 px-2.5 py-1">
        <span className="font-mono text-2xs text-muted-foreground">{title ?? language}</span>
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="overflow-auto py-2 font-mono text-xs leading-5" style={{ maxHeight }}>
        <code>
          {lines.map((l, i) => (
            <div key={i} className="flex px-0">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground/60">{i + 1}</span>
              {html ? <span className="whitespace-pre pr-3" dangerouslySetInnerHTML={{ __html: l || " " }} /> : <span className="whitespace-pre pr-3">{l || " "}</span>}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
