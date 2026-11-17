use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize, Clone)]
pub struct NostrEvent {
    pub id: String,
    pub pubkey: String,
    pub created_at: i64,
    pub kind: i64,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,
}

pub fn nostr_event_id(ev: &NostrEvent) -> String {
    let data = json!([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
    hex::encode(Sha256::digest(data.to_string().as_bytes()))
}

pub fn verify_nostr_event(ev: &NostrEvent) -> bool {
    let expected_id = nostr_event_id(ev);
    if ev.id != expected_id {
        return false;
    }
    let pub_bytes = match hex::decode(&ev.pubkey) {
        Ok(b) if b.len() == 32 => b,
        _ => return false,
    };
    let sig_bytes = match hex::decode(&ev.sig) {
        Ok(b) if b.len() == 64 => b,
        _ => return false,
    };
    let msg_bytes = match hex::decode(&ev.id) {
        Ok(b) if b.len() == 32 => b,
        _ => return false,
    };

    let secp = secp256k1::Secp256k1::verification_only();
    let pubkey = match secp256k1::XOnlyPublicKey::from_slice(&pub_bytes) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let sig = match secp256k1::schnorr::Signature::from_slice(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };
    secp.verify_schnorr(&sig, &msg_bytes, &pubkey).is_ok()
}

pub fn is_nip98(ev: &NostrEvent) -> bool {
    if ev.kind != 27235 {
        return false;
    }
    let names: std::collections::HashSet<&str> = ev
        .tags
        .iter()
        .filter_map(|t| t.first().map(String::as_str))
        .collect();
    names.contains("u") && names.contains("method")
}

pub fn is_hex64(v: &str) -> bool {
    v.len() == 64 && v.chars().all(|c| c.is_ascii_hexdigit())
}
