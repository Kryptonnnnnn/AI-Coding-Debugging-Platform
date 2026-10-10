"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { get, post, tokenStore } from "@/lib/api";
import type { User } from "@/types/api";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    get<User>("/auth/me")
      .then((u) => alive && setUser(u))
      .catch(() => tokenStore.clear())
      .finally(() => alive && setLoading(false));
    const onUnauth = () => setUser(null);
    window.addEventListener("aicp:unauthorized", onUnauth);
    return () => {
      alive = false;
      window.removeEventListener("aicp:unauthorized", onUnauth);
    };
  }, []);

  const finish = (r: { access_token: string; user: User }) => {
    tokenStore.set(r.access_token);
    setUser(r.user);
  };
  const login = useCallback(async (email: string, password: string) => finish(await post("/auth/login", { email, password })), []);
  const register = useCallback(
    async (email: string, password: string, display_name: string) => finish(await post("/auth/register", { email, password, display_name })),
    [],
  );
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
