# Chart platform documentation

This folder is the working set for the chart parity programme.

| File | Role |
|---|---|
| `chart-catalog.yaml` | **Source of truth.** 109 chart pages, 267 metrics, archetypes, series, axes, variants, controls and acceptance criteria. |
| `chart-by-chart.md` | Generated contract for every chart. Do not hand-edit. |
| `implementation-tracker.md` | Generated chart-by-chart status tracker. |
| `implementation-status.md` | Evidence-backed status of the shipped platform and remaining chart work. |
| `parity-ledger.md` | 91 parity units, 90 in scope, social excluded. Tracks design and implementation status. |
| `../superpowers/specs/2026-11-24-chart-platform-parity-design.md` | Product and technical design. |
| `../superpowers/plans/2026-11-24-chart-platform-parity.md` | Task-by-task implementation plan. |

## How to work chart by chart

1. Pick the next chart from the phase table in the design spec, or filter the catalog by `phase`.
2. Read its section in `chart-by-chart.md`.
3. Confirm every metric exists: `curl /api/v1/metrics` or check `backend-rs/src/metrics/registry.rs`.
4. Add the spec to `frontend/src/charts/specs/<category>.ts` (after the foundation tasks land).
5. Implement through shared archetype renderers and controls. Do not create a chart-specific page component.
6. Add unit, data-contract and visual tests.
7. Compare side by side with the competitor reference named in the chart's `parity` field.
8. Update the `implementation` column in `parity-ledger.md` to `in_progress`, then `shipped` only when the acceptance list passes.

## Commands

```bash
# Validate catalog coverage, series references and ledger chart ids
python3 scripts/verify_chart_catalog.py --ledger docs/charts/parity-ledger.md

# Regenerate the human-readable chart contract and tracker
python3 scripts/build_chart_docs.py

# CI check that chart-by-chart.md and implementation-tracker.md are current
python3 scripts/build_chart_docs.py --check

# Self-test the validator (deliberately breaks a catalog copy)
python3 scripts/verify_chart_catalog.py --self-test

# Regenerate typed frontend catalog + backend catalog JSON
python3 scripts/generate_chart_catalog.py
python3 scripts/generate_chart_catalog.py --check

# Full checks
cd frontend && npx vitest run && npx tsc --noEmit
cd .. && cargo test -p backend-rs && cargo check -p scheduler
```

## Rules

- The catalog is the only chart source of truth. No hand-written chart arrays in React.
- Every registry metric must appear in at least one chart.
- Every series must reference a real metric; OHLC composites must resolve open/high/low/close/volume.
- Every chart must have a question, expected insight, controls and acceptance items.
- Social sentiment/news/video/community is the only excluded parity unit.
- Do not claim `shipped` without evidence: passing tests, visual snapshot and parity review.

## Current status

- Design: 90/90 in-scope parity units designed; 90/91 overall = 98.90%.
- Catalog: 109 charts, 68 existing, 41 new, 267/267 metrics covered.
- Implementation: chart foundation, backend API, catalog UI, 109 chart routes, compare, layouts, annotations and alerts are in place. Per-chart visual review and data-dependent charts remain. See `implementation-status.md` for evidence and gaps.
