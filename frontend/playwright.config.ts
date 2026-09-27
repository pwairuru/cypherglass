import { defineConfig } from "@playwright/test";

const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5273);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql+asyncpg://cypher:cypher@localhost:5433/cypher";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  // Serial: this box runs ~28/31GB used; parallel browsers get OOM-killed.
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 10_000 },
  // Container has no display server; run headless. The headed preference
  // in AGENTS.md applies to interactive MCP browser sessions, not CI runs.
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    headless: false,
    trace: "retain-on-failure",
    // Use the pre-installed full Chromium (no network download in this env).
    // Headless shell is unavailable; full Chrome 153 runs --headless=new.
    launchOptions: {
      executablePath:
        process.env.E2E_CHROME ??
        "/home/wairuru/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
      args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: [
    {
      command: `../backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: "../backend",
      env: { ...process.env, DATABASE_URL },
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      env: { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
