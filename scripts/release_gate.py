#!/usr/bin/env python3
"""Block release until confirmed scope has executable real-path proof."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    print(f"FAIL: {message}")


def load_contract(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("contract root must be an object")
    return value


def evidence_paths(item: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for evidence in item.get("evidence", []):
        if isinstance(evidence, str):
            paths.append(evidence)
        elif isinstance(evidence, dict) and isinstance(evidence.get("path"), str):
            paths.append(evidence["path"])
    return paths


def validate_item(
    item: dict[str, Any],
    label: str,
    project_root: Path,
    run_commands: bool,
) -> list[str]:
    failures: list[str] = []
    commands = item.get("verification_commands", [])
    required = item.get("required_evidence", [])
    actual = evidence_paths(item)

    if not commands or not all(isinstance(command, str) and command.strip() for command in commands):
        failures.append(f"{label}: no executable verification command")
    if not required or not all(isinstance(path, str) and path.strip() for path in required):
        failures.append(f"{label}: no required real-path evidence declared")
    if not actual:
        failures.append(f"{label}: no verification evidence")

    for required_path in required:
        if required_path not in actual:
            failures.append(f"{label}: missing required evidence reference: {required_path}")
        elif not (project_root / required_path).is_file():
            failures.append(f"{label}: evidence file does not exist: {required_path}")

    if run_commands:
        for command in commands:
            result = subprocess.run(
                command,
                cwd=project_root,
                shell=True,
                text=True,
                check=False,
            )
            if result.returncode:
                failures.append(f"{label}: verification command failed: {command}")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--run-commands", action="store_true")
    args = parser.parse_args()

    contract_path = args.contract.resolve()
    project_root = contract_path.parent.parent.parent
    try:
        contract = load_contract(contract_path)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        fail(f"cannot read contract: {error}")
        return 2

    scope = contract.get("in_scope", [])
    decisions = {
        item.get("id"): item
        for item in contract.get("decisions", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    failures: list[str] = []

    if contract.get("status") != "ready":
        failures.append("contract status is not ready")
    if not scope:
        failures.append("contract has no in-scope decisions")

    for identifier in scope:
        item = decisions.get(identifier)
        if not item:
            failures.append(f"in-scope decision {identifier!r} is missing")
            continue
        if item.get("state") != "confirmed":
            failures.append(f"{identifier}: decision is not confirmed")
        if item.get("priority") != "core":
            failures.append(f"{identifier}: decision is not marked core")
        if not item.get("implemented"):
            failures.append(f"{identifier}: not implemented")
        if not item.get("verified_on_real_path"):
            failures.append(f"{identifier}: not verified on the real path")
        failures.extend(validate_item(item, identifier, project_root, args.run_commands))

    for journey in contract.get("real_path_checks", []):
        if not isinstance(journey, dict):
            failures.append("real-path journey is not an object")
            continue
        identifier = journey.get("id", "<unnamed>")
        if journey.get("status") != "passed":
            failures.append(f"journey {identifier}: not passed")
        failures.extend(
            validate_item(journey, f"journey {identifier}", project_root, args.run_commands)
        )

    if failures:
        for failure in failures:
            fail(failure)
        print(f"BLOCKED: {len(failures)} release-gate requirement(s) are unmet")
        return 1

    print("PASS: all in-scope decisions and real-path journeys are verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
