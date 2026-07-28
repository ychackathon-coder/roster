import { defineConfig, devices } from "@playwright/test";

// No webServer block: the orchestrator starts and owns the Next server. The
// suite only needs its address — PW_BASE overrides for non-local targets.
export default defineConfig({
  testDir: "./tests-ui",
  timeout: 30_000,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PW_BASE ?? "http://127.0.0.1:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
