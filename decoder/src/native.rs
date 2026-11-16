//! Production ClickHouse backend over the HTTP interface.
//!
//! [`NativeWriter`] implements [`DbWriter`] with the [`clickhouse`] crate
//! (HTTP `INSERT ... FORMAT RowBinary`). Every insert carries
//! `async_insert=1` with [`WAIT_FOR_ASYNC_INSERT`] (durable ack; Go used
//! fire-and-forget `0`, Task 5) so [`Syncer::flush`](crate::syncer::Syncer)
//! only checkpoints data the server has accepted.
//!
//! The writer owns a single-thread Tokio runtime and exposes a blocking API,
//! so the fully synchronous [`Syncer`](crate::syncer::Syncer) can call it
//! from any plain thread. Do NOT call it from inside async code (the inner
//! `block_on` would panic); the binary runs the syncer on a dedicated
//! `std::thread` for exactly this reason.
//!
//! `CLICKHOUSE_PORT` is the **HTTP** port here (8123 on the server image;
//! the Go client used native 9000). Same env names, different port.

use anyhow::{Context, Result};

use crate::ch::{
    BlockRow, BlockRowV2, DbWriter, InputRow, InputRowV2, OutputRow, OutputRowV2, TxRow, TxRowV2,
    WAIT_FOR_ASYNC_INSERT,
};
use crate::config::valid_db_name;

/// Production [`DbWriter`]: 8 tables over one HTTP [`clickhouse::Client`].
pub struct NativeWriter {
    client: clickhouse::Client,
    rt: tokio::runtime::Runtime,
}

impl NativeWriter {
    /// Build against `http://{host}:{port}` with user/password/database.
    /// The database identifier is validated (same rule as Go `dbIdentRe`);
    /// values stay driver-bound parameters.
    pub fn new(host: &str, port: u16, user: &str, password: &str, database: &str) -> Result<Self> {
        if !valid_db_name(database) {
            anyhow::bail!("invalid CLICKHOUSE_DATABASE {database:?}");
        }
        let client = clickhouse::Client::default()
            .with_url(format!("http://{host}:{port}"))
            .with_user(user)
            .with_password(password)
            .with_database(database);
        Self::with_client(client)
    }

    /// Build against a full base URL (`CH_TEST_ADDR` shape), e.g.
    /// `http://user:pass@127.0.0.1:8124`; URL-embedded auth is honored and
    /// `database` overrides any `?database=` parameter.
    pub fn for_url(url: &str, database: &str) -> Result<Self> {
        if !valid_db_name(database) {
            anyhow::bail!("invalid database {database:?}");
        }
        // The crate only extracts `?database=` from the URL, not userinfo
        // auth, so split `scheme://[user[:pass]@]host...` by hand.
        let after_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or(url);
        let (userinfo, hostpart) = match after_scheme.split_once('@') {
            Some((u, h)) => (u, h),
            None => ("", after_scheme),
        };
        let (user, password) = match userinfo.split_once(':') {
            Some((u, p)) => (u, p),
            None => (userinfo, ""),
        };
        let scheme = url.split_once("://").map(|(s, _)| s).unwrap_or("http");
        let base = format!("{scheme}://{hostpart}");
        let client = clickhouse::Client::default()
            .with_url(base)
            .with_user(user)
            .with_password(password)
            .with_database(database);
        Self::with_client(client)
    }

    fn with_client(client: clickhouse::Client) -> Result<Self> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("building clickhouse runtime")?;
        Ok(Self { client, rt })
    }

    /// Authenticated client for DDL/verification (integration test use).
    pub fn client(&self) -> &clickhouse::Client {
        &self.client
    }

    /// Drive a future on the writer's own runtime (DDL/verification in
    /// tests). Must NOT be called from async context, and the future must
    /// not touch another runtime's client: pool tasks belong to this
    /// runtime.
    pub fn block_on<F, T>(&self, f: F) -> T
    where
        F: std::future::Future<Output = T>,
    {
        self.rt.block_on(f)
    }

    /// `SELECT 1` liveness check used by the connect-retry loop.
    pub fn ping(&self) -> Result<()> {
        self.rt
            .block_on(self.client.query("SELECT 1").execute())
            .context("clickhouse ping")?;
        Ok(())
    }

    /// The client's default database (set at construction) qualifies every
    /// insert; pass bare table names so the server does not see `db.db.t`.
    fn table(&self, name: &str) -> String {
        name.to_string()
    }

    /// One table batch with the production async-insert settings attached.
    /// [`WAIT_FOR_ASYNC_INSERT`] is attached per flush (not just the Task 5
    /// const): the server acks only after the async batch is durable.
    fn insert_all<T>(&self, table: &str, rows: &[T]) -> Result<()>
    where
        T: clickhouse::RowOwned + serde::Serialize,
    {
        let qualified = self.table(table);
        self.rt
            .block_on(async {
                let mut insert = self
                    .client
                    .insert::<T>(&qualified)
                    .await?
                    .with_setting("async_insert", "1")
                    .with_setting("wait_for_async_insert", WAIT_FOR_ASYNC_INSERT.to_string());
                for row in rows {
                    insert.write(row).await?;
                }
                insert.end().await
            })
            .with_context(|| format!("insert {qualified} ({} rows)", rows.len()))
    }
}

impl DbWriter for NativeWriter {
    fn insert_blocks(&self, rows: &[BlockRow]) -> Result<()> {
        self.insert_all("blocks", rows)
    }
    fn insert_transactions(&self, rows: &[TxRow]) -> Result<()> {
        self.insert_all("transactions", rows)
    }
    fn insert_outputs(&self, rows: &[OutputRow]) -> Result<()> {
        self.insert_all("outputs", rows)
    }
    fn insert_inputs(&self, rows: &[InputRow]) -> Result<()> {
        self.insert_all("inputs", rows)
    }
    fn insert_blocks_v2(&self, rows: &[BlockRowV2]) -> Result<()> {
        self.insert_all("blocks_v2", rows)
    }
    fn insert_transactions_v2(&self, rows: &[TxRowV2]) -> Result<()> {
        self.insert_all("transactions_v2", rows)
    }
    fn insert_inputs_v2(&self, rows: &[InputRowV2]) -> Result<()> {
        self.insert_all("inputs_v2", rows)
    }
    fn insert_outputs_v2(&self, rows: &[OutputRowV2]) -> Result<()> {
        self.insert_all("outputs_v2", rows)
    }
}

/// Minimal `ENGINE = Memory` DDL for the 8 decoder tables, for the
/// `#[ignore]`d live integration test's ephemeral database. Column
/// names/order/types mirror the production schema
/// (`clickhouse/init/01_schema.sql`, `03_schema_v2.sql`); codecs, TTLs and
/// the `s3_main` storage policy are dropped because the scratch database
/// exists only for one roundtrip.
pub fn integration_table_ddls(db: &str) -> [String; 8] {
    let t = |name: &str, cols: &str| {
        format!("CREATE TABLE IF NOT EXISTS {db}.{name} ({cols}) ENGINE = Memory")
    };
    [
        t(
            "blocks",
            "height UInt32, hash String, timestamp DateTime, size UInt32, \
             weight UInt32, version UInt32, bits UInt32, nonce UInt32, \
             merkle_root String, prev_hash String, tx_count UInt16, \
             difficulty Float64, chainwork String",
        ),
        t(
            "transactions",
            "txid String, block_height UInt32, block_hash String, \
             timestamp DateTime, version UInt32, locktime UInt32, size UInt32, \
             weight UInt32, vin_count UInt16, vout_count UInt16, \
             is_coinbase UInt8, total_out_sat UInt64, fee_sat Int64",
        ),
        t(
            "outputs",
            "txid String, output_index UInt16, value_sat UInt64, \
             script_pubkey_hex String, script_type String, address String, \
             spent UInt8, spending_txid String, block_height UInt32, \
             timestamp DateTime",
        ),
        t(
            "inputs",
            "txid String, input_index UInt16, prev_txid String, \
             prev_output_index UInt32, script_sig_hex String, sequence UInt32, \
             coinbase_data String, block_height UInt32, timestamp DateTime",
        ),
        t(
            "blocks_v2",
            "height UInt32, hash String, timestamp DateTime, size UInt32, \
             weight UInt32, version UInt32, bits UInt32, nonce UInt32, \
             merkle_root String, prev_hash String, tx_count UInt16, \
             difficulty Float64, chainwork String, reward_sat UInt64, \
             fee_total_sat UInt64, interval_sec Int32, updated_at UInt32",
        ),
        t(
            "transactions_v2",
            "txid String, block_height UInt32, block_hash String, \
             timestamp DateTime, version UInt32, locktime UInt32, \
             size UInt32, weight UInt32, vin_count UInt16, vout_count UInt16, \
             is_coinbase UInt8, total_out_sat UInt64, input_total_sat UInt64, \
             fee_sat Int64, fee_rate_sat_vbyte Float32, is_change_heavy UInt8, \
             updated_at UInt32",
        ),
        // Syncer flush order is inputs_v2 then outputs_v2.
        t(
            "inputs_v2",
            "txid String, input_index UInt16, prev_txid String, \
             prev_output_index UInt32, value_sat UInt64, script_sig_hex String, \
             sequence UInt32, coinbase_data String, block_height UInt32, \
             timestamp DateTime, updated_at UInt32",
        ),
        t(
            "outputs_v2",
            "txid String, output_index UInt16, value_sat UInt64, \
             script_pubkey_hex String, script_type String, address String, \
             spent UInt8, spending_txid String, spent_height UInt32, \
             spent_time UInt32, block_height UInt32, timestamp DateTime, \
             updated_at UInt32",
        ),
    ]
}
