import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** CSS-only tooltip: shows on hover and keyboard focus. The wrapped control still needs its own aria-label. */
export function Tooltip({ label, children, side = "bottom", shortcut, align = "center" }: { label: string; children: ReactNode; side?: "top" | "bottom" | "right"; shortcut?: string; align?: "center" | "end" }) {
  const pos = { top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2", bottom: align === "end" ? "top-full right-0 mt-1.5" : "top-full left-1/2 mt-1.5 -translate-x-1/2", right: "left-full top-1/2 ml-1.5 -translate-y-1/2" }[side];
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span role="tooltip" className={cn("pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md border bg-elevated px-2 py-1 text-2xs text-foreground shadow-pop group-hover/tt:block group-focus-within/tt:block", pos)}>
        {label}
        {shortcut && <span className="ml-1.5 font-mono text-muted-foreground">{shortcut}</span>}
      </span>
    </span>
  );
}
