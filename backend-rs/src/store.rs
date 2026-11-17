use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, Script};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub(crate) const CHALLENGE_TTL_SECS: u64 = 300;
const STATE_TTL_SECS: u64 = 600;
const RATE_WINDOW_SECS: u64 = 60;
const RETRY_BACKOFF_SECS: u64 = 30;
const MAX_MEMORY: usize = 10_000;

#[derive(Debug)]
pub struct StoreError;

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "store unavailable")
    }
}

impl std::error::Error for StoreError {}

fn now() -> Instant {
    Instant::now()
}

fn normalize_valkey_url(url: &str) -> String {
    if url.starts_with("valkey://") {
        url.replacen("valkey://", "redis://", 1)
    } else {
        url.to_string()
    }
}

pub fn random_hex32() -> String {
    let mut bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut bytes);
    hex::encode(bytes)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

struct StoreInner {
    valkey_url: String,
    client: Option<MultiplexedConnection>,
    failed_at: Option<Instant>,
    challenges: HashMap<String, (String, Instant)>,
    states: HashMap<String, Instant>,
    force_unavailable: bool,
}

#[derive(Clone)]
pub struct Store {
    inner: Arc<Mutex<StoreInner>>,
}

impl Store {
    pub fn new(valkey_url: String) -> Self {
        Self {
            inner: Arc::new(Mutex::new(StoreInner {
                valkey_url,
                client: None,
                failed_at: None,
                challenges: HashMap::new(),
                states: HashMap::new(),
                force_unavailable: false,
            })),
        }
    }

    async fn get_client<'a>(
        &self,
        inner: &'a mut StoreInner,
    ) -> Result<Option<&'a mut MultiplexedConnection>, StoreError> {
        if inner.force_unavailable {
            return Err(StoreError);
        }
        if let Some(ref mut client) = inner.client {
            return Ok(Some(client));
        }
        if let Some(failed_at) = inner.failed_at {
            if now().duration_since(failed_at) < Duration::from_secs(RETRY_BACKOFF_SECS) {
                return Ok(None);
            }
        }
        inner.failed_at = None;
        let url = normalize_valkey_url(&inner.valkey_url);
        match tokio::time::timeout(
            Duration::from_secs(1),
            redis::Client::open(url)
                .map_err(|_| StoreError)?
                .get_multiplexed_tokio_connection(),
        )
        .await
        {
            Ok(Ok(client)) => {
                inner.client = Some(client);
                Ok(inner.client.as_mut())
            }
            _ => {
                inner.failed_at = Some(now());
                Ok(None)
            }
        }
    }

    pub async fn issue_challenge(&self, pubkey: &str, challenge: &str) -> Result<(), StoreError> {
        let key = format!("nostr:chal:{}", pubkey);
        let mut inner = self.inner.lock().await;
        if let Some(client) = self.get_client(&mut inner).await? {
            match client
                .set_ex::<_, _, ()>(&key, challenge, CHALLENGE_TTL_SECS)
                .await
            {
                Ok(()) => return Ok(()),
                Err(_) => {
                    inner.client = None;
                    // Fall through to in-memory fallback.
                }
            }
        }
        self.evict_expired_challenges(&mut inner);
        inner.challenges.insert(
            pubkey.to_string(),
            (challenge.to_string(), now() + Duration::from_secs(CHALLENGE_TTL_SECS)),
        );
        Ok(())
    }

    pub async fn get_challenge(&self, pubkey: &str) -> Result<Option<String>, StoreError> {
        let key = format!("nostr:chal:{}", pubkey);
        let mut inner = self.inner.lock().await;
        if let Some(client) = self.get_client(&mut inner).await? {
            match client.get::<_, Option<String>>(&key).await {
                Ok(val) => return Ok(val),
                Err(_) => {
                    inner.client = None;
                    // Fall through to in-memory fallback.
                }
            }
        }
        Ok(self.mem_get_challenge(&mut inner, pubkey))
    }

    pub async fn consume_challenge(&self, pubkey: &str, challenge: &str) -> Result<bool, StoreError> {
        let key = format!("nostr:chal:{}", pubkey);
        let mut inner = self.inner.lock().await;
        if let Some(client) = self.get_client(&mut inner).await? {
            let script = Script::new(
                "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            );
            match script.key(&key).arg(challenge).invoke_async::<bool>(client).await {
                Ok(deleted) => return Ok(deleted),
                Err(_) => {
                    inner.client = None;
                    // Fall through to in-memory fallback.
                }
            }
        }
        let current = self.mem_get_challenge(&mut inner, pubkey);
        if current.as_ref().map(|c| constant_time_eq(c, challenge)).unwrap_or(false) {
            inner.challenges.remove(pubkey);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn issue_state(&self, state: &str) -> Result<(), StoreError> {
        let key = format!("oauth:state:{}", state);
        let mut inner = self.inner.lock().await;
        if let Some(client) = self.get_client(&mut inner).await? {
            match client
                .set_ex::<_, _, ()>(&key, "1", STATE_TTL_SECS)
                .await
            {
                Ok(()) => return Ok(()),
                Err(_) => {
                    inner.client = None;
                    // Fall through to memory rather than failing.
                }
            }
        }
        self.evict_expired_states(&mut inner);
        inner
            .states
            .insert(state.to_string(), now() + Duration::from_secs(STATE_TTL_SECS));
        Ok(())
    }

    pub async fn consume_state(&self, state: &str) -> Result<bool, StoreError> {
        let key = format!("oauth:state:{}", state);
        let mut inner = self.inner.lock().await;
        if let Some(client) = self.get_client(&mut inner).await? {
            match client.del::<_, i64>(&key).await {
                Ok(deleted) => return Ok(deleted > 0),
                Err(_) => {
                    inner.client = None;
                    // Fall through to memory.
                }
            }
        }
        if let Some(exp) = inner.states.get(state).copied() {
            if now() > exp {
                inner.states.remove(state);
                return Ok(false);
            }
            inner.states.remove(state);
            return Ok(true);
        }
        Ok(false)
    }

    pub async fn force_unavailable(&self, unavailable: bool) {
        self.inner.lock().await.force_unavailable = unavailable;
    }

    pub async fn force_expired(&self, pubkey: &str) {
        let mut inner = self.inner.lock().await;
        if let Some((challenge, _)) = inner.challenges.get(pubkey) {
            let challenge = challenge.clone();
            inner.challenges.insert(
                pubkey.to_string(),
                (challenge, now() - Duration::from_secs(1)),
            );
        }
    }

    fn mem_get_challenge(&self, inner: &mut StoreInner, pubkey: &str) -> Option<String> {
        let item = inner.challenges.get(pubkey)?;
        if now() > item.1 {
            inner.challenges.remove(pubkey);
            return None;
        }
        Some(item.0.clone())
    }

    fn evict_expired_challenges(&self, inner: &mut StoreInner) {
        if inner.challenges.len() < MAX_MEMORY {
            return;
        }
        let now = now();
        let expired: Vec<String> = inner
            .challenges
            .iter()
            .filter(|(_, (_, exp))| *exp <= now)
            .take(1000)
            .map(|(k, _)| k.clone())
            .collect();
        for k in expired {
            inner.challenges.remove(&k);
        }
    }

    fn evict_expired_states(&self, inner: &mut StoreInner) {
        if inner.states.len() < MAX_MEMORY {
            return;
        }
        let now = now();
        let expired: Vec<String> = inner
            .states
            .iter()
            .filter(|(_, exp)| **exp <= now)
            .take(1000)
            .map(|(k, _)| k.clone())
            .collect();
        for k in expired {
            inner.states.remove(&k);
        }
    }
}

#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
    window: Duration,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            window: Duration::from_secs(RATE_WINDOW_SECS),
        }
    }

    pub async fn check(&self, key: &str, limit: usize) -> bool {
        let mut map = self.inner.lock().await;
        let now = now();
        let deque = map.entry(key.to_string()).or_insert_with(VecDeque::new);
        while let Some(front) = deque.front() {
            if now.duration_since(*front) > self.window {
                deque.pop_front();
            } else {
                break;
            }
        }
        if deque.len() >= limit {
            return false;
        }
        deque.push_back(now);
        true
    }

    pub async fn reset(&self) {
        self.inner.lock().await.clear();
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

static STORE: OnceLock<Arc<Store>> = OnceLock::new();
static RATE_LIMITER: OnceLock<Arc<RateLimiter>> = OnceLock::new();

pub fn init(valkey_url: String) {
    STORE.get_or_init(|| Arc::new(Store::new(valkey_url)));
    RATE_LIMITER.get_or_init(|| Arc::new(RateLimiter::new()));
}

pub fn store() -> Arc<Store> {
    STORE.get().expect("store::init not called").clone()
}

pub fn rate_limiter() -> Arc<RateLimiter> {
    RATE_LIMITER.get().expect("store::init not called").clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn challenge_roundtrip_in_memory() {
        let s = Store::new("redis://localhost:0".into());
        s.issue_challenge("pk", "chal-1").await.unwrap();
        assert_eq!(s.get_challenge("pk").await.unwrap(), Some("chal-1".to_string()));
        assert!(s.consume_challenge("pk", "chal-1").await.unwrap());
        assert_eq!(s.get_challenge("pk").await.unwrap(), None);
    }

    #[tokio::test]
    async fn wrong_challenge_does_not_burn() {
        let s = Store::new("redis://localhost:0".into());
        s.issue_challenge("pk", "chal-1").await.unwrap();
        assert!(!s.consume_challenge("pk", "wrong").await.unwrap());
        assert_eq!(s.get_challenge("pk").await.unwrap(), Some("chal-1".to_string()));
    }

    #[tokio::test]
    async fn state_single_use() {
        let s = Store::new("redis://localhost:0".into());
        s.issue_state("state-1").await.unwrap();
        assert!(s.consume_state("state-1").await.unwrap());
        assert!(!s.consume_state("state-1").await.unwrap());
    }

    #[tokio::test]
    async fn rate_limiter_allows_exact_limit() {
        let rl = RateLimiter::new();
        for _ in 0..5 {
            assert!(rl.check("k", 5).await);
        }
        assert!(!rl.check("k", 5).await);
    }
}
