import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(app)/dashboard/page";
import { mockFetch, renderApp } from "./helpers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const totals = (o: Record<string, number> = {}) => ({ projects: 0, files: 0, debug_reports: 0, reviews: 0, generated_tests: 0, patches_applied: 0, patches_rejected: 0, patches_pending: 0, ...o });
const empty = { items: [], total: 0, page: 1, page_size: 5 };
const dash = (t: object, usage: object = { requests: 0, tokens: 0, token_note: "n", last_14_days: [], by_provider: {} }) => ({ totals: t, findings_by_severity: {}, usage });

beforeEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); window.localStorage.setItem("aicp.token", "t"); });

describe("Dashboard", () => {
  it("welcomes first-time users with real next steps and no fabricated metrics", async () => {
    mockFetch({
      "GET /auth/me": () => ({ body: { id: "u", email: "ada@example.com", display_name: "Ada" } }),
      "GET /dashboard": () => ({ body: dash(totals()) }), "GET /projects": () => ({ body: empty }), "GET /sessions": () => ({ body: empty }), "GET /reports": () => ({ body: empty }),
    });
    renderApp(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText("0 of 5 done")).toBeInTheDocument();
    for (const name of ["Upload code", "Debug an error", "Review a file"]) expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText("No debug reports")).toBeInTheDocument();
  });

  it("shows real stats, recent activity and progress for returning users", async () => {
    mockFetch({
      "GET /auth/me": () => ({ body: { id: "u", email: "ada@example.com", display_name: "Ada" } }),
      "GET /dashboard": () => ({ body: dash(totals({ projects: 2, files: 5, debug_reports: 3, patches_applied: 1 }), { requests: 4, tokens: 1234, token_note: "n", last_14_days: [{ date: "2026-10-10", requests: 4, tokens: 1234 }], by_provider: { groq: 4 } }) }),
      "GET /projects": () => ({ body: { items: [{ id: "p1", name: "Alpha", description: "", archived: false, settings: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", file_count: 5 }], total: 1, page: 1, page_size: 5 } }),
      "GET /sessions": () => ({ body: { items: [{ id: "s1", kind: "debug:debug", title: "Division by zero", project_id: "p1", ref_id: "r1", created_at: "2026-01-01T00:00:00Z" }], total: 1, page: 1, page_size: 8 } }),
      "GET /reports": () => ({ body: { items: [{ id: "r1", summary: "Division by zero in average", task: "debug", language: "python", created_at: "2026-01-01T00:00:00Z" }], total: 1, page: 1, page_size: 5 } }),
    });
    renderApp(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
    expect(screen.getByTestId("stat-projects")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-debug_reports")).toHaveTextContent("3");
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Division by zero/ }).map((a) => a.getAttribute("href"))).toEqual(["/debug-history?open=r1", "/debug-history?open=r1"]);
    expect(screen.getByRole("link", { name: /Alpha/ })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByText("4 of 5 done")).toBeInTheDocument();
  });
});
