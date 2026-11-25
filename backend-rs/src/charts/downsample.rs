//! Server-side downsampling.
//!
//! Onchain series contain isolated spikes (CDD, realized PnL) that LTTB can
//! drop. We bucket the series and keep first/min/max/last of each bucket. That
//! preserves endpoints, gaps and extrema, and bounds the response size.
//!
//! Ruling: min/max bucketing instead of LTTB — LTTB is a visual approximation
//! that can lose single-bar spikes; this keeps the acceptance requirement
//! "LTTB must preserve min/max points" true by construction. Cost: the point
//! count can be up to 4 per bucket, so `max_points` is an upper bound, not an
//! exact target.

use crate::ch::SeriesPoint;

pub fn downsample(points: &[SeriesPoint], max_points: usize) -> Vec<SeriesPoint> {
    if max_points == 0 || points.len() <= max_points {
        return points.to_vec();
    }
    if max_points < 4 {
        return points.iter().take(max_points).cloned().collect();
    }

    let target_buckets = (max_points / 4).max(1);
    let bucket_size = ((points.len() as f64) / (target_buckets as f64)).ceil() as usize;
    let mut out: Vec<SeriesPoint> = Vec::with_capacity(max_points);
    let mut last_index: Option<usize> = None;

    let mut start = 0;
    while start < points.len() {
        let end = (start + bucket_size).min(points.len());
        let bucket = &points[start..end];

        let mut first = 0usize;
        let mut last = bucket.len() - 1;
        let mut min_i: Option<usize> = None;
        let mut max_i: Option<usize> = None;
        for (i, p) in bucket.iter().enumerate() {
            let Some(v) = p.v else { continue };
            match min_i {
                Some(j) if bucket[j].v.unwrap_or(f64::INFINITY) <= v => {}
                _ => min_i = Some(i),
            }
            match max_i {
                Some(j) if bucket[j].v.unwrap_or(f64::NEG_INFINITY) >= v => {}
                _ => max_i = Some(i),
            }
        }

        let mut picks = vec![first, last];
        if let Some(i) = bucket.iter().position(|p| p.v.is_none()) {
            picks.push(i);
        }
        if let Some(i) = min_i {
            picks.push(i);
        }
        if let Some(i) = max_i {
            picks.push(i);
        }
        picks.sort_unstable();
        picks.dedup();

        for i in picks {
            let absolute = start + i;
            if last_index != Some(absolute) {
                out.push(points[absolute].clone());
                last_index = Some(absolute);
            }
        }
        let _ = &mut first;
        let _ = &mut last;
        start = end;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(t: &str, v: Option<f64>) -> SeriesPoint {
        SeriesPoint {
            t: t.to_string(),
            v,
        }
    }

    #[test]
    fn short_series_is_unchanged() {
        let pts = vec![p("a", Some(1.0)), p("b", Some(2.0))];
        assert_eq!(downsample(&pts, 10).len(), 2);
    }

    #[test]
    fn keeps_endpoints_and_spike() {
        let mut pts = Vec::new();
        for i in 0..1000 {
            pts.push(p(&format!("d{i}"), Some(1.0)));
        }
        pts[500].v = Some(9999.0);
        let out = downsample(&pts, 200);
        assert!(out.len() <= 200);
        assert_eq!(out.first().unwrap().t, "d0");
        assert_eq!(out.last().unwrap().t, "d999");
        assert!(out.iter().any(|x| x.v == Some(9999.0)));
    }

    #[test]
    fn gaps_are_preserved_as_gaps() {
        let pts: Vec<SeriesPoint> = (0..100)
            .map(|i| {
                p(
                    &format!("d{i}"),
                    if i == 50 { None } else { Some(i as f64) },
                )
            })
            .collect();
        let out = downsample(&pts, 20);
        assert!(out.iter().any(|x| x.v.is_none()));
    }
}
