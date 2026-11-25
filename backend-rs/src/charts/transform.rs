use crate::ch::SeriesPoint;
use crate::error::ApiError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transform {
    Raw,
    Pct,
    Index,
    Zscore,
    Sma7,
    Sma30,
}

impl Transform {
    pub fn parse(raw: Option<&str>) -> Result<Self, ApiError> {
        match raw.unwrap_or("raw") {
            "raw" => Ok(Self::Raw),
            "pct" => Ok(Self::Pct),
            "index" => Ok(Self::Index),
            "zscore" => Ok(Self::Zscore),
            "sma7" => Ok(Self::Sma7),
            "sma30" => Ok(Self::Sma30),
            other => Err(ApiError::unprocessable(format!(
                "unknown transform {other:?}; expected raw, pct, index, zscore, sma7 or sma30"
            ))),
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Raw => "raw",
            Self::Pct => "%",
            Self::Index => "index=100",
            Self::Zscore => "z-score",
            Self::Sma7 => "SMA7",
            Self::Sma30 => "SMA30",
        }
    }
}

pub fn apply(points: &[SeriesPoint], transform: Transform) -> Vec<SeriesPoint> {
    match transform {
        Transform::Raw => points.to_vec(),
        Transform::Pct => pct(points),
        Transform::Index => index(points),
        Transform::Zscore => zscore(points),
        Transform::Sma7 => sma(points, 7),
        Transform::Sma30 => sma(points, 30),
    }
}

fn first_value(points: &[SeriesPoint]) -> Option<(usize, f64)> {
    // Skip leading zeros: a zero base cannot be normalised, and early BTC
    // price rows are legitimately zero in the sample data.
    points
        .iter()
        .enumerate()
        .find_map(|(i, p)| p.v.filter(|v| *v != 0.0).map(|v| (i, v)))
}

fn pct(points: &[SeriesPoint]) -> Vec<SeriesPoint> {
    let Some((anchor, base)) = first_value(points) else {
        return points.to_vec();
    };
    points
        .iter()
        .enumerate()
        .map(|(i, p)| SeriesPoint {
            t: p.t.clone(),
            v: match p.v {
                Some(v) if i >= anchor && base != 0.0 => Some((v / base - 1.0) * 100.0),
                _ => None,
            },
        })
        .collect()
}

fn index(points: &[SeriesPoint]) -> Vec<SeriesPoint> {
    let Some((anchor, base)) = first_value(points) else {
        return points.to_vec();
    };
    points
        .iter()
        .enumerate()
        .map(|(i, p)| SeriesPoint {
            t: p.t.clone(),
            v: match p.v {
                Some(v) if i >= anchor && base != 0.0 => Some(v / base * 100.0),
                _ => None,
            },
        })
        .collect()
}

fn zscore(points: &[SeriesPoint]) -> Vec<SeriesPoint> {
    let values: Vec<f64> = points.iter().filter_map(|p| p.v).collect();
    if values.is_empty() {
        return points.to_vec();
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
    let std = variance.sqrt();
    points
        .iter()
        .map(|p| SeriesPoint {
            t: p.t.clone(),
            v: p.v.map(|v| if std == 0.0 { 0.0 } else { (v - mean) / std }),
        })
        .collect()
}

fn sma(points: &[SeriesPoint], window: usize) -> Vec<SeriesPoint> {
    let mut out = Vec::with_capacity(points.len());
    let mut values: Vec<f64> = Vec::new();
    for p in points {
        match p.v {
            Some(v) => {
                values.push(v);
                if values.len() > window {
                    values.remove(0);
                }
                let avg = if values.len() == window {
                    Some(values.iter().sum::<f64>() / window as f64)
                } else {
                    None
                };
                out.push(SeriesPoint {
                    t: p.t.clone(),
                    v: avg,
                });
            }
            None => out.push(SeriesPoint {
                t: p.t.clone(),
                v: None,
            }),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pts(values: &[Option<f64>]) -> Vec<SeriesPoint> {
        values
            .iter()
            .enumerate()
            .map(|(i, v)| SeriesPoint {
                t: format!("d{i}"),
                v: *v,
            })
            .collect()
    }

    #[test]
    fn pct_uses_first_visible_value() {
        let out = apply(&pts(&[Some(100.0), Some(110.0)]), Transform::Pct);
        assert!((out[1].v.unwrap() - 10.0).abs() < 1e-9);
    }

    #[test]
    fn index_starts_at_100() {
        let out = apply(&pts(&[Some(50.0), Some(75.0)]), Transform::Index);
        assert_eq!(out[1].v, Some(150.0));
    }

    #[test]
    fn index_skips_leading_zeros() {
        let out = apply(
            &pts(&[Some(0.0), Some(0.0), Some(10.0), Some(20.0)]),
            Transform::Index,
        );
        assert_eq!(out[0].v, None);
        assert_eq!(out[1].v, None);
        assert_eq!(out[2].v, Some(100.0));
        assert_eq!(out[3].v, Some(200.0));
    }

    #[test]
    fn zscore_preserves_nulls() {
        let out = apply(&pts(&[Some(1.0), None, Some(3.0)]), Transform::Zscore);
        assert_eq!(out[1].v, None);
    }

    #[test]
    fn sma_needs_a_full_window() {
        let out = apply(
            &pts(&[Some(1.0), Some(2.0), Some(3.0), Some(4.0)]),
            Transform::Sma7,
        );
        assert_eq!(out[3].v, None);
    }

    #[test]
    fn rejects_unknown_transform() {
        assert_eq!(Transform::parse(Some("sql")).unwrap_err().status, 422);
    }
}
