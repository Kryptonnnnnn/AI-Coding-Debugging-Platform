import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "@/components/markdown";

describe("Markdown (model output is untrusted)", () => {
  it("never renders raw HTML, scripts, event handlers or javascript: links", () => {
    const evil = [
      "<script>window.__pwned = 1</script>",
      '<img src=x onerror="window.__pwned = 2">',
      "[click](javascript:alert(1))",
      "<iframe src='https://evil.test'></iframe>",
      "<b onclick=\"window.__pwned=3\">bold?</b>",
    ].join("\n\n");
    const { container } = render(<Markdown>{evil}</Markdown>);
    expect(container.querySelector("script, img, iframe")).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror|onclick/i);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("opens links safely", () => {
    render(<Markdown>{"[docs](https://example.com)"}</Markdown>);
    const a = screen.getByRole("link", { name: "docs" });
    expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(a).toHaveAttribute("target", "_blank");
  });

  it("offers copy and propose-as-change on code blocks", async () => {
    const onInsert = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Markdown onInsertCode={onInsert}>{"```python\nprint('hi')\n```"}</Markdown>);
    await userEvent.click(screen.getByRole("button", { name: /Copy code/ }));
    expect(writeText).toHaveBeenCalledWith("print('hi')");
    fireEvent.click(screen.getByRole("button", { name: "Propose as change" }));
    expect(onInsert).toHaveBeenCalledWith("print('hi')");
  });
});
