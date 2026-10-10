import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";

export function renderApp(ui: ReactElement) {
  return render(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown; text?: string } | Promise<{ status?: number; body?: unknown; text?: string }>;

/** Installs a fetch mock. Handlers are matched by `METHOD path` prefix (path excludes the /api/v1 base). */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, "");
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) return new Response(JSON.stringify({ error: { code: "not_mocked", message: `No mock for ${method} ${path}` } }), { status: 500, headers: { "content-type": "application/json" } });
    const r = await routes[key](path, init);
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 200, headers: { "content-type": "text/plain" } });
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}
