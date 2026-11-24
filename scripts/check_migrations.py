import asyncio
import asyncpg


async def main():
    conn = await asyncpg.connect("postgresql://cypher:cypher@localhost:5433/cypher")
    print("== columns ==")
    rows = await conn.fetch(
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name IN ('users','social_auth','marts_tmp') "
        "ORDER BY table_name, ordinal_position"
    )
    for r in rows:
        print(r["table_name"], r["column_name"], r["data_type"])
    print("== version tables ==")
    for t in ("alembic_version", "_sqlx_migrations"):
        try:
            print(t, await conn.fetch(f"SELECT * FROM {t}"))
        except Exception as e:
            print(t, "missing:", str(e)[:100])
    await conn.close()


asyncio.run(main())
