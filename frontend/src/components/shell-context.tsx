"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface Crumb { label: string; href?: string }
interface Ctx { crumbs: Crumb[] | null; setCrumbs: (c: Crumb[] | null) => void }
const C = createContext<Ctx>({ crumbs: null, setCrumbs: () => {} });

/** Pages (e.g. the workspace) publish richer breadcrumbs than the pathname alone can give. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const v = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export const useShell = () => useContext(C);
