import asyncio
import asyncpg

# One-off repair for dev/test volumes migrated with a pre-release 001 file.
# The file is idempotent (IF NOT EXISTS / ADD COLUMN IF EXISTS) and the live
# schema already matches its end state (verified column-by-column 2026-11-23;
# only nuance: social_auth.extra_data is json, file says jsonb — harmless,
# unify in a future 002 migration). After this, sqlx::migrate succeeds.
CHECKSUM_HEX = "688e062e2c73cfdcaa7dfc1d8b391c380be23af2bbe7b184b6975f7fc7426b687eb31360ed69aeb7b9deddbce7e717f2"


async def main():
    conn = await asyncpg.connect("postgresql://cypher:cypher@localhost:5433/cypher")
    await conn.execute(
        "UPDATE _sqlx_migrations SET checksum = decode($1, 'hex') WHERE version = 1",
        CHECKSUM_HEX,
    )
    print(await conn.fetch("SELECT version, success FROM _sqlx_migrations"))
    await conn.close()


asyncio.run(main())
