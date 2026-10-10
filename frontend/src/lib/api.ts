const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "") + "/api/v1";
const TOKEN_KEY = "aicp.token";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

type Opts = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

async function toError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed (${res.status})`;
  try {
    const j = await res.json();
    if (j?.error) {
      code = j.error.code;
      message = j.error.message;
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, code, message);
}

function headers(json: boolean): HeadersInit {
  const h: Record<string, string> = {};
  const t = tokenStore.get();
  if (t) h.Authorization = `Bearer ${t}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: headers(!!opts.body),
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server. Check that the backend is running.");
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    tokenStore.clear();
    window.dispatchEvent(new Event("aicp:unauthorized"));
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body ?? {} });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body });
export const del = (p: string) => api<void>(p, { method: "DELETE" });

/** Parses a text/event-stream response from POST. Calls onEvent for each SSE event. */
export async function streamPost(path: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(BASE + path, { method: "POST", headers: headers(true), body: JSON.stringify(body), signal });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server.");
  }
  if (!res.ok || !res.body) throw await toError(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = /^event: (.*)$/m.exec(raw)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      try {
        onEvent(ev, data ? JSON.parse(data) : null);
      } catch {
        /* ignore malformed event */
      }
    }
  }
}

export async function downloadText(path: string, filename: string) {
  const text = await api<string>(path);
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
