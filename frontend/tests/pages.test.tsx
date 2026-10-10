import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "@/app/(app)/projects/page";
import { AuthForm } from "@/app/(auth)/auth-form";
import { DebugReportView } from "@/features/debug-report-view";
import { ReviewView } from "@/features/review-view";
import { TestView } from "@/features/test-view";
import type { DebugResponse, GeneratedTest, Project, Review } from "@/types/api";
import { mockFetch, renderApp } from "./helpers";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => "/projects", useParams: () => ({}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const project = (over: Partial<Project> = {}): Project => ({ id: "1", name: "Alpha", description: "", archived: false, settings: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", file_count: 2, ...over });
const page = (items: Project[]) => ({ items, total: items.length, page: 1, page_size: 12 });

beforeEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); replace.mockReset(); });

describe("Projects page", () => {
  it("shows an empty state with a call to action", async () => {
    mockFetch({ "GET /projects": () => ({ body: page([]) }) });
    renderApp(<ProjectsPage />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("shows API failures with a retry that works", async () => {
    let fail = true;
    mockFetch({ "GET /projects": () => (fail ? { status: 500, body: { error: { code: "internal_error", message: "Internal server error" } } } : { body: page([project()]) }) });
    renderApp(<ProjectsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });

  it("creates a project through the API and refreshes the list", async () => {
    let items: Project[] = [];
    const { calls } = mockFetch({
      "GET /projects": () => ({ body: page(items) }),
      "POST /projects": (_u, init) => { items = [project({ name: JSON.parse(String(init?.body)).name })]; return { status: 201, body: items[0] }; },
    });
    renderApp(<ProjectsPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: /New project|Create project/ }))[0]);
    await userEvent.type(screen.getByLabelText("Name"), "Beta");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ name: "Beta" });
  });

  it("deletes only after confirmation", async () => {
    const { calls } = mockFetch({ "GET /projects": () => ({ body: page([project()]) }), "DELETE /projects/1": () => ({ status: 204 }) });
    renderApp(<ProjectsPage />);
    const menuBtn = await screen.findByRole("button", { name: "Actions for Alpha" });
    await userEvent.click(menuBtn);
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Alpha" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("searches via the server", async () => {
    const { calls } = mockFetch({ "GET /projects": () => ({ body: page([]) }) });
    renderApp(<ProjectsPage />);
    await userEvent.type(await screen.findByLabelText("Search projects"), "xyz");
    await waitFor(() => expect(calls.some((c) => c.path.includes("q=xyz"))).toBe(true));
    expect(await screen.findByText("No matching projects")).toBeInTheDocument();
  });
});

describe("Auth form", () => {
  it("shows the server's message on a failed login and stays on the page", async () => {
    mockFetch({ "POST /auth/login": () => ({ status: 401, body: { error: { code: "unauthorized", message: "Incorrect email or password." } } }) });
    renderApp(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-pass-1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("aicp.token")).toBeNull();
  });

  it("stores the token and redirects after registering", async () => {
    mockFetch({ "POST /auth/register": () => ({ status: 201, body: { access_token: "T", token_type: "bearer", user: { id: "u", email: "a@example.com", display_name: "a" } } }) });
    renderApp(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(window.localStorage.getItem("aicp.token")).toBe("T");
  });
});

describe("Result views keep tool facts and AI hypotheses apart", () => {
  const patch = { id: "p1", project_id: "pr", file_id: "f1", report_id: "r1", title: "Guard it", explanation: "", base_sha256: "x", diff: "+x", status: "proposed", created_at: "2026-01-01T00:00:00Z", resolved_at: null, added: 1, removed: 1 };
  const report: DebugResponse = {
    id: "r1", task: "debug", language: "python", provider: "mock", model: "m", created_at: "2026-01-01T00:00:00Z", patch_id: "p1",
    disclaimer: "AI output is a hypothesis unless confirmed by tool findings or tests.",
    tool_findings: [{ tool: "ruff", rule_id: "F401", severity: "medium", file: "a.py", line: 1, message: "unused import", remediation: "", deterministic: true }],
    report: { summary: "Division by zero", root_cause: "len() is 0", evidence: [{ file: "a.py", quote: "x / len(x)", note: "", line_start: 2, line_end: 2, line_verified: true }, { file: "a.py", quote: "gone", note: "", line_start: null, line_end: null, line_verified: false }],
      confidence: "low", confidence_reasoning: "No execution.", suggested_fix: "Guard it", corrected_code: "x", fix_explanation: "", regressions: ["r"], verification_steps: ["v"], alternative_fixes: [], sections: [] },
  };
  it("separates source evidence, tool findings and AI hypotheses, and labels line verification", async () => {
    mockFetch({ "GET /patches/p1": () => ({ body: patch }) });
    renderApp(<DebugReportView data={report} filePath="a.py" />);
    expect(screen.getByText("From your code")).toBeInTheDocument();
    expect(screen.getByText("Confirmed by tool")).toBeInTheDocument();
    expect(screen.getAllByText("AI hypothesis").length).toBeGreaterThan(0);
    expect(screen.getByText("line 2 (verified)")).toBeInTheDocument();
    expect(screen.getByText("line not verified")).toBeInTheDocument();
    expect(screen.getByText(/ruff F401/)).toBeInTheDocument();
    expect(screen.getByText(/hypothesis unless confirmed/)).toBeInTheDocument();
    // patch actions come from the real patch record
    expect(await screen.findByRole("button", { name: /Apply fix/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject fix/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View diff/ })).toBeInTheDocument();
  });

  it("does not claim the fix is applied until the backend confirms", async () => {
    mockFetch({ "GET /patches/p1": () => ({ body: patch }), "POST /patches/p1/apply": () => ({ status: 409, body: { error: { code: "patch_conflict", message: "File changed." } } }) });
    renderApp(<DebugReportView data={report} filePath="a.py" />);
    await userEvent.click(await screen.findByRole("button", { name: /Apply fix/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply patch" }));
    expect(await screen.findByText("File changed.")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
    expect(screen.queryByText("applied")).toBeNull();
  });

  const finding = (o: object) => ({ id: "1", severity: "high", category: "security", file_path: "a.py", line_start: 5, line_end: 5, title: "eval", description: "dangerous", evidence: "eval(x)", remediation: "no eval", source: "ai", tool_confirmed: true, rule_id: "", ...o });
  const review = (findings: object[]): Review => ({ id: "v", depth: "standard", scope: ["a.py"], summary: "S", limitations: ["Not exhaustive."], provider: "mock", model: "m", created_at: "2026-01-01T00:00:00Z", findings: findings as Review["findings"] });

  it("groups review findings by severity, badges their source and filters", async () => {
    renderApp(<ReviewView review={review([finding({}), finding({ id: "2", severity: "info", title: "todo", tool_confirmed: false, line_start: null, line_end: null })])} />);
    expect(screen.getByRole("region", { name: "High findings" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Informational findings" })).toBeInTheDocument();
    expect(screen.getByText("tool-confirmed")).toBeInTheDocument();
    expect(screen.getByText("AI hypothesis")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter by source"), "ai");
    expect(screen.queryByText("eval")).toBeNull();
    expect(screen.getByText("todo")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter by source"), "");
    await userEvent.selectOptions(screen.getByLabelText("Filter by severity"), "high");
    expect(screen.queryByText("todo")).toBeNull();
    expect(screen.getByText("Not exhaustive.")).toBeInTheDocument();
  });

  it("collapses details until expanded and shows remediation", async () => {
    renderApp(<ReviewView review={review([finding({})])} />);
    expect(screen.queryByText(/no eval/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /eval/ }));
    expect(screen.getByText(/no eval/)).toBeInTheDocument();
    expect(screen.getByText("dangerous")).toBeInTheDocument();
  });

  it("labels generated tests as not executed and saves on request", async () => {
    const t: GeneratedTest = { id: "t1", project_id: "p", file_id: "f", framework: "pytest", test_path: "test_a.py", code: "def test_x(): pass", description: "d", saved: false, executed: false, status_label: "Generated, not executed",
      details: { behaviors: ["b"], branches_covered: [], fixtures_mocks: [], setup_instructions: "pytest", syntax_valid: true, coverage: "not measured" }, diff: "+def test_x(): pass", provider: "mock", model: "m", created_at: "2026-01-01T00:00:00Z" };
    const { calls } = mockFetch({ "POST /tests/t1/save": () => ({ body: { saved: true } }) });
    renderApp(<TestView test={t} />);
    expect(screen.getByText("Generated, not executed")).toBeInTheDocument();
    expect(screen.getByText("coverage: not measured")).toBeInTheDocument();
    expect(screen.getByText("test_a.py")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save to project/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Saved to project/ })).toBeDisabled());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/tests/t1/save" });
  });
});
