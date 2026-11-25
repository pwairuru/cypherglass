#!/usr/bin/env python3
"""Validate the chart catalog against the metric registry.

This is a CI gate. It fails if:
  * a registry metric is not referenced by any chart;
  * a chart references an unknown metric;
  * a chart is missing required fields;
  * an OHLC series references an unknown metric;
  * a default metric is missing;
  * two charts share an id;
  * the parity ledger references an unknown chart id.

Usage:
  python3 scripts/verify_chart_catalog.py
  python3 scripts/verify_chart_catalog.py --ledger docs/charts/parity-ledger.md
  python3 scripts/verify_chart_catalog.py --self-test
"""

from __future__ import annotations

import argparse
import copy
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "backend-rs/src/metrics/registry.rs"
CATALOG = ROOT / "docs/charts/chart-catalog.yaml"
LEDGER = ROOT / "docs/charts/parity-ledger.md"

REQUIRED = [
    "id",
    "title",
    "category",
    "status",
    "phase",
    "priority",
    "question",
    "archetype",
    "axes",
    "metrics",
    "default_metric",
    "series",
    "variants",
    "controls",
    "expected",
    "acceptance",
]

CHART_ID_RE = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")


def registry_metrics(path: Path = REGISTRY) -> dict[str, dict]:
    src = path.read_text(encoding="utf-8")
    blocks = re.findall(r"Metric\s*\{(.*?)\n\s*\}", src, re.S)
    metrics: dict[str, dict] = {}
    for block in blocks:
        def field(name: str) -> str | None:
            m = re.search(rf'{name}:\s*r#"(.*?)"#', block, re.S)
            return m.group(1) if m else None

        mid = field("id")
        if not mid:
            continue
        disabled = re.search(r"disabled:\s*(true|false)", block)
        metrics[mid] = {
            "id": mid,
            "title": field("title") or mid,
            "category": field("category") or "other",
            "unit": field("unit") or "value",
            "grain": field("grain") or "none",
            "disabled": bool(disabled and disabled.group(1) == "true"),
        }
    return metrics


def load_catalog(path: Path = CATALOG) -> dict:
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def validate(catalog: dict, metrics: dict[str, dict]) -> list[str]:
    errors: list[str] = []
    charts = catalog.get("charts") or []
    if not charts:
        return ["catalog has no charts"]

    covered: set[str] = set()
    seen_ids: set[str] = set()
    archetypes = set((catalog.get("archetypes") or {}).keys())

    for chart in charts:
        cid = chart.get("id", "<missing>")
        for key in REQUIRED:
            if key not in chart:
                errors.append(f"{cid}: missing field {key}")
        if cid in seen_ids:
            errors.append(f"{cid}: duplicate chart id")
        seen_ids.add(cid)
        if cid != "<missing>" and not CHART_ID_RE.match(cid):
            errors.append(f"{cid}: chart id must be dotted lower_snake, e.g. valuation.mvrv")
        if chart.get("archetype") not in archetypes:
            errors.append(f"{cid}: unknown archetype {chart.get('archetype')}")
        if chart.get("status") not in ("existing", "new"):
            errors.append(f"{cid}: status must be existing or new")
        implementation = chart.get("implementation", "not_started")
        if implementation not in ("not_started", "in_progress", "shipped", "blocked"):
            errors.append(f"{cid}: invalid implementation status {implementation}")

        chart_metrics = list(chart.get("metrics") or [])
        covered.update(chart_metrics)
        for mid in chart_metrics:
            if mid not in metrics:
                errors.append(f"{cid}: unknown metric {mid}")

        for mid in chart.get("legacy_metrics") or []:
            if mid not in metrics:
                errors.append(f"{cid}: unknown legacy metric {mid}")
        for mid in chart.get("disabled_metrics") or []:
            if mid not in metrics:
                errors.append(f"{cid}: unknown disabled metric {mid}")

        axis_ids = [a.get("id") for a in chart.get("axes") or []]
        if len(axis_ids) != len(set(axis_ids)):
            errors.append(f"{cid}: duplicate axis id")
        for axis in chart.get("axes") or []:
            if not axis.get("id"):
                errors.append(f"{cid}: axis missing id")
            if not axis.get("unit"):
                errors.append(f"{cid}: axis {axis.get('id')} missing unit")
            if axis.get("scale") not in ("linear", "log"):
                errors.append(f"{cid}: axis {axis.get('id')} has invalid scale")
        if chart.get("series") and not axis_ids:
            errors.append(f"{cid}: has series but no axes")

        default = chart.get("default_metric")
        if default and default not in metrics:
            errors.append(f"{cid}: unknown default metric {default}")
        if default and chart_metrics and default not in chart_metrics:
            errors.append(f"{cid}: default metric {default} is not in metrics list")

        for series in chart.get("series") or []:
            if series.get("type") == "ohlc":
                for key in ("open", "high", "low", "close"):
                    mid = series.get(key)
                    if mid and mid not in metrics:
                        errors.append(f"{cid}: OHLC {key} references unknown metric {mid}")
                vol = series.get("volume")
                if vol and vol not in metrics:
                    errors.append(f"{cid}: OHLC volume references unknown metric {vol}")
            else:
                mid = series.get("metric")
                if mid and mid not in metrics:
                    errors.append(f"{cid}: series references unknown metric {mid}")
            axis = series.get("axis")
            if axis and axis_ids and axis not in axis_ids:
                errors.append(f"{cid}: series axis {axis} is not declared in axes")

        for variant in chart.get("variants") or []:
            if not variant.get("id") or not variant.get("label"):
                errors.append(f"{cid}: variant missing id/label")
            for mid in variant.get("series") or []:
                if mid not in metrics:
                    errors.append(f"{cid}: variant {variant.get('id')} references unknown metric {mid}")
                elif mid not in chart_metrics:
                    errors.append(f"{cid}: variant {variant.get('id')} metric {mid} is not in chart metrics")

        for key in ("expected", "acceptance", "controls"):
            if not isinstance(chart.get(key), list) or not chart.get(key):
                errors.append(f"{cid}: {key} must be a non-empty list")

    missing = sorted(set(metrics) - covered)
    if missing:
        errors.append(f"{len(missing)} registry metrics not covered by any chart: {', '.join(missing)}")

    counts = catalog.get("counts") or {}
    if counts.get("metrics") not in (None, len(metrics)):
        errors.append(
            f"catalog counts.metrics={counts.get('metrics')} but registry has {len(metrics)}"
        )
    if counts.get("charts") not in (None, len(charts)):
        errors.append(f"catalog counts.charts={counts.get('charts')} but catalog has {len(charts)}")

    return errors


def validate_ledger(catalog: dict, ledger_path: Path = LEDGER) -> list[str]:
    if not ledger_path.exists():
        return []
    chart_ids = {c["id"] for c in catalog.get("charts") or []}
    errors: list[str] = []
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| P"):
            continue
        for token in re.findall(r"`([^`]+)`", line):
            if CHART_ID_RE.match(token) and token not in chart_ids:
                errors.append(f"ledger references unknown chart id {token}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--ledger", type=Path, default=LEDGER)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    metrics = registry_metrics()
    catalog = load_catalog(args.catalog)

    if args.self_test:
        broken = copy.deepcopy(catalog)
        first = broken["charts"][0]
        removed = first["metrics"].pop()
        errors = validate(broken, metrics)
        if not any(removed in e for e in errors):
            print(f"self-test FAIL: removing {removed} did not fail validation", file=sys.stderr)
            return 1
        print("self-test OK: broken catalog rejected")

    errors = validate(catalog, metrics)
    errors += validate_ledger(catalog, args.ledger)

    if errors:
        print(f"catalog FAIL: {len(errors)} error(s)", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    charts = catalog["charts"]
    print(
        f"catalog OK: {len(charts)} charts, "
        f"{len(metrics)}/{len(metrics)} metrics, 0 unknown"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
