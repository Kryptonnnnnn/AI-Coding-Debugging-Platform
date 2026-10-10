"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { ApiError } from "@/lib/api";

interface T { id: number; kind: "ok" | "error"; text: string }
const Ctx = createContext<{ ok: (t: string) => void; error: (e: unknown) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((kind: T["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 6000);
  }, []);
  const ok = useCallback((t: string) => push("ok", t), [push]);
  const error = useCallback((e: unknown) => push("error", e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong"), [push]);
  return (
    <Ctx.Provider value={{ ok, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm shadow-lg">
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss notification" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
