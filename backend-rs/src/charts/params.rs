use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Allowlisted chart parameters. Unknown keys are rejected with 422; user input
/// is never interpolated into SQL.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq)]
pub struct ChartParams {
    #[serde(default)]
    pub ma_length: Option<u32>,
    #[serde(default)]
    pub z_window: Option<u32>,
    #[serde(default)]
    pub smoothing: Option<String>,
    #[serde(default)]
    pub bins: Option<u32>,
    #[serde(default)]
    pub quantile_window: Option<String>,
    #[serde(default)]
    pub cohort: Option<String>,
}

impl ChartParams {
    pub fn parse(raw: Option<&str>) -> Result<Self, ApiError> {
        let Some(raw) = raw else {
            return Ok(Self::default());
        };
        if raw.trim().is_empty() {
            return Ok(Self::default());
        }
        let value: serde_json::Value = serde_json::from_str(raw)
            .map_err(|_| ApiError::unprocessable("params must be a JSON object"))?;
        let object = value
            .as_object()
            .ok_or_else(|| ApiError::unprocessable("params must be a JSON object"))?;

        let allowed = [
            "ma_length",
            "z_window",
            "smoothing",
            "bins",
            "quantile_window",
            "cohort",
        ];
        for key in object.keys() {
            if !allowed.contains(&key.as_str()) {
                return Err(ApiError::unprocessable(format!(
                    "unknown chart parameter {key:?}"
                )));
            }
        }

        let parsed: Self = serde_json::from_value(value)
            .map_err(|_| ApiError::unprocessable("invalid chart parameter type"))?;
        parsed.validate()?;
        Ok(parsed)
    }

    pub fn validate(&self) -> Result<(), ApiError> {
        if let Some(n) = self.ma_length {
            if !(2..=400).contains(&n) {
                return Err(ApiError::unprocessable(
                    "ma_length must be between 2 and 400",
                ));
            }
        }
        if let Some(n) = self.z_window {
            if !(30..=4000).contains(&n) {
                return Err(ApiError::unprocessable(
                    "z_window must be between 30 and 4000",
                ));
            }
        }
        if let Some(n) = self.bins {
            if !(10..=100).contains(&n) {
                return Err(ApiError::unprocessable("bins must be between 10 and 100"));
            }
        }
        if let Some(s) = &self.smoothing {
            if !matches!(s.as_str(), "none" | "sma7" | "sma30" | "ema") {
                return Err(ApiError::unprocessable(
                    "smoothing must be none, sma7, sma30 or ema",
                ));
            }
        }
        if let Some(q) = &self.quantile_window {
            if !matches!(q.as_str(), "1y" | "2y" | "4y" | "all") {
                return Err(ApiError::unprocessable(
                    "quantile_window must be 1y, 2y, 4y or all",
                ));
            }
        }
        if let Some(c) = &self.cohort {
            if !matches!(c.as_str(), "all" | "sth" | "lth") {
                return Err(ApiError::unprocessable("cohort must be all, sth or lth"));
            }
        }
        Ok(())
    }

    pub fn as_map(&self) -> BTreeMap<String, String> {
        let mut out = BTreeMap::new();
        if let Some(v) = self.ma_length {
            out.insert("ma_length".into(), v.to_string());
        }
        if let Some(v) = self.z_window {
            out.insert("z_window".into(), v.to_string());
        }
        if let Some(v) = &self.smoothing {
            out.insert("smoothing".into(), v.clone());
        }
        if let Some(v) = self.bins {
            out.insert("bins".into(), v.to_string());
        }
        if let Some(v) = &self.quantile_window {
            out.insert("quantile_window".into(), v.clone());
        }
        if let Some(v) = &self.cohort {
            out.insert("cohort".into(), v.clone());
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_parameter() {
        let err = ChartParams::parse(Some(r#"{"sql":"drop table"}"#)).unwrap_err();
        assert_eq!(err.status, 422);
        assert!(err.message.contains("unknown chart parameter"));
    }

    #[test]
    fn rejects_out_of_range_bins() {
        let err = ChartParams::parse(Some(r#"{"bins":1000}"#)).unwrap_err();
        assert_eq!(err.status, 422);
    }

    #[test]
    fn accepts_allowlisted_values() {
        let p = ChartParams::parse(Some(
            r#"{"ma_length":200,"z_window":365,"bins":40,"cohort":"sth"}"#,
        ))
        .unwrap();
        assert_eq!(p.ma_length, Some(200));
        assert_eq!(p.cohort.as_deref(), Some("sth"));
    }

    #[test]
    fn rejects_bad_cohort() {
        assert_eq!(
            ChartParams::parse(Some(r#"{"cohort":"whale"}"#))
                .unwrap_err()
                .status,
            422
        );
    }
}
