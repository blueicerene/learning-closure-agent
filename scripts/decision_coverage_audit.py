#!/usr/bin/env python3
"""Audit the master decision ledger against one or more release contracts."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: root must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument(
        "--contract",
        required=True,
        action="append",
        type=Path,
        help="Release contract to include in the coverage audit. Repeat for multiple iterations.",
    )
    args = parser.parse_args()

    try:
        ledger = load_object(args.ledger)
        contracts = [load_object(path) for path in args.contract]
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"FAIL: {error}")
        return 2

    allowed_routes = set(ledger.get("allowed_routes", []))
    decisions = ledger.get("decisions", [])
    failures: list[str] = []
    identifiers: set[str] = set()
    contract_coverage: dict[str, list[str]] = {}

    if not decisions:
        failures.append("ledger has no decisions")

    for decision in decisions:
        identifier = decision.get("id")
        label = identifier or "<unnamed>"
        if not identifier or identifier in identifiers:
            failures.append(f"{label}: missing or duplicate decision id")
        identifiers.add(identifier)
        if decision.get("route") not in allowed_routes:
            failures.append(f"{label}: invalid route {decision.get('route')!r}")
        if not str(decision.get("owner", "")).strip():
            failures.append(f"{label}: missing owner")
        if not str(decision.get("trigger_or_verification", "")).strip():
            failures.append(f"{label}: missing verification or trigger condition")
        if not str(decision.get("summary", "")).strip():
            failures.append(f"{label}: missing summary")
        if decision.get("route") == "awaiting_user_acceptance" and not decision.get("needs_user_confirmation"):
            failures.append(f"{label}: awaiting acceptance without explicit user confirmation flag")
        for contract_id in decision.get("contract_ids", []):
            contract_coverage.setdefault(contract_id, []).append(label)

    contract_scope: set[str] = set()
    contract_iterations: list[str] = []
    for contract in contracts:
        contract_scope.update(contract.get("in_scope", []))
        contract_iterations.append(str(contract.get("iteration", "<unnamed>")))
    covered_scope = set(contract_coverage)
    for contract_id in sorted(contract_scope - covered_scope):
        failures.append(f"contract decision {contract_id}: not routed in master ledger")
    for contract_id in sorted(covered_scope - contract_scope):
        failures.append(f"ledger references unknown contract decision {contract_id}")
    current_without_contract = [
        decision["id"]
        for decision in decisions
        if decision.get("route") == "current_iteration" and not decision.get("contract_ids")
    ]
    if current_without_contract:
        failures.append(
            f"current iteration decisions without release-contract coverage: {current_without_contract}"
        )

    confirmation_ids = {
        item.get("decision_id")
        for item in ledger.get("needs_user_confirmation", [])
        if isinstance(item, dict)
    }
    awaiting_ids = {
        item.get("id")
        for item in decisions
        if item.get("route") == "awaiting_user_acceptance"
    }
    if confirmation_ids != awaiting_ids:
        failures.append(
            "needs_user_confirmation does not exactly match awaiting_user_acceptance decisions"
        )

    route_counts = Counter(item.get("route") for item in decisions)
    state_counts = Counter(item.get("delivery_state") for item in decisions)
    print(
        json.dumps(
            {
                "ledger_decisions": len(decisions),
                "route_counts": dict(sorted(route_counts.items())),
                "delivery_state_counts": dict(sorted(state_counts.items())),
                "contract_coverage": {
                    "iterations": contract_iterations,
                    "covered": len(contract_scope & covered_scope),
                    "total": len(contract_scope),
                    "missing": sorted(contract_scope - covered_scope),
                },
                "needs_user_confirmation": sorted(confirmation_ids),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    print("PASS: master decision ledger is routed and daily-plan contract coverage is complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
