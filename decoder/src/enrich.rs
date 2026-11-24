//! Enrichment math for the ClickHouse writer (Task 3).
//!
//! Mirrors Go `decoder/internal/enrich/subsidy.go` and the `changeHeavy`
//! helper in `decoder/internal/clickhouse/client_v2.go`.

/// Block subsidy in satoshis: `50 BTC >> (height / 210000)`; 0 past 64 halvings.
pub fn subsidy_at(height: u32) -> u64 {
    let halvings = height / 210_000;
    if halvings >= 64 {
        return 0;
    }
    (50 * 100_000_000u64) >> halvings
}

/// Fee rate in sat/vbyte; 0 when `vsize` is 0.
pub fn fee_rate(fee_sat: i64, vsize: u32) -> f32 {
    if vsize == 0 {
        return 0.0;
    }
    fee_sat as f32 / vsize as f32
}

/// Balance bucket name; bounds match Go `BucketFor` verbatim.
pub fn bucket_for(balance_sat: i64) -> &'static str {
    if balance_sat < 1_000 {
        "dust"
    } else if balance_sat < 1_000_000 {
        "shrimp"
    } else if balance_sat < 10_000_000 {
        "crab"
    } else if balance_sat < 100_000_000 {
        "fish"
    } else if balance_sat < 1_000_000_000 {
        "shark"
    } else if balance_sat < 1_000_000_000_000 {
        "whale"
    } else {
        "humpback"
    }
}

/// Mining difficulty from compact nBits (standard max_target / target).
/// Genesis bits 0x1d00ffff give exactly 1.0. Zero/degenerate targets yield 0.0
/// (matches the historical backfill sentinel) instead of infinity.
pub fn difficulty_from_bits(bits: u32) -> f64 {
    use bitcoin::pow::{CompactTarget, Target};
    let d = Target::from_compact(CompactTarget::from_consensus(bits)).difficulty_float();
    if d.is_finite() && d >= 0.0 {
        d
    } else {
        0.0
    }
}

/// 1 when over half the outputs reuse an address (duplicate addresses within
/// the same tx; input addresses are unresolvable from the value-only UTXO
/// map, same documented approximation as Go `changeHeavy`).
pub fn change_heavy(addrs: &[String]) -> u8 {
    use std::collections::HashMap;
    if addrs.is_empty() {
        return 0;
    }
    let mut seen: HashMap<&str, usize> = HashMap::with_capacity(addrs.len());
    for a in addrs {
        if !a.is_empty() {
            *seen.entry(a.as_str()).or_insert(0) += 1;
        }
    }
    let reused = addrs
        .iter()
        .filter(|a| !a.is_empty() && seen[a.as_str()] > 1)
        .count();
    u8::from(reused * 2 > addrs.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subsidy_schedule() {
        assert_eq!(subsidy_at(0), 5_000_000_000);
        assert_eq!(subsidy_at(210_000), 2_500_000_000);
        assert_eq!(subsidy_at(840_000), 312_500_000);
    }

    #[test]
    fn fee_rate_and_buckets() {
        assert_eq!(fee_rate(1000, 250), 4.0);
        assert_eq!(bucket_for(500), "dust");
        assert_eq!(bucket_for(150_000_000_000), "whale");
    }

    #[test]
    fn difficulty_from_compact_bits() {
        // Genesis target == difficulty 1 by definition.
        assert_eq!(difficulty_from_bits(0x1d00ffff), 1.0);
        // Lower target -> higher difficulty (mainnet block 300000 era).
        let d = difficulty_from_bits(0x1b0404cb);
        assert!((d - 16307.420938523983).abs() < 1e-6, "got {d}");
        // Degenerate zero target saturates to the 0.0 sentinel, not inf.
        assert_eq!(difficulty_from_bits(0), 0.0);
    }

    #[test]
    fn change_heavy_duplicates() {
        assert_eq!(change_heavy(&[]), 0);
        assert_eq!(
            change_heavy(&["a".into(), "b".into(), "c".into()]),
            0
        );
        assert_eq!(
            change_heavy(&["a".into(), "a".into(), "b".into()]),
            1
        );
    }
}
