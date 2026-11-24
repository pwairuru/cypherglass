import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5273);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://cypher:cypher@localhost:5433/cypher";

/** Read a key from the repo .env without pulling in a dotenv dependency. */
function envFileValue(key: string): string | undefined {
  for (const file of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
  ]) {
    try {
      const line = readFileSync(file, "utf8")
        .split("\n")
        .find((l) => l.trim().startsWith(`${key}=`));
      if (line) {
        return line
          .slice(line.indexOf("=") + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
      }
    } catch {
      // try next location
    }
  }
  return undefined;
}

const valkeyPassword =
  process.env.VALKEY_PASSWORD ?? envFileValue("VALKEY_PASSWORD") ?? "";
const valkeyAuth = valkeyPassword
  ? `:${encodeURIComponent(valkeyPassword)}@`
  : "";
const VALKEY_URL =
  process.env.VALKEY_URL ?? `redis://${valkeyAuth}localhost:6382/0`;

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
      command: "cargo run -p backend-rs",
      cwd: "..",
      env: {
        ...process.env,
        PORT: String(API_PORT),
        DATABASE_URL,
        VALKEY_URL,
        CLICKHOUSE_HOST: process.env.CLICKHOUSE_HOST ?? "localhost",
        CLICKHOUSE_PORT: process.env.CLICKHOUSE_PORT ?? "8124",
        JWT_SECRET:
          process.env.JWT_SECRET ??
          "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567",
        ENV: "dev",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: true,
      timeout: 180_000,
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
