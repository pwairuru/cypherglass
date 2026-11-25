#!/usr/bin/env python3
"""Generate docs/charts/chart-by-chart.md from the chart catalog.

Usage:
  python3 scripts/build_chart_docs.py
  python3 scripts/build_chart_docs.py --check
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/charts/chart-catalog.yaml"
OUTPUT = ROOT / "docs/charts/chart-by-chart.md"


def render(catalog: dict) -> str:
    lines: list[str] = []
    lines.append("# Chart-by-chart design contract")
    lines.append("")
    lines.append(
        "Generated from `docs/charts/chart-catalog.yaml` on 2026-11-24. "
        "Do not hand-edit this file; edit the catalog and regenerate with "
        "`python3 scripts/build_chart_docs.py`."
    )
    lines.append("")
    counts = catalog["counts"]
    lines.append(
        f"Catalog: **{counts['charts']} charts**, **{counts['existing_charts']} existing**, "
        f"**{counts['new_charts']} new**, covering **{counts['metrics']} metrics**."
    )
    lines.append("")
    lines.append(
        "Each section is the implementation contract for one chart. Shared archetype rules "
        "live in the design spec; the acceptance list here is the chart-specific gate."
    )
    lines.append("")

    for c in catalog["charts"]:
        lines.append(f"## {c['id']} — {c['title']}")
        lines.append("")
        lines.append(f"- **Status:** {c['status']}")
        lines.append(f"- **Implementation:** {c.get('implementation', 'not_started')}")
        lines.append(f"- **Phase:** {c['phase']}")
        lines.append(f"- **Priority:** {c['priority']}")
        lines.append(f"- **Archetype:** {c['archetype']}")
        lines.append(f"- **Question:** {c['question']}")
        parity = ", ".join(c["parity"]) if c["parity"] else "none"
        lines.append(f"- **Competitor parity:** {parity}")
        metrics = ", ".join(c["metrics"]) if c["metrics"] else "new derived series only"
        lines.append(f"- **Metrics:** {metrics}")
        if c.get("legacy_metrics"):
            lines.append(f"- **Legacy aliases:** {', '.join(c['legacy_metrics'])}")
        if c.get("disabled_metrics"):
            lines.append(f"- **Disabled metrics:** {', '.join(c['disabled_metrics'])}")
        if c.get("new_metrics"):
            lines.append(f"- **New metrics required:** {', '.join(c['new_metrics'])}")
        lines.append(f"- **Default metric:** {c['default_metric'] or 'n/a'}")
        lines.append(f"- **Chart types:** {', '.join(c['chart_types'])}")
        lines.append(f"- **Panes:** {', '.join(c['panes'])}")
        if c.get("axes"):
            axes = "; ".join(
                f"{a['id']}: {a['unit']} ({a['scale']})" for a in c["axes"]
            )
            lines.append(f"- **Axes:** {axes}")
        else:
            lines.append("- **Axes:** none (composite/table)")
        if c["variants"]:
            variants = []
            for v in c["variants"]:
                variants.append(f"{v['id']} ({v['label']}: {', '.join(v['series'])})")
            lines.append(f"- **Variants:** {'; '.join(variants)}")
        else:
            lines.append("- **Variants:** grain only")
        if c["series"]:
            series = []
            for s in c["series"]:
                if s.get("type") == "ohlc":
                    series.append(
                        f"OHLC({s['open']}, {s['high']}, {s['low']}, {s['close']}, "
                        f"volume {s['volume']}) on {s['axis']}"
                    )
                else:
                    series.append(
                        f"{s.get('label', s.get('metric'))} [{s.get('metric')}] "
                        f"on {s.get('axis')} as {s.get('style')}"
                    )
            lines.append(f"- **Default series:** {'; '.join(series)}")
        else:
            lines.append("- **Default series:** composite/dashboard (see expected)")
        lines.append(f"- **Controls:** {', '.join(c['controls'])}")
        lines.append(f"- **Annotations:** {', '.join(c['annotations'])}")
        lines.append(f"- **Data freshness:** {c['data_freshness']}")
        if c.get("data_requirements"):
            lines.append(f"- **Data requirements:** {c['data_requirements']}")
        lines.append("")
        lines.append("**Expected:**")
        for item in c["expected"]:
            lines.append(f"- {item}")
        lines.append("")
        lines.append("**Acceptance:**")
        for item in c["acceptance"]:
            lines.append(f"- [ ] {item}")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def render_tracker(catalog: dict) -> str:
    lines = [
        "# Chart implementation tracker",
        "",
        "Generated from the catalog. Update `implementation` in `chart-catalog.yaml` as work lands.",
        "",
        "| Chart | Title | Phase | Priority | Status | Implementation |",
        "|---|---|---|---|---|---|",
    ]
    for c in catalog["charts"]:
        lines.append(
            f"| `{c['id']}` | {c['title']} | {c['phase']} | {c['priority']} | "
            f"{c['status']} | {c.get('implementation', 'not_started')} |"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    catalog = yaml.safe_load(CATALOG.read_text(encoding="utf-8"))
    rendered = render(catalog)

    tracker = render_tracker(catalog)
    tracker_path = OUTPUT.parent / "implementation-tracker.md"

    if args.check:
        if not OUTPUT.exists():
            print(f"{OUTPUT} does not exist", file=sys.stderr)
            return 1
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            print("chart-by-chart.md is out of date; run python3 scripts/build_chart_docs.py", file=sys.stderr)
            return 1
        if not tracker_path.exists() or tracker_path.read_text(encoding="utf-8") != tracker:
            print("implementation-tracker.md is out of date; run python3 scripts/build_chart_docs.py", file=sys.stderr)
            return 1
        print("chart docs OK")
        return 0

    OUTPUT.write_text(rendered, encoding="utf-8")

    tracker_path.write_text(tracker, encoding="utf-8")
    print(f"wrote {OUTPUT} ({len(rendered.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
