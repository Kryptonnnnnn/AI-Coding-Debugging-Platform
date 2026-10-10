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

async function confirmDialog(label: string) {
  const dlg = await screen.findByRole("dialog");
  await userEvent.click(within(dlg).getByRole("button", { name: label }));
}

describe("PatchReview", () => {
  it("shows added/removed lines and does nothing until the user acts", async () => {
    const { calls } = mockFetch({});
    renderApp(<PatchReview patch={patch} language="python" path="calc.py" />);
    await userEvent.click(screen.getByRole("button", { name: "Unified text" }));
    const diff = screen.getByLabelText("Unified diff");
    expect(within(diff).getByText((c) => c.startsWith("-") && c.includes("sum(xs) / len(xs)") && !c.startsWith("---"))).toHaveClass("bg-danger/15");
    expect(within(diff).getByText((c) => c.startsWith("+") && c.includes("if xs else 0") && !c.startsWith("+++"))).toHaveClass("bg-ok/15");
    expect(screen.getByText("Nothing changes until you apply.")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("requires a confirmation step; cancelling sends nothing", async () => {
    const { calls } = mockFetch({});
    renderApp(<PatchReview patch={patch} language="python" path="calc.py" />);
    await userEvent.click(screen.getByRole("button", { name: /Apply patch/ }));
    expect(await screen.findByRole("dialog", { name: "Apply this patch?" })).toHaveTextContent("calc.py");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText("proposed")).toBeInTheDocument();
  });

  it("applies only after confirmation and reflects the backend's status", async () => {
    const onResolved = vi.fn();
    const { calls } = mockFetch({ "POST /patches/p1/apply": () => ({ body: { ...patch, status: "applied" } }) });
    renderApp(<PatchReview patch={patch} language="python" path="calc.py" onResolved={onResolved} />);
    await userEvent.click(screen.getByRole("button", { name: /Apply patch/ }));
    await confirmDialog("Apply patch");
    await waitFor(() => expect(screen.getByText("applied")).toBeInTheDocument());
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /patches/p1/apply"]);
    expect(onResolved).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Restore previous version/ })).toBeInTheDocument();
  });

  it("explains conflicts instead of pretending success", async () => {
    mockFetch({ "POST /patches/p1/apply": () => ({ status: 409, body: { error: { code: "patch_conflict", message: "The file changed after this patch was generated." } } }) });
    renderApp(<PatchReview patch={patch} language="python" path="calc.py" />);
    await userEvent.click(screen.getByRole("button", { name: /Apply patch/ }));
    await confirmDialog("Apply patch");
    expect(await screen.findByText(/file changed after this patch/)).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
    expect(screen.queryByText("applied")).toBeNull();
  });

  it("rejects without changing files", async () => {
    mockFetch({ "POST /patches/p1/reject": () => ({ body: { ...patch, status: "rejected" } }) });
    renderApp(<PatchReview patch={patch} language="python" path="calc.py" />);
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    await waitFor(() => expect(screen.getByText("rejected")).toBeInTheDocument());
    expect(screen.getAllByText(/No files were changed/).length).toBeGreaterThan(0);
  });

  it("restores the version before the patch, after confirmation", async () => {
    const applied = { ...patch, status: "applied" as const };
    const versions = [
      { id: "v3", file_id: "f1", version_no: 3, path: "calc.py", sha256: "c", reason: "patch_apply", patch_id: "p1", created_at: "2026-01-02T00:00:00Z" },
      { id: "v2", file_id: "f1", version_no: 2, path: "calc.py", sha256: "b", reason: "baseline", patch_id: null, created_at: "2026-01-01T00:00:00Z" },
    ];
    const { calls } = mockFetch({
      "GET /projects/pr/files/f1/versions": () => ({ body: versions }),
      "POST /projects/pr/files/f1/versions/v2/restore": () => ({ body: {} }),
    });
    renderApp(<PatchReview patch={applied} language="python" path="calc.py" />);
    await userEvent.click(screen.getByRole("button", { name: /Restore previous version/ }));
    expect(await screen.findByRole("dialog", { name: "Restore version 2?" })).toBeInTheDocument();
    await confirmDialog("Restore");
    await waitFor(() => expect(screen.getByRole("button", { name: /Previous version restored/ })).toBeDisabled());
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("POST /projects/pr/files/f1/versions/v2/restore");
  });
});
