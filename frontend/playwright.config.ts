import { defineConfig } from "@playwright/test";

// Expects the backend (mock provider, EXECUTION_ENABLED=false) on :8000 and the frontend on :3000.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
});
