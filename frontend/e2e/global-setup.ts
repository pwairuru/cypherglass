import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendPy = path.resolve(here, "../../backend/.venv/bin/python");

export async function wipeDb(): Promise<void> {
  execFileSync(
    backendPy,
    [path.join(here, "wipe-db.py")],
    {
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql+asyncpg://cypher:cypher@localhost:5433/cypher",
      },
      stdio: "inherit",
    },
  );
}

/** Promote a user to admin directly (no bootstrap endpoint exists by design). */
export async function promoteAdmin(username: string): Promise<void> {
  const script = `
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os
async def main():
    e = create_async_engine(os.environ["DATABASE_URL"])
    async with e.begin() as c:
        await c.execute(text("UPDATE users SET is_admin=TRUE WHERE username=:u"), {"u": "${username}"})
    await e.dispose()
asyncio.run(main())
`;
  execFileSync(backendPy, ["-c", script], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql+asyncpg://cypher:cypher@localhost:5433/cypher",
    },
    stdio: "inherit",
  });
}

export async function globalSetup(): Promise<void> {
  await wipeDb();
}

export default globalSetup;
