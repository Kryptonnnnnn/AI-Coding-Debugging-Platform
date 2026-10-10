import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchReview } from "@/features/patch-review";
import type { Patch } from "@/types/api";
import { mockFetch, renderApp } from "./helpers";

const patch: Patch = {
  id: "p1", project_id: "pr", file_id: "f1", title: "Guard empty list", explanation: "Avoid **ZeroDivisionError**.", status: "proposed",
  created_at: "2026-01-01T00:00:00Z", resolved_at: null, added: 1, removed: 1,
  diff: "--- a/calc.py\n+++ b/calc.py\n@@ -1,2 +1,2 @@\n def average(xs):\n-    return sum(xs) / len(xs)\n+    return sum(xs) / len(xs) if xs else 0\n",
};

beforeEach(() => vi.unstubAllGlobals());

describe("PatchReview", () => {
  it("shows added/removed lines and does nothing until the user clicks Apply", async () => {
    const { calls } = mockFetch({});
    renderApp(<PatchReview patch={patch} language="python" />);
    const diff = screen.getByLabelText("Unified diff");
    const removed = within(diff).getByText((c) => c.startsWith("-") && c.includes("sum(xs) / len(xs)") && !c.startsWith("---"));
    const added = within(diff).getByText((c) => c.startsWith("+") && c.includes("if xs else 0") && !c.startsWith("+++"));
    expect(removed).toHaveClass("bg-danger/15");
    expect(added).toHaveClass("bg-ok/15");
    expect(screen.getByText("Nothing changes until you apply.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("applies after explicit approval and reflects the new status", async () => {
    const onResolved = vi.fn();
    const { calls } = mockFetch({ "POST /patches/p1/apply": () => ({ body: { ...patch, status: "applied" } }) });
    renderApp(<PatchReview patch={patch} language="python" onResolved={onResolved} />);
    await userEvent.click(screen.getByRole("button", { name: /Apply patch/ }));
    await waitFor(() => expect(screen.getByText("applied")).toBeInTheDocument());
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /patches/p1/apply"]);
    expect(onResolved).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Apply patch/ })).toBeNull();
  });

  it("explains conflicts instead of pretending success", async () => {
    mockFetch({ "POST /patches/p1/apply": () => ({ status: 409, body: { error: { code: "patch_conflict", message: "The file changed after this patch was generated." } } }) });
    renderApp(<PatchReview patch={patch} language="python" />);
    await userEvent.click(screen.getByRole("button", { name: /Apply patch/ }));
    expect(await screen.findByText(/file changed after this patch/)).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
  });

  it("rejects without changing files", async () => {
    mockFetch({ "POST /patches/p1/reject": () => ({ body: { ...patch, status: "rejected" } }) });
    renderApp(<PatchReview patch={patch} language="python" />);
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    await waitFor(() => expect(screen.getByText("rejected")).toBeInTheDocument());
  });
});
