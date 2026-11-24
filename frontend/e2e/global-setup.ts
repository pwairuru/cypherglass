import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const PG_CONTAINER_SERVICE = process.env.E2E_PG_SERVICE ?? "pg";
const PG_USER = process.env.POSTGRES_USER ?? "cypher";
const PG_DB = process.env.POSTGRES_DB ?? "cypher";

function psql(sql: string, stopOnError: boolean): void {
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      PG_CONTAINER_SERVICE,
      "psql",
      "-U",
      PG_USER,
      "-d",
      PG_DB,
      "-v",
      `ON_ERROR_STOP=${stopOnError ? 1 : 0}`,
      "-c",
      sql,
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
}

export async function wipeDb(): Promise<void> {
  // Tables may not exist yet on a fresh volume; migrations run on API boot.
  psql("DELETE FROM social_auth; DELETE FROM users;", false);
}

/** Promote a user to admin directly (no bootstrap endpoint exists by design). */
export async function promoteAdmin(username: string): Promise<void> {
  const escaped = username.replace(/'/g, "''");
  psql(`UPDATE users SET is_admin=TRUE WHERE username = '${escaped}'`, true);
}

export async function globalSetup(): Promise<void> {
  await wipeDb();
}

export default globalSetup;
