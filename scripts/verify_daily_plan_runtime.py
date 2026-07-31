#!/usr/bin/env python3
"""Read-only verification for the migrated, enabled Daily Plan v2 runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DATE = "2026-07-26"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_migration(project_root: Path) -> None:
    backup_path = project_root / (
        "output/backups/"
        "legal-vocab-before-daily-plan-v2-2026-07-26T18-46-51-838Z.json"
    )
    current_path = project_root / "output/legal-vocab.json"
    migration_evidence_path = project_root / (
        "artifacts/release-gate/daily-plan/"
        "migrate-today-preserving-four-completions.json"
    )
    integrity_evidence_path = project_root / (
        "artifacts/release-gate/daily-plan/migration-history-integrity.json"
    )
    backup = load_json(backup_path)
    current = load_json(current_path)
    migration_evidence = load_json(migration_evidence_path)
    integrity_evidence = load_json(integrity_evidence_path)
    old_plan = backup["dailyReviewPlans"][DATE]
    plan = current["dailyReviewPlans"][DATE]

    assert migration_evidence["passed"] is True
    assert integrity_evidence["passed"] is True
    assert sha256(backup_path) == migration_evidence["before"]["fileSha256"]
    assert len(old_plan["dueItemIds"]) == 142
    assert len(old_plan["completedItemIds"]) == 4
    assert migration_evidence["before"]["planTotal"] == 142
    assert migration_evidence["before"]["completed"] == 4
    assert migration_evidence["afterMigration"]["planTotal"] == 20
    assert migration_evidence["afterMigration"]["completed"] == 4
    assert migration_evidence["preserved"]["completedItemIdsAndOrder"] is True
    assert migration_evidence["preserved"]["createdAt"] is True
    assert integrity_evidence["itemsSha256Before"] == integrity_evidence["itemsSha256After"]
    assert (
        integrity_evidence["reviewStatesSha256Before"]
        == integrity_evidence["reviewStatesSha256After"]
    )
    assert (
        integrity_evidence["protectedProjectionSha256Before"]
        == integrity_evidence["protectedProjectionSha256After"]
    )

    # The live plan can legitimately advance after migration. Verify that later
    # study preserved the migrated plan and its original four completions.
    assert plan["version"] == 2
    assert len(plan["dueItemIds"]) == 20
    assert len(plan["completedItemIds"]) >= 4
    assert plan["completedItemIds"][:4] == old_plan["completedItemIds"]
    assert plan["createdAt"] == old_plan["createdAt"]

    print(
        "PASS migrate-today-preserving-four-completions: "
        f"142/4 -> 20/4; live progress later advanced to "
        f"{len(plan['completedItemIds'])}/20 without losing the original four"
    )


def verify_shared_counts(project_root: Path, evidence_path: Path) -> None:
    evidence = load_json(evidence_path)
    current = load_json(project_root / "output/legal-vocab.json")
    plan = current["dailyReviewPlans"][DATE]
    backup = load_json(
        project_root
        / "output/backups/"
        / "legal-vocab-before-daily-plan-v2-2026-07-26T18-46-51-838Z.json"
    )
    migrated_completed = set(
        backup["dailyReviewPlans"][DATE]["completedItemIds"]
    )
    migrated_pending = [
        item_id for item_id in plan["dueItemIds"] if item_id not in migrated_completed
    ]

    assert evidence["passed"] is True
    assert evidence["learningStatus"]["dailyPlanTotal"] == len(plan["dueItemIds"]) == 20
    assert evidence["learningStatus"]["dailyPlanCompleted"] == len(migrated_completed) == 4
    assert evidence["review"]["questionCount"] == len(migrated_pending) == 16
    assert evidence["review"]["questionIds"] == migrated_pending
    assert evidence["storeFileUnchangedByRead"] is True

    print(
        "PASS home-and-quiz-share-plan-counts: "
        f"migration checkpoint=20/4 and review=frozen 16; "
        f"live progress is now {len(plan['completedItemIds'])}/20"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--case",
        required=True,
        choices=[
            "migrate-today-preserving-four-completions",
            "home-and-quiz-share-plan-counts",
        ],
    )
    parser.add_argument(
        "--evidence",
        type=Path,
        default=Path(
            "artifacts/release-gate/daily-plan/"
            "home-and-quiz-share-plan-counts.json"
        ),
    )
    args = parser.parse_args()
    project_root = Path(__file__).resolve().parent.parent

    if args.case == "migrate-today-preserving-four-completions":
        verify_migration(project_root)
    else:
        evidence_path = args.evidence
        if not evidence_path.is_absolute():
            evidence_path = project_root / evidence_path
        verify_shared_counts(project_root, evidence_path)


if __name__ == "__main__":
    main()
