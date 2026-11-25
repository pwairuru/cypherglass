//! Catalog-driven chart platform.
//!
//! `docs/charts/chart-catalog.yaml` is the source of truth. The build script
//! writes the same camelCase JSON consumed here and by the frontend.

pub mod alerts;
pub mod annotations;
pub mod catalog;
pub mod downsample;
pub mod layouts;
pub mod params;
pub mod routes;
pub mod series;
pub mod transform;

pub use catalog::{chart, charts, Catalog};
