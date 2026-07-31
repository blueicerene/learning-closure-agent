import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const storePath = new URL("../output/legal-vocab.json", import.meta.url);
const backupPath = new URL(
  "../output/backups/legal-vocab-before-question-quality-focus-2026-07-27T18-32-06-040Z.json",
  import.meta.url
);
const expectedBackupHash = "01bde4e862e55e1d39f271c8cc44370bd4ab3aa48a58634efe4455999b71f713";
const expectedMunicipalDefinition =
  "Relating to a city, town, or other local government, including its powers, laws, and institutions.";
const migrationEvidencePath = new URL(
  "../artifacts/release-gate/question-quality-focus/real-migration.json",
  import.meta.url
);
const initialFocusEvidencePath = new URL(
  "../artifacts/release-gate/question-quality-focus/real-focus-api.json",
  import.meta.url
);

const backupBytes = await readFile(backupPath);
assert.equal(
  createHash("sha256").update(backupBytes).digest("hex"),
  expectedBackupHash,
  "question-quality backup hash changed"
);

const store = JSON.parse(await readFile(storePath, "utf8"));
const migrationEvidence = JSON.parse(await readFile(migrationEvidencePath, "utf8"));
const initialFocusEvidence = JSON.parse(
  await readFile(initialFocusEvidencePath, "utf8")
);
const municipal = store.items.find(
  (item) => item.term?.trim().toLowerCase() === "municipal"
);
assert.ok(municipal, "municipal is missing");
assert.equal(municipal.definition, expectedMunicipalDefinition);
assert.equal(municipal.partOfSpeech, "adjective");
assert.equal(municipal.questionQuality?.status, "eligible");
assert.equal(migrationEvidence.municipal.wrong_count, 0);
assert.equal(migrationEvidence.municipal.wrong_streak, 0);
assert.equal(migrationEvidence.municipal.focus, false);
assert.equal(migrationEvidence.municipal.plan_completion_preserved, true);
assert.equal(
  migrationEvidence.protected_projection_before_sha256,
  migrationEvidence.protected_projection_after_sha256
);
assert.deepEqual(
  initialFocusEvidence.terms,
  migrationEvidence.legacy_focus_migrations
);
assert.equal(initialFocusEvidence.municipal_excluded, true);
assert.equal(initialFocusEvidence.historical_wrong_count_only_items_excluded, true);

const response = await fetch(
  "http://127.0.0.1:3333/api/vocab/review?date=2026-07-28&mode=focus"
);
assert.equal(response.ok, true, `focus API returned ${response.status}`);
const focus = await response.json();
const focusTerms = focus.questions.map((question) => question.term);
const currentFocusTerms = store.items
  .filter(
    (item) =>
      item.reviewState?.focus === true &&
      item.questionQuality?.status !== "pending-review"
  )
  .map((item) => item.term);
assert.deepEqual([...focusTerms].sort(), [...currentFocusTerms].sort());
assert.equal(focusTerms.includes("municipal"), false);

console.log(JSON.stringify({
  checkpoint: "question-quality-focus-runtime",
  backupHashVerified: true,
  municipal: {
    partOfSpeech: municipal.partOfSpeech,
    migrationWrongCount: migrationEvidence.municipal.wrong_count,
    currentWrongCount: municipal.reviewState.wrongCount,
    currentFocus: municipal.reviewState.focus
  },
  initialFocusTerms: initialFocusEvidence.terms,
  focusTerms,
  focusQueueMayClearAfterVerifiedRecovery: true,
  realAnswersSubmitted: false
}, null, 2));
