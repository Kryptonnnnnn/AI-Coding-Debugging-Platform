import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchVerification } from "@/features/patch-verification";
import { ReviewActions } from "@/features/review-actions";
import { OverviewPanel } from "@/features/workspace/overview-panel";
import { RelatedPanel } from "@/features/workspace/related-panel";
import type { WorkspaceCtx } from "@/features/workspace/types";
import type { Review } from "@/types/api";
import { mockFetch, renderApp } from "./helpers";

beforeEach(() => vi.unstubAllGlobals());

const verification = {
  checked_at: "2026-01-01T00:00:00Z", language: "python",
  syntax: { original_ok: true, proposed_ok: true, proposed_error: null, checked_by: "parser" },
  static: { tools: [{ tool: "ruff", status: "ran", detail: "" }], new_findings: [{ tool: "ruff", rule_id: "F401", severity: "medium", file: "a.py", line: 1, message: "`os` imported but unused", remediation: "", deterministic: true }], resolved_findings: [], unchanged_count: 0 },
  execution: { status: "not_executed" as const, reason: "Sandbox unavailable: EXECUTION_ENABLED is false (default)." },
  notes: ["1 new tool finding(s) would be introduced.", "Tests were not executed. A passing result is never assumed."],
  events: [{ event: "verified", at: "2026-01-01T00:00:00Z" }],
};

describe("PatchVerification", () => {
  it("runs checks, shows new findings and labels tests as not executed (never a fake pass)", async () => {
    const { calls } = mockFetch({ "POST /patches/p1/verify": () => ({ body: verification }) });
    renderApp(<PatchVerification patchId="p1" status="proposed" />);
    await userEvent.click(screen.getByRole("button", { name: "Run checks" }));
    expect(await screen.findByText("proposed code parses")).toBeInTheDocument();
    expect(screen.getByText(/F401/)).toBeInTheDocument();
    expect(screen.getByText("tests not executed")).toBeInTheDocument();
    expect(screen.queryByText(/passed/i)).toBeNull();
    expect(screen.getByText(/Tests were not executed/)).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "POST", path: "/patches/p1/verify" });
    expect(screen.getByText("Audit trail (1)")).toBeInTheDocument();
  });

  it("flags syntax errors", async () => {
    mockFetch({ "POST /patches/p1/verify": () => ({ body: { ...verification, syntax: { original_ok: true, proposed_ok: false, proposed_error: { line: 3, message: "invalid syntax" }, checked_by: "parser" } } }) });
    renderApp(<PatchVerification patchId="p1" status="proposed" />);
    await userEvent.click(screen.getByRole("button", { name: "Run checks" }));
    expect(await screen.findByText(/syntax error \(line 3\)/)).toBeInTheDocument();
  });

  it("suggests regression tests labelled as generated, not executed", async () => {
    const t = { id: "t1", project_id: "pr", file_id: "f", patch_id: "p1", framework: "pytest", test_path: "test_a.py", code: "def test_x(): pass", description: "d", saved: false, executed: false, status_label: "Generated, not executed",
      details: { behaviors: [], branches_covered: [], fixtures_mocks: [], setup_instructions: "", syntax_valid: true, coverage: "not measured", note: "Regression tests are suggestions." }, diff: "+x", provider: "mock", model: "m", created_at: "2026-01-01T00:00:00Z" };
    const { calls } = mockFetch({ "POST /patches/p1/regression-tests": () => ({ status: 201, body: t }) });
    renderApp(<PatchVerification patchId="p1" status="proposed" />);
    await userEvent.click(screen.getByRole("button", { name: /Suggest regression tests/ }));
    expect(await screen.findByText("Generated, not executed")).toBeInTheDocument();
    expect(calls[0].path).toBe("/patches/p1/regression-tests");
  });

  it("shows the post-apply check for applied patches", () => {
    mockFetch({});
    renderApp(<PatchVerification patchId="p1" status="applied" initial={{ ...verification, post_apply: { checked_at: "2026-01-01T00:00:00Z", syntax_ok: true, tool_findings: 0, analyzers_ran: ["ruff"] } }} />);
    expect(screen.getByText(/After applying: syntax valid, 0 tool finding\(s\), checked by ruff/)).toBeInTheDocument();
  });
});

const ctx = (over: Partial<WorkspaceCtx> = {}): WorkspaceCtx => ({
  projectId: "pr", files: [{ id: "f1", path: "app/main.py", language: "python", size_bytes: 10, sha256: "a", updated_at: "" }, { id: "f2", path: "app/util.py", language: "python", size_bytes: 10, sha256: "b", updated_at: "" }],
  file: { id: "f1", path: "app/main.py", language: "python", size_bytes: 10, sha256: "a", updated_at: "", content: "", secret_warnings: [] }, draft: "", selection: "",
  saveNow: async () => null, refresh: async () => {}, openFile: vi.fn(), openPatch: vi.fn(), reloadActive: async () => {}, showAssistant: vi.fn(), showBottom: vi.fn(), ...over,
});

describe("RelatedPanel", () => {
  it("lists imports/importers, warns about cycles, and states the method's limits", async () => {
    const openFile = vi.fn();
    mockFetch({ "GET /projects/pr/files/f1/related": () => ({ body: { path: "app/main.py", supported: true, language: "python", method: "ast (import statements)", imports: ["app/util.py"], imported_by: [], external: ["requests"], unresolved: [], cycles: [["app/main.py", "app/util.py"]], disclaimer: "Static import analysis only. This is not a semantic call graph.", suggested_context: [] } }) });
    renderApp(<RelatedPanel ctx={ctx({ openFile })} />);
    await userEvent.click(await screen.findByRole("button", { name: "app/util.py" }));
    expect(openFile).toHaveBeenCalledWith("f2");
    expect(screen.getByText("requests")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("app/main.py ⇄ app/util.py");
    expect(screen.getByText(/not a semantic call graph/)).toBeInTheDocument();
  });
  it("says so for unsupported languages instead of guessing", async () => {
    mockFetch({ "GET /projects/pr/files/f1/related": () => ({ body: { path: "A.java", supported: false, language: "java", method: null, imports: [], imported_by: [], external: [], unresolved: [], cycles: [], disclaimer: "", suggested_context: [] } }) });
    renderApp(<RelatedPanel ctx={ctx()} />);
    expect(await screen.findByText("No import analysis for java")).toBeInTheDocument();
  });
});

describe("OverviewPanel", () => {
  it("renders only real, stored statistics", async () => {
    mockFetch({ "GET /projects/pr/overview": () => ({ body: { files: 3, bytes: 2048, languages: [{ language: "python", files: 2, bytes: 1500 }, { language: "sql", files: 1, bytes: 548 }],
      activity_counts: { debug_reports: 2, reviews: 1, generated_tests: 0, patches: { applied: 1, proposed: 2 } },
      latest_review: { id: "r", created_at: "2026-01-01T00:00:00Z", depth: "standard", findings_by_severity: { high: 1, low: 2 }, files_with_most_findings: [["a.py", 3]] },
      most_edited_files: [{ path: "a.py", versions: 4 }], imports: { edges: 2, cycles: 1, most_imported: [{ path: "util.py", imported_by: 2 }] }, recent_activity: [] } }) });
    renderApp(<OverviewPanel ctx={ctx()} />);
    expect(await screen.findByText("1 applied · 2 open")).toBeInTheDocument();
    expect(screen.getByText("a.py")).toBeInTheDocument();
    expect(screen.getByText("1 circular")).toBeInTheDocument();
    expect(screen.getByText(/Most findings: a.py \(3\)/)).toBeInTheDocument();
  });
});

describe("ReviewActions", () => {
  const review: Review = { id: "r2", project_id: "pr", depth: "standard", scope: ["a.py"], summary: "", limitations: [], provider: "mock", model: "m", created_at: "2026-02-01T00:00:00Z", findings: [] };
  it("compares against an older review and explains how matching works", async () => {
    const older = { ...review, id: "r1", label: "baseline", is_baseline: true, created_at: "2026-01-01T00:00:00Z" };
    const { calls } = mockFetch({
      "GET /reviews?page_size=50&project_id=pr": () => ({ body: { items: [review, older], total: 2, page: 1, page_size: 50 } }),
      "GET /reviews/r1/compare/r2": () => ({ body: { baseline: { id: "r1", label: "baseline", created_at: "2026-01-01T00:00:00Z", depth: "standard" }, current: { id: "r2", created_at: "2026-02-01T00:00:00Z", depth: "standard" },
        new: [{ fingerprint: "n", severity: "high", category: "security", file_path: "a.py", line_start: 3, title: "New problem", source: "ai", rule_id: "" }],
        resolved: [{ fingerprint: "r", severity: "low", category: "x", file_path: "a.py", line_start: 9, title: "Fixed thing", source: "tool", rule_id: "E711" }], unchanged: [], compared_files: ["a.py"], notes: ["Findings are matched by file, rule/category and text, not by line number."] } }),
    });
    renderApp(<ReviewActions review={review} projectId="pr" />);
    await userEvent.click(screen.getByRole("button", { name: /Compare/ }));
    const dlg = await screen.findByRole("dialog", { name: "Compare reviews" });
    await waitFor(() => expect(within(dlg).getByLabelText("Compare this review with")).toHaveValue("r1"));
    await userEvent.click(within(dlg).getByRole("button", { name: "Compare" }));
    expect(await within(dlg).findByText("New problem")).toBeInTheDocument();
    expect(within(dlg).getByText("Fixed thing")).toBeInTheDocument();
    expect(within(dlg).getByText("1 new")).toBeInTheDocument();
    expect(within(dlg).getByText(/not by line number/)).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/reviews/r1/compare/r2")).toBe(true); // older review is always the baseline side
  });
  it("saves a labelled baseline through the API", async () => {
    const { calls } = mockFetch({ "POST /reviews/r2/baseline": () => ({ body: { ...review, is_baseline: true, label: "v1" } }) });
    renderApp(<ReviewActions review={review} projectId="pr" />);
    await userEvent.click(screen.getByRole("button", { name: /Save as baseline/ }));
    await userEvent.type(await screen.findByLabelText("Label (optional)"), "v1");
    await userEvent.click(screen.getByRole("button", { name: "Save baseline" }));
    await waitFor(() => expect(calls[0].body).toEqual({ is_baseline: true, label: "v1" }));
  });
});
