"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export { Tooltip } from "./tooltip";
export { Menu, MenuItem, MenuSeparator } from "./menu";
export { ConfirmProvider, useConfirm } from "./confirm";
export { CodeBlock } from "./code-block";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-card hover:brightness-110",
        outline: "border bg-card hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        danger: "bg-danger text-background hover:brightness-110",
      },
      size: { sm: "h-7 px-2.5", md: "h-8 px-3", icon: "h-7 w-7" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

const field = "w-full rounded-md border bg-background px-2.5 text-[13px] placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 disabled:opacity-60";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-8", className)} {...p} />
));
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "py-1.5", className)} {...p} />
));
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-8 pr-6", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted-foreground">{children}</label>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border bg-card shadow-card", className)}>{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-2xs text-muted-foreground">{children}</kbd>;
}

const tones = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return <span title={title} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium leading-4", tones[tone], className)}>{children}</span>;
}

const sevTone: Record<string, Tone> = { critical: "danger", high: "danger", medium: "warn", low: "primary", info: "neutral" };
export function SeverityBadge({ severity }: { severity: string }) {
  const label = severity === "info" ? "Info" : severity[0].toUpperCase() + severity.slice(1);
  return (
    <Badge tone={sevTone[severity] ?? "neutral"} title={severity === "info" ? "Informational" : undefined}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", severity === "critical" && "ring-2 ring-current/30")} aria-hidden />
      {label}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-6 text-[13px] text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  );
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground" aria-hidden>{icon ?? <Inbox className="h-4 w-4" />}</div>
      <p className="text-[13px] font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error | string; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-danger/15 text-danger" aria-hidden><AlertTriangle className="h-4 w-4" /></div>
      <p className="text-[13px] font-medium">Something went wrong</p>
      <p className="max-w-md text-xs text-muted-foreground">{typeof error === "string" ? error : error.message}</p>
      {retry && <Button variant="outline" size="sm" className="mt-2" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, wide, description }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; description?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); }
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => { window.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn("flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border bg-elevated shadow-pop", wide ? "max-w-5xl" : "max-w-md")}>
        <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button aria-label="Close dialog" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label = "Panels" }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-0.5 overflow-x-auto border-b bg-card/50 px-1.5">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("relative flex shrink-0 items-center gap-1.5 px-2.5 py-2 text-xs font-medium", value === t.id ? "text-foreground after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs">
      <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /> Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
