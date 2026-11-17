#!/usr/bin/env python3
"""Verify generated Rust registry matches Python source byte-for-byte."""

import ast
import re
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    registry_py = repo_root / "backend" / "app" / "metrics" / "registry.py"
    registry_rs = repo_root / "backend-rs" / "src" / "metrics" / "registry.rs"

    source = registry_py.read_text(encoding="utf-8")
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
        print("METRICS not found in Python", file=sys.stderr)
        return 1

    py_metrics = {m["id"]: m for m in ast.literal_eval(metrics_node.value)}

    rs_source = registry_rs.read_text(encoding="utf-8")
    # Extract id/sql pairs from generated Rust.
    rs_metrics = {}
    for block in re.split(r"\n    },", rs_source):
        m_id = re.search(r'id:\s*r#"([^"]+)"#', block)
        m_sql = re.search(r'sql:\s*r#"(.*?)"#\s*,', block, re.DOTALL)
        if m_id and m_sql:
            rs_metrics[m_id.group(1)] = m_sql.group(1)

    errors = []
    for mid, pm in py_metrics.items():
        py_sql = pm.get("sql", "")
        rs_sql = rs_metrics.get(mid)
        if rs_sql is None:
            errors.append(f"{mid}: missing in Rust")
            continue
        if py_sql != rs_sql:
            errors.append(f"{mid}: SQL mismatch\n  PY: {py_sql!r}\n  RS: {rs_sql!r}")

    for mid in rs_metrics:
        if mid not in py_metrics:
            errors.append(f"{mid}: extra in Rust")

    if errors:
        print("MISMATCHES:")
        for e in errors:
            print(e)
        return 1

    print(f"OK: {len(py_metrics)} metrics byte-identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
