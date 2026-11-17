#!/usr/bin/env python3
"""Port backend/app/metrics/registry.py METRICS list to Rust source.

Usage:
    python3 scripts/gen_metrics_registry.py > src/metrics/registry.rs
"""

import ast
import sys
import textwrap
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    registry_path = repo_root / "backend" / "app" / "metrics" / "registry.py"
    source = registry_path.read_text(encoding="utf-8")

    # Parse the module and locate the METRICS assignment.
    tree = ast.parse(source)
    metrics_node = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "METRICS":
                    metrics_node = node
                    break
        if metrics_node is not None:
            break

    if metrics_node is None:
        print("METRICS assignment not found", file=sys.stderr)
        sys.exit(1)

    metrics = ast.literal_eval(metrics_node.value)

    entries = []
    for m in metrics:
        mid = m["id"]
        title = m["title"]
        category = m["category"]
        unit = m["unit"]
        grain = m["grain"]
        sql = m.get("sql")
        disabled = bool(m.get("disabled", False))

        if sql is None:
            # Disabled stub entries still get an empty SQL so the struct layout is uniform.
            sql = ""

        entries.append(
            {
                "id": mid,
                "title": title,
                "category": category,
                "unit": unit,
                "grain": grain,
                "sql": sql,
                "disabled": disabled,
            }
        )

    print("//! Auto-generated from backend/app/metrics/registry.py")
    print("//! Do not edit by hand; run scripts/gen_metrics_registry.py")
    print()
    print("#[derive(Debug, Clone, PartialEq)]")
    print("pub struct Metric {")
    print("    pub id: &'static str,")
    print("    pub title: &'static str,")
    print("    pub category: &'static str,")
    print("    pub unit: &'static str,")
    print("    pub grain: &'static str,")
    print("    pub sql: &'static str,")
    print("    pub disabled: bool,")
    print("}")
    print()
    print("pub static METRICS: &[Metric] = &[")
    for e in entries:
        print("    Metric {")
        print(f"        id: {rust_str(e['id'])},")
        print(f"        title: {rust_str(e['title'])},")
        print(f"        category: {rust_str(e['category'])},")
        print(f"        unit: {rust_str(e['unit'])},")
        print(f"        grain: {rust_str(e['grain'])},")
        print(f"        sql: {rust_str(e['sql'])},")
        print(f"        disabled: {str(e['disabled']).lower()},")
        print("    },")
    print("];")
    print()
    print("pub fn by_id(id: &str) -> Option<&'static Metric> {")
    print("    METRICS.iter().find(|m| m.id == id)")
    print("}")
    print()
    print("pub fn count() -> usize {")
    print("    METRICS.len()")
    print("}")
    print()
    print("#[cfg(test)]")
    print("mod tests {")
    print("    use super::*;")
    print()
    print("    #[test]")
    print("    fn registry_count_matches_python() {")
    print(f"        assert_eq!(METRICS.len(), {len(entries)});")
    print("    }")
    print("}")


def rust_str(s: str) -> str:
    # Rust raw string literal: r#"..."# .  None of the registry strings contain
    # the closing sequence "#, so a single hash pair is sufficient.
    if '"#' not in s and '#"' not in s:
        return f'r#"{s}"#'
    # Fallback: escape manually (should not be needed for this dataset).
    escaped = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


if __name__ == "__main__":
    main()
