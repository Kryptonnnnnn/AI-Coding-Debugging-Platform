import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, streamPost, tokenStore } from "@/lib/api";
import { mockFetch } from "./helpers";

beforeEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("api client", () => {
  it("sends the bearer token and parses JSON", async () => {
    tokenStore.set("tok123");
    const { fn } = mockFetch({ "GET /projects": () => ({ body: { items: [] } }) });
    expect(await api("/projects")).toEqual({ items: [] });
    expect((fn.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("maps server error envelopes to ApiError", async () => {
    mockFetch({ "POST /debug": () => ({ status: 429, body: { error: { code: "rate_limited", message: "Slow down" } } }) });
    await expect(api("/debug", { method: "POST", body: {} })).rejects.toMatchObject({ status: 429, code: "rate_limited", message: "Slow down" });
  });

  it("reports an unreachable backend clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    const err = (await api("/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network_error");
    expect(err.message).toMatch(/backend is running/);
  });

  it("clears the token and signals on 401 outside auth routes", async () => {
    tokenStore.set("old");
    const onUnauth = vi.fn();
    window.addEventListener("aicp:unauthorized", onUnauth);
    mockFetch({ "GET /projects": () => ({ status: 401, body: { error: { code: "unauthorized", message: "no" } } }) });
    await expect(api("/projects")).rejects.toBeInstanceOf(ApiError);
    expect(tokenStore.get()).toBeNull();
    expect(onUnauth).toHaveBeenCalled();
    window.removeEventListener("aicp:unauthorized", onUnauth);
  });

  it("does not wipe the token for a failed login", async () => {
    tokenStore.set("keep");
    mockFetch({ "POST /auth/login": () => ({ status: 401, body: { error: { code: "unauthorized", message: "bad" } } }) });
    await expect(api("/auth/login", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(tokenStore.get()).toBe("keep");
  });

  it("parses server-sent events across chunk boundaries", async () => {
    const enc = new TextEncoder();
    const chunks = ['event: token\ndata: "he', 'llo"\n\nevent: done\ndata: {}\n\n'];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); } }), { status: 200 })));
    const events: [string, unknown][] = [];
    await streamPost("/conversations/1/stream", {}, (e, d) => events.push([e, d]));
    expect(events).toEqual([["token", "hello"], ["done", {}]]);
  });
});
