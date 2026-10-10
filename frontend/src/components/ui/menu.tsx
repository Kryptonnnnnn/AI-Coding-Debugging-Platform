"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Accessible dropdown: Enter/Space/ArrowDown opens, arrows move, Escape closes and returns focus. */
export function Menu({ trigger, children, align = "right", label }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative inline-block">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center rounded-md hover:bg-muted">{trigger}</button>
      {open && (
        <div role="menu" aria-label={label} onClick={() => setOpen(false)}
          className={cn("absolute z-50 mt-1 min-w-48 overflow-hidden rounded-lg border bg-elevated p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onSelect, danger, icon, disabled }: { children: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button role="menuitem" type="button" disabled={disabled} onClick={onSelect}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-50", danger && "text-danger")}>
      {icon}{children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
