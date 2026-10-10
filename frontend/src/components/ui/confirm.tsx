"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Dialog } from "./index";

interface Opts { title: string; body?: ReactNode; confirmLabel?: string; tone?: "primary" | "danger" }
type Ask = (o: Opts) => Promise<boolean>;
const Ctx = createContext<Ask | null>(null);

/** Promise-based replacement for window.confirm with a proper accessible dialog. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback<Ask>((o) => new Promise((res) => { resolver.current = res; setOpts(o); }), []);
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Dialog open={!!opts} onClose={() => close(false)} title={opts?.title ?? ""}>
        {opts?.body && <div className="mb-4 text-[13px] text-muted-foreground">{opts.body}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button variant={opts?.tone === "danger" ? "danger" : "primary"} onClick={() => close(true)} autoFocus>{opts?.confirmLabel ?? "Confirm"}</Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): Ask {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfirm outside ConfirmProvider");
  return c;
}
