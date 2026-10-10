"use client";
import { Check, Copy } from "lucide-react";
import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

/** Renders model output. HTML is never interpreted and the tree is sanitized (defence in depth). */
export function Markdown({ children, onInsertCode }: { children: string; onInsertCode?: (code: string) => void }) {
  return (
    <div className="prose-ai">
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          ),
          pre: ({ children }) => {
            const code = textOf(children).replace(/\n$/, "");
            return (
              <div className="my-2 overflow-hidden rounded-md border">
                <div className="flex items-center justify-end gap-1 border-b bg-muted/60 px-2 py-1">
                  <CopyButton text={code} label="Copy code" />
                  {onInsertCode && (
                    <button type="button" className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-muted" onClick={() => onInsertCode(code)}>
                      Propose as change
                    </button>
                  )}
                </div>
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
