import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfirmProvider, Dialog, Menu, MenuItem, Tooltip, useConfirm } from "@/components/ui";
import { CodeBlock } from "@/components/ui/code-block";

describe("Menu", () => {
  it("opens with the keyboard, moves with arrows, closes on Escape and returns focus", async () => {
    const onA = vi.fn();
    render(<Menu label="Actions" trigger={<span>•••</span>}><MenuItem onSelect={onA}>First</MenuItem><MenuItem onSelect={() => {}}>Second</MenuItem></Menu>);
    const btn = screen.getByRole("button", { name: "Actions" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Second" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(btn).toHaveFocus();
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole("menuitem", { name: "First" }));
    expect(onA).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Dialog", () => {
  it("is labelled, closes on Escape, keeps focus inside and restores focus", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<><button>opener</button><Dialog open onClose={onClose} title="Settings dialog"><button>one</button><button>two</button></Dialog></>);
    const dlg = screen.getByRole("dialog", { name: "Settings dialog" });
    expect(dlg).toHaveAttribute("aria-modal", "true");
    screen.getByRole("button", { name: "Close dialog" }).focus();
    await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
    expect(dlg.contains(document.activeElement)).toBe(true); // Tab cycles within the dialog
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    rerender(<><button>opener</button></>);
  });
});

describe("useConfirm", () => {
  function Demo({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm();
    return <Button onClick={async () => onResult(await confirm({ title: "Sure?", confirmLabel: "Do it" }))}>go</Button>;
  }
  it("resolves true on confirm and false on cancel/Escape", async () => {
    const r = vi.fn();
    render(<ConfirmProvider><Demo onResult={r} /></ConfirmProvider>);
    await userEvent.click(screen.getByText("go"));
    await userEvent.click(screen.getByRole("button", { name: "Do it" }));
    await waitFor(() => expect(r).toHaveBeenLastCalledWith(true));
    await userEvent.click(screen.getByText("go"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(r).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Tooltip & CodeBlock", () => {
  it("exposes tooltip text with role=tooltip", () => {
    render(<Tooltip label="Save" shortcut="Ctrl S"><button aria-label="Save">s</button></Tooltip>);
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Save");
  });
  it("renders highlighted code safely with line numbers", () => {
    const { container } = render(<CodeBlock code={'print("<img src=x onerror=alert(1)>")\nx = 1'} language="python" title="a.py" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("a.py")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
