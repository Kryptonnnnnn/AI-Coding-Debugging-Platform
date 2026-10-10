import { expect, test } from "@playwright/test";

const email = `live-check-${Date.now()}@example.com`;
const CODE = "def average(xs):\n    return sum(xs) / len(xs)\n";

test("live deployment smoke", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Live-check-pass-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /^Welcome,/ })).toBeVisible({ timeout: 90_000 });

  // external AI consent is required before Groq is used
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Provider", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.getByRole("link", { name: "My projects" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("Live check");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: /Live check/ }).click();
  await page.getByLabel("Upload input").setInputFiles({ name: "calc.py", mimeType: "text/plain", buffer: Buffer.from(CODE) });
  await page.getByRole("treeitem").getByText("calc.py").click();
  await expect(page.getByText("sum(xs) / len(xs)").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "Debug" }).click();
  await page.getByLabel("Error message").fill("ZeroDivisionError: division by zero");
  await page.getByRole("button", { name: /Analyze calc.py/ }).click();
  const report = page.getByRole("article", { name: "Debugging report" });
  await expect(report).toBeVisible({ timeout: 120_000 });
  await expect(report.getByText(/groq/)).toBeVisible();
  console.log("DEBUG SUMMARY:", await report.locator("h2").first().innerText());

  // patch: verify, apply (with confirmation), then restore the previous version, all against production
  await expect(report.getByRole("button", { name: "Apply fix" })).toBeVisible({ timeout: 30_000 });
  await report.getByRole("button", { name: "View diff" }).click();
  const diff = page.getByRole("dialog", { name: "Proposed change" });
  await diff.getByRole("button", { name: "Run checks" }).click();
  await expect(diff.getByText("tests not executed")).toBeVisible({ timeout: 30_000 });
  await diff.getByRole("button", { name: "Close dialog" }).click();
  await report.getByRole("button", { name: "Apply fix" }).click();
  await page.getByRole("dialog", { name: "Apply this patch?" }).getByRole("button", { name: "Apply patch" }).click();
  await expect(report.getByText("applied", { exact: true })).toBeVisible({ timeout: 30_000 });
  await report.getByRole("button", { name: "Restore previous version" }).click();
  await page.getByRole("dialog", { name: /Restore version/ }).getByRole("button", { name: "Restore" }).click();
  await expect(report.getByRole("button", { name: "Restored" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "Review" }).click();
  await page.getByRole("button", { name: "Run review" }).click();
  await expect(page.getByRole("article", { name: "Code review" })).toBeVisible({ timeout: 120_000 });

  await page.getByRole("tab", { name: "Tests" }).click();
  await page.getByRole("button", { name: /Generate tests/ }).click();
  await expect(page.getByText("Generated, not executed")).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: "Show bottom panel" }).click();
  await page.getByRole("tab", { name: "Output" }).click();
  await expect(page.getByText("Execution is disabled")).toBeVisible();

  // persistence: fresh page load, history pages show the saved items
  await page.goto("/debug-history");
  await expect(page.getByText(/ZeroDivision|division|average|len\(/i).first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/reviews");
  await expect(page.getByText("calc.py").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByTestId("stat-debug_reports")).toHaveText("1");
  await expect(page.getByTestId("stat-reviews")).toHaveText("1");
  await expect(page.getByTestId("stat-generated_tests")).toHaveText("1");

  // clean up: delete this throw-away account (and its data) through the product itself
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Delete my account/ }).click();
  await page.getByLabel("Password").fill("Live-check-pass-1");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
});
