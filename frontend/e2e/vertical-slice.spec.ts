import { expect, test } from "@playwright/test";

const email = `e2e-${Date.now()}@example.com`;
const BUGGY = "def average(xs):\n    return sum(xs) / len(xs)\n";

test("register → project → upload → debug → review diff → apply → history restore", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Debug, review and test code/ })).toBeVisible();
  await page.getByRole("link", { name: "Get started" }).click();

  // register
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByTestId("stat-projects")).toHaveText("0");

  // create project
  await page.getByRole("link", { name: "My projects" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("Demo project");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Demo project" }).click();
  await expect(page.getByText("This project is empty")).toBeVisible();

  // upload a buggy file
  await page.getByLabel("Upload input").setInputFiles({ name: "calc.py", mimeType: "text/plain", buffer: Buffer.from(BUGGY) });
  await page.getByRole("treeitem").getByText("calc.py").click();
  await expect(page.getByText("sum(xs) / len(xs)").first()).toBeVisible({ timeout: 30_000 }); // Monaco rendered the content

  // debug
  await page.getByRole("tab", { name: "Debug" }).click();
  await page.getByLabel("Error message").fill("ZeroDivisionError: division by zero");
  await page.getByRole("button", { name: /Analyze calc.py/ }).click();
  const report = page.getByRole("article", { name: "Debugging report" });
  await expect(report).toBeVisible();
  await expect(report.getByText("AI hypothesis")).toBeVisible();
  await expect(report.getByText(/line 2 \(verified\)/)).toBeVisible();

  // patch must be reviewed and explicitly applied
  await report.getByRole("button", { name: "Review patch" }).click();
  const dialog = page.getByRole("dialog", { name: "Review proposed change" });
  await dialog.getByRole("button", { name: "Unified text" }).click();
  await expect(dialog.getByLabel("Unified diff")).toContainText("+    return sum(xs) / len(xs) if xs else 0");
  await dialog.getByRole("button", { name: "Apply patch" }).click();
  await expect(dialog.getByText("applied", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByText("if xs else 0").first()).toBeVisible();

  // history + restore
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("patch apply")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restore" }).last().click();
  await expect(page.getByText("Version restored")).toBeVisible();

  // review + tests + static analysis
  await page.getByRole("tab", { name: "Review" }).click();
  await page.getByRole("button", { name: "Run review" }).click();
  await expect(page.getByRole("article", { name: "Code review" })).toBeVisible();
  await page.getByRole("tab", { name: "Tests" }).click();
  await page.getByRole("button", { name: /Generate tests/ }).click();
  await expect(page.getByText("Generated, not executed")).toBeVisible();
  await page.getByRole("tab", { name: "Run" }).click();
  await expect(page.getByText("Execution is disabled")).toBeVisible();

  // chat streaming with visible context
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("What does average do?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Mock assistant reply")).toBeVisible();
  await expect(page.getByText(/Context sent: calc.py/)).toBeVisible();

  // dashboard shows real numbers
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("stat-debug_reports")).toHaveText("1");
  await expect(page.getByTestId("stat-patches_applied")).toHaveText("1");
});

test("unauthenticated users are redirected and bad logins show errors", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("unknown route shows the 404 page", async ({ page }) => {
  await page.goto("/definitely-missing");
  await expect(page.getByText("This page doesn't exist.")).toBeVisible();
});
