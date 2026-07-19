#!/usr/bin/env python3
"""Minimal jq subset for GDCE replica backup when the jq binary is not on PATH."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, List, Optional, TextIO


def kubectl_list_to_backup_entries(doc: dict) -> list:
    out: list = []
    for item in doc.get("items") or []:
        kind = item.get("kind")
        meta = item.get("metadata") or {}
        spec = item.get("spec") or {}
        tpl_spec = (spec.get("template") or {}).get("spec") or {}
        ns = meta.get("namespace")
        name = meta.get("name")
        if not ns or not name:
            continue
        if kind in ("Deployment", "StatefulSet"):
            out.append(
                {
                    "namespace": ns,
                    "kind": kind,
                    "name": name,
                    "action": "scale",
                    "replicas": spec.get("replicas", 1),
                }
            )
        elif kind == "DaemonSet":
            out.append(
                {
                    "namespace": ns,
                    "kind": kind,
                    "name": name,
                    "action": "patch_ds",
                    "nodeSelector": tpl_spec.get("nodeSelector") or {},
                }
            )
        elif kind == "Job":
            out.append(
                {
                    "namespace": ns,
                    "kind": kind,
                    "name": name,
                    "action": "patch_job",
                    "parallelism": spec.get("parallelism", 1),
                }
            )
        elif kind == "CronJob":
            out.append(
                {
                    "namespace": ns,
                    "kind": kind,
                    "name": name,
                    "action": "patch_cronjob",
                    "suspend": spec.get("suspend", False),
                }
            )
    return out


def parse_default(raw: str) -> Any:
    raw = raw.strip()
    if raw == "{}":
        return {}
    if raw == "[]":
        return []
    if raw in ("true", "false"):
        return raw == "true"
    if (raw.startswith('"') and raw.endswith('"')) or (
        raw.startswith("'") and raw.endswith("'")
    ):
        return raw[1:-1]
    try:
        return int(raw)
    except ValueError:
        try:
            return float(raw)
        except ValueError:
            return raw


FIELD_RE = re.compile(r"^\.([a-zA-Z0-9_]+)(?:\s*//\s*(.+))?$")


def eval_field(obj: Any, expr: str, raw_out: bool, compact: bool) -> None:
    m = FIELD_RE.match(expr.strip())
    if not m:
        sys.stderr.write(f"gdce_jq_compat: unsupported field filter: {expr}\n")
        sys.exit(1)
    key, default_raw = m.group(1), m.group(2)
    val = obj.get(key) if isinstance(obj, dict) else None
    if val is None and default_raw is not None:
        val = parse_default(default_raw)
    if val is None:
        val = "" if raw_out else None
    if compact:
        print(json.dumps(val, separators=(",", ":")))
    elif raw_out:
        if isinstance(val, bool):
            print("true" if val else "false")
        else:
            print(val)
    else:
        print(json.dumps(val))


def read_json_file(path: str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def load_input(paths: List[str], slurp: bool) -> Any:
    if slurp:
        chunks = []
        for p in paths:
            chunks.append(read_json_file(p))
        return chunks
    if paths:
        return read_json_file(paths[0])
    return json.load(sys.stdin)


def emit(value: Any, raw_out: bool, compact: bool) -> None:
    if compact:
        print(json.dumps(value, separators=(",", ":")))
    elif raw_out:
        print(value)
    else:
        print(json.dumps(value))


def run_jq(argv: List[str]) -> int:
    raw_out = False
    compact = False
    exit_status = False
    slurp = False
    i = 0
    while i < len(argv) and argv[i].startswith("-"):
        flag = argv[i]
        if flag == "-r":
            raw_out = True
        elif flag == "-c":
            compact = True
        elif flag == "-e":
            exit_status = True
        elif flag == "-s":
            slurp = True
        else:
            sys.stderr.write(f"gdce_jq_compat: unsupported flag: {flag}\n")
            return 1
        i += 1
    if i >= len(argv):
        sys.stderr.write("gdce_jq_compat: missing filter\n")
        return 1
    filt = argv[i].strip()
    paths = argv[i + 1 :]
    data = load_input(paths, slurp)

    if filt == "length":
        if not isinstance(data, list):
            sys.stderr.write("gdce_jq_compat: length expects array input\n")
            return 1
        emit(len(data), raw_out, compact)
        return 0

    if filt in ('type == "array"', "type == array", 'type=="array"'):
        ok = isinstance(data, list)
        if exit_status:
            return 0 if ok else 1
        emit(ok, raw_out, compact)
        return 0

    if filt == ".[]":
        if not isinstance(data, list):
            sys.stderr.write("gdce_jq_compat: .[] expects array input\n")
            return 1
        for item in data:
            emit(item, False, True)
        return 0

    if filt == "add" and slurp:
        merged: list = []
        for chunk in data:
            if isinstance(chunk, list):
                merged.extend(chunk)
        emit(merged, raw_out, compact)
        return 0

    if filt.startswith(".") and paths == [] and not slurp:
        # stdin single object field extract (echo "$i" | gdce_jq -r '.namespace')
        if isinstance(data, str):
            data = json.loads(data)
        eval_field(data, filt, raw_out, compact)
        return 0

    if filt.startswith(".") and len(paths) == 1:
        if isinstance(data, str):
            data = json.loads(data)
        eval_field(data, filt, raw_out, compact)
        return 0

    sys.stderr.write(f"gdce_jq_compat: unsupported filter: {filt}\n")
    return 1


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--array-length":
        data = read_json_file(sys.argv[2])
        if not isinstance(data, list):
            sys.stderr.write("gdce_jq_compat: --array-length expects a JSON array\n")
            return 1
        print(len(data))
        return 0
    if len(sys.argv) > 2 and sys.argv[1] == "--is-array":
        try:
            data = read_json_file(sys.argv[2])
        except json.JSONDecodeError as exc:
            sys.stderr.write(f"gdce_jq_compat: invalid JSON: {exc}\n")
            return 1
        return 0 if isinstance(data, list) else 1
    if len(sys.argv) > 1 and sys.argv[1] == "kubectl-list-backup":
        doc = json.load(sys.stdin)
        json.dump(kubectl_list_to_backup_entries(doc), sys.stdout)
        print()
        return 0
    return run_jq(sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
