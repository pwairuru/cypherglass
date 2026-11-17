//! Output-script address extraction (Task 3).
//!
//! Mirrors Go `decoder/internal/parser/address.go`: `ExtractPkScriptAddrs`
//! on mainnet, returning the first address plus the `txscript` script-class
//! string. Unaddressable scripts yield `""` with their class name.
//!
//! Primary derivation is `bitcoin::Address::from_script` (P2PKH, P2SH,
//! witness programs). Bare pubkey and multisig scripts are not convertible
//! by `from_script`, so — like Go, which returns one pubkey-hash address
//! per VALID pubkey (skipping unparsable ones) and keeps the first — the
//! HASH160 P2PKH address of the first valid pubkey is used, hashed over the
//! canonical serialization (compressed as-is, hybrid as `04||x||y`).
//! Class checks run in Go's
//! `ExtractPkScriptAddrs` order (pubkeyhash, scripthash, pubkey, multisig,
//! nulldata, witness v0/v1); Go never returns an error from that function,
//! so every script maps to a class string.

use bitcoin::hashes::{hash160, Hash};
use bitcoin::{Address, Network, Script};

/// Extract the first mainnet address for `script` plus its script-type name.
///
/// Type strings match Go `txscript.ScriptClass.String()`: `pubkeyhash`,
/// `scripthash`, `pubkey`, `multisig`, `nulldata`, `witness_v0_keyhash`,
/// `witness_v0_scripthash`, `witness_v1_taproot`, `witness_unknown`,
/// `nonstandard`.
pub fn extract_address(script: &[u8]) -> (String, String) {
    let class = classify(script);
    let spk = Script::from_bytes(script);
    if let Ok(addr) = Address::from_script(spk, Network::Bitcoin) {
        return (addr.to_string(), class.to_string());
    }
    // Go parity for bare pubkey / multisig: P2PKH address of the first
    // valid pubkey (`ExtractPkScriptAddrs` keeps `addresses[0]`).
    if let Some(addr) = first_pubkey_address(script, class) {
        return (addr, class.to_string());
    }
    (String::new(), class.to_string())
}

/// Script-class string in Go `ExtractPkScriptAddrs` check order.
fn classify(script: &[u8]) -> &'static str {
    if is_pubkeyhash(script) {
        "pubkeyhash"
    } else if is_scripthash(script) {
        "scripthash"
    } else if is_pubkey(script) {
        "pubkey"
    } else if is_multisig(script) {
        "multisig"
    } else if is_nulldata(script) {
        "nulldata"
    } else if is_witness_v0_keyhash(script) {
        "witness_v0_keyhash"
    } else if is_witness_v0_scripthash(script) {
        "witness_v0_scripthash"
    } else if is_witness_v1_taproot(script) {
        "witness_v1_taproot"
    } else if is_witness_program(script) {
        "witness_unknown"
    } else {
        "nonstandard"
    }
}

fn is_pubkeyhash(s: &[u8]) -> bool {
    s.len() == 25 && s[0] == 0x76 && s[1] == 0xa9 && s[2] == 0x14 && s[23] == 0x88 && s[24] == 0xac
}

fn is_scripthash(s: &[u8]) -> bool {
    s.len() == 23 && s[0] == 0xa9 && s[1] == 0x14 && s[22] == 0x87
}

/// `OP_DATA_33 <33B> OP_CHECKSIG` or `OP_DATA_65 <65B> OP_CHECKSIG`.
fn is_pubkey(s: &[u8]) -> bool {
    (s.len() == 35 && s[0] == 0x21 && s[34] == 0xac)
        || (s.len() == 67 && s[0] == 0x41 && s[66] == 0xac)
}

/// `OP_m <pubkey pushes> OP_n OP_CHECKMULTISIG` with 1 <= m <= n <= 16.
fn multisig_pubkeys(s: &[u8]) -> Option<Vec<&[u8]>> {
    if s.len() < 4 || s[s.len() - 1] != 0xae {
        return None;
    }
    let m = small_int(s[0])?;
    let n = small_int(s[s.len() - 2])?;
    if m < 1 || n < 1 || m > n || n > 16 {
        return None;
    }
    let mut keys = Vec::with_capacity(n as usize);
    let mut i = 1;
    while i < s.len() - 2 {
        let (data, next) = read_push(&s[i..])?;
        keys.push(data);
        i += next;
    }
    if keys.len() != n as usize {
        return None;
    }
    Some(keys)
}

fn is_multisig(s: &[u8]) -> bool {
    multisig_pubkeys(s).is_some()
}

/// `OP_RETURN` followed by push-only data (Go `isNullDataScript` parity).
fn is_nulldata(s: &[u8]) -> bool {
    if s.is_empty() || s[0] != 0x6a {
        return false;
    }
    let mut i = 1;
    while i < s.len() {
        match read_push(&s[i..]) {
            Some((_, next)) => i += next,
            None => {
                // OP_0 and OP_1..OP_16 are push-only single-byte opcodes.
                if s[i] == 0x00 || (0x51..=0x60).contains(&s[i]) {
                    i += 1;
                } else {
                    return false;
                }
            }
        }
    }
    true
}

fn is_witness_v0_keyhash(s: &[u8]) -> bool {
    s.len() == 22 && s[0] == 0x00 && s[1] == 0x14
}

fn is_witness_v0_scripthash(s: &[u8]) -> bool {
    s.len() == 34 && s[0] == 0x00 && s[1] == 0x20
}

fn is_witness_v1_taproot(s: &[u8]) -> bool {
    s.len() == 34 && s[0] == 0x51 && s[1] == 0x20
}

/// Any other versioned witness program: `OP_0|OP_1..OP_16 <2..40B push>`.
fn is_witness_program(s: &[u8]) -> bool {
    if s.len() < 4 || s.len() > 42 {
        return false;
    }
    let ver = s[0];
    if ver != 0x00 && !(0x51..=0x60).contains(&ver) {
        return false;
    }
    let (data, next) = match read_push(&s[1..]) {
        Some(v) => v,
        None => return false,
    };
    data.len() >= 2 && data.len() <= 40 && 1 + next == s.len()
}

/// OP_m/OP_n value, i.e. `OP_1..=OP_16`.
fn small_int(op: u8) -> Option<i32> {
    if (0x51..=0x60).contains(&op) {
        Some((op - 0x50) as i32)
    } else {
        None
    }
}

/// Parse one data push at the head of `s`: `(pushed bytes, bytes consumed)`.
fn read_push(s: &[u8]) -> Option<(&[u8], usize)> {
    let op = *s.first()?;
    if (0x01..=0x4b).contains(&op) {
        let n = op as usize;
        if s.len() < 1 + n {
            return None;
        }
        Some((&s[1..1 + n], 1 + n))
    } else if op == 0x4c {
        // OP_PUSHDATA1.
        let n = *s.get(1)? as usize;
        if s.len() < 2 + n {
            return None;
        }
        Some((&s[2..2 + n], 2 + n))
    } else if op == 0x4d {
        // OP_PUSHDATA2.
        let n = u16::from_le_bytes([*s.get(1)?, *s.get(2)?]) as usize;
        if s.len() < 3 + n {
            return None;
        }
        Some((&s[3..3 + n], 3 + n))
    } else {
        None
    }
}

/// Canonical on-curve pubkey bytes for hashing, or `None` when Go would
/// yield no address.
///
/// Go parity chain (`txscript/standard.go` + `btcutil/address.go` +
/// `btcec`/`secp256k1`, all verified against the vendored sources and by
/// executing `ExtractPkScriptAddrs` on the test vectors below):
/// - class detection is shape-only (`isStrictPubKeyEncoding`: 33B `02`/`03`,
///   65B `04`/`06`/`07`);
/// - `NewAddressPubKey` then runs `btcec.ParsePubKey`, which validates the
///   curve point AND the hybrid parity bit (`06` = even y, `07` = odd y;
///   decred secp256k1 rejects mismatches);
/// - an unparsable key yields the class with an EMPTY address list, and in
///   multisig such keys are SKIPPED (`Convert the public keys while skipping
///   any that are invalid`);
/// - the hashed bytes are the CANONICAL serialization: compressed for
///   `02`/`03`, uncompressed `04||x||y` for `04`/`06`/`07` (hybrid inputs
///   hash as `04...`, so valid `07` + odd-y hashes to the same address as
///   the `04` form).
///
/// This function returns the canonical bytes (validating everything above);
/// multisig callers filter with it, pubkey callers hash with it.
fn canonical_pubkey(data: &[u8]) -> Option<Vec<u8>> {
    match data.len() {
        33 if data[0] == 0x02 || data[0] == 0x03 => {
            let pk = secp256k1::PublicKey::from_slice(data).ok()?;
            Some(pk.serialize().to_vec())
        }
        65 if data[0] == 0x04 || data[0] == 0x06 || data[0] == 0x07 => {
            if data[0] != 0x04 {
                // Hybrid parity bit must match y (Go rejects mismatches).
                let y_odd = data[64] & 1 == 1;
                if (data[0] == 0x07) != y_odd {
                    return None;
                }
            }
            // Normalize to uncompressed for validation + hashing (Go parity).
            let mut norm = data.to_vec();
            norm[0] = 0x04;
            secp256k1::PublicKey::from_slice(&norm).ok()?;
            Some(norm)
        }
        _ => None,
    }
}

/// Valid secp256k1 pubkey: strict-encoding shape AND on-curve (see
/// [`canonical_pubkey`]).
fn is_valid_pubkey(data: &[u8]) -> bool {
    canonical_pubkey(data).is_some()
}

/// Go parity for `pubkey` / `multisig`: P2PKH address of the first valid
/// pubkey. `None` when no push holds a valid pubkey (Go then yields an
/// empty address list, i.e. `""` with the class name).
fn first_pubkey_address(script: &[u8], class: &str) -> Option<String> {
    let first = match class {
        "pubkey" => {
            let (data, _) = read_push(script)?;
            // `read_push` consumes the leading `OP_DATA_n`; the trailing
            // `OP_CHECKSIG` is structural (checked by `is_pubkey`).
            if script.len() != data.len() + 2 {
                return None;
            }
            data
        }
        "multisig" => multisig_pubkeys(script)?
            .into_iter()
            .find(|k| is_valid_pubkey(k))?,
        _ => return None,
    };
    if !is_valid_pubkey(first) {
        return None;
    }
    // Hash the CANONICAL serialization (Go `AddressPubKey.serialize`:
    // compressed stays compressed, hybrid normalizes to `04||x||y`).
    let canonical = canonical_pubkey(first)?;
    let hash = hash160::Hash::hash(&canonical);
    Some(Address::p2pkh(hash, Network::Bitcoin).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn genesis_p2pkh_vector() {
        // NOTE: brief printed `...ebb88f188ac` (49 hex chars, undecodable);
        // corrected to `...ebb88f1888ac`: hash160 `...ebb88f18` + `88ac`
        // suffix, verified as HASH160(genesis pubkey) via python hashlib.
        let script = hex::decode("76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac").unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert_eq!(typ, "pubkeyhash");
    }

    #[test]
    fn genesis_p2pk_vector() {
        // Genesis block coinbase pkScript (bare pubkey); Go derives the
        // pubkey-hash address, same string as the P2PKH vector above.
        let script = hex::decode(
            "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb\
             649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac",
        )
        .unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert_eq!(typ, "pubkey");
    }

    #[test]
    fn bip173_p2wpkh_vector() {
        let script = hex::decode("0014751e76e8199196d454941c45d1b3a323f1433bd6").unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
        assert_eq!(typ, "witness_v0_keyhash");
    }

    #[test]
    fn nulldata_and_nonstandard() {
        let op_return = hex::decode("6a0b68656c6c6f20776f726c64").unwrap();
        let (addr, typ) = extract_address(&op_return);
        assert_eq!(addr, "");
        assert_eq!(typ, "nulldata");

        let (addr, typ) = extract_address(&[]);
        assert_eq!(addr, "");
        assert_eq!(typ, "nonstandard");
    }

    #[test]
    fn multisig_first_pubkey_parity() {
        // 1-of-2 multisig led by the genesis pubkey: Go returns one address
        // per pubkey and the caller keeps addresses[0].
        let genesis_pk = "04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb\
                          649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f";
        let other_pk = "021111111111111111111111111111111111111111111111111111111111111111";
        let script =
            hex::decode(["51", "41", genesis_pk, "21", other_pk, "52", "ae"].concat()).unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert_eq!(typ, "multisig");
    }

    // All expected values below were produced by executing Go
    // `txscript.ExtractPkScriptAddrs` (btcd v0.24.2, the pinned dep) on the
    // same scripts via a docker probe — parity is measured, not assumed.
    // Compressed Satoshi key (valid control):
    // 02678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb6
    const COMP_SATOSHI: &str = "02678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb6";
    // x = 5 / x = 7 are provably off-curve (Legendre(x^3+7) = -1 mod p).
    const INV_X5: &str = "020000000000000000000000000000000000000000000000000000000000000005";
    const INV_X7: &str = "020000000000000000000000000000000000000000000000000000000000000007";

    #[test]
    fn invalid_curve_pubkey_yields_empty() {
        // Shape-valid (33B `02`) but off-curve: Go classifies `pubkey` and
        // `NewAddressPubKey` fails, so the address list is empty.
        let script = hex::decode(format!("21{INV_X5}ac")).unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "");
        assert_eq!(typ, "pubkey");
    }

    #[test]
    fn valid_compressed_p2pk_vector() {
        let script = hex::decode(format!("21{COMP_SATOSHI}ac")).unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "1GgkcZcXsMNeoxAqc6iEUq6QrP4SW9aTa2");
        assert_eq!(typ, "pubkey");
    }

    #[test]
    fn invalid_curve_multisig_skips_invalid() {
        // Go converts multisig pubkeys "while skipping any that are invalid":
        // the off-curve leader is skipped, the valid key yields the address.
        let script = hex::decode(format!("5121{INV_X5}21{COMP_SATOSHI}52ae")).unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "1GgkcZcXsMNeoxAqc6iEUq6QrP4SW9aTa2");
        assert_eq!(typ, "multisig");
    }

    #[test]
    fn all_invalid_multisig_yields_empty() {
        let script = hex::decode(format!("5121{INV_X5}21{INV_X7}52ae")).unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "");
        assert_eq!(typ, "multisig");
    }

    #[test]
    fn hybrid_prefix_must_match_y_parity() {
        // Satoshi key y is odd (ends 0x5f): Go/decred rejects `06` with
        // "y oddness does not match", accepts `07` and hashes the canonical
        // `04||x||y` (same address as the uncompressed form).
        let x = &COMP_SATOSHI[2..];
        let y = "49f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f";
        let bad = hex::decode(format!("4106{x}{y}ac")).unwrap();
        let (addr, typ) = extract_address(&bad);
        assert_eq!(addr, "");
        assert_eq!(typ, "pubkey");
        let good = hex::decode(format!("4107{x}{y}ac")).unwrap();
        let (addr, typ) = extract_address(&good);
        assert_eq!(addr, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
        assert_eq!(typ, "pubkey");
    }

    #[test]
    fn p2sh_vector() {
        // Redeem: 1-of-2 multisig (genesis key + 0x11..11); address + script
        // generated by an independent python implementation (base58check
        // validated against the genesis P2PKH address first).
        let script = hex::decode("a914932423ff2dc0b75c18e59773069f7a97a57401a187").unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(addr, "3F72YqUanp3ydqUfphcNvpL4AnZWsKGNyT");
        assert_eq!(typ, "scripthash");
    }

    #[test]
    fn p2wsh_vector() {
        // Witness program sha256(b'fixwave-witness-script'); bech32 encoder
        // validated against the BIP173 P2WPKH vector first.
        let script =
            hex::decode("0020f345881111914757f9a888f0a69c6680fc5c22c9e8f7060b2ac5db13c926b283")
                .unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(
            addr,
            "bc1q7dzcsyg3j9r407dg3rc2d8rxsr79cgkfarmsvze2chd38jfxk2pszfyt7d"
        );
        assert_eq!(typ, "witness_v0_scripthash");
    }

    #[test]
    fn p2tr_vector() {
        // Witness program sha256(b'fixwave-taproot-key'); bech32m encoder
        // validated by constant discrimination (accepts 0x2bc830a3, rejects
        // 1 on the same string and vice versa on a bech32 string) plus a
        // decode roundtrip of the program bytes.
        let script =
            hex::decode("512025a74dc94785f08e1e544333776406c6884d1bc597c986ba9abff3be942c76e6")
                .unwrap();
        let (addr, typ) = extract_address(&script);
        assert_eq!(
            addr,
            "bc1pykn5mj28shcgu8j5gvehweqxc6yy6x79jlycdw56hlema9pvwmnqces8v8"
        );
        assert_eq!(typ, "witness_v1_taproot");
    }
}
