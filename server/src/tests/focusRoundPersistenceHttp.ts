import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "legal-vocab-focus-round-http-"));
const storePath = path.join(tmpDir, "legal-vocab.json");
process.env.LEGAL_VOCAB_PATH = storePath;
process.env.DAILY_PLAN_V2_ENABLED = "false";

const timestamp = "2026-07-28T14:00:00.000Z";
const entries = [
  ["focus-1", "estoppel", "A rule preventing a party from denying a position previously relied upon."],
  ["focus-2", "injunction", "A court order requiring or prohibiting a specified act."],
  ["focus-3", "tort", "A civil wrong for which the law provides a remedy."],
  ["focus-4", "affidavit", "A written statement sworn or affirmed to be true."],
  ["distractor", "tribunal", "A body established to decide disputes or determine rights."]
] as const;

await writeFile(storePath, JSON.stringify({
  version: "v0.1",
  updatedAt: timestamp,
  items: entries.map(([id, term, definition], index) => ({
    id,
    term,
    definition,
    sourceText: `${term} - ${definition}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    reviewState: {
      status: "learning",
      correctStreak: 0,
      wrongCount: index < 4 ? 2 : 0,
      focus: index < 4,
      focusRecoveryCorrectCount: 0
    }
  }))
}, null, 2));

const { vocabRouter } = await import("../routes/vocab.js");
const app = express();
app.use(express.json());
app.use("/api/vocab", vocabRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}/api/vocab`;

async function getFocus(restart = false) {
  const response = await fetch(
    `${baseUrl}/review?date=2026-07-28&mode=focus${restart ? "&restartFocusRound=1" : ""}`
  );
  assert.equal(response.ok, true);
  return response.json();
}

async function answer(question: { itemId: string; correctDefinition: string }, roundId: string) {
  const response = await fetch(`${baseUrl}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      itemId: question.itemId,
      selectedDefinition: question.correctDefinition,
      correctDefinition: question.correctDefinition,
      isCorrect: true,
      sessionId: roundId,
      focusRoundId: roundId,
      attemptKind: "independent"
    })
  });
  assert.equal(response.ok, true);
  return response.json();
}

try {
  const initial = await getFocus();
  assert.equal(initial.questions.length, 4);
  assert.equal(initial.focusProgress.attemptCount, 0);
  const roundId = initial.focusProgress.roundId;

  for (const question of initial.questions) {
    await answer(question, roundId);
  }

  const resumed = await getFocus();
  assert.equal(resumed.focusProgress.roundId, roundId);
  assert.equal(resumed.focusProgress.attemptCount, 4);
  assert.deepEqual(
    resumed.focusProgress.attemptedItemIds,
    initial.questions.map((question: { itemId: string }) => question.itemId)
  );
  assert.equal(resumed.focusProgress.focusRoundItems, 4);

  const stored = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(stored.focusReviewRound.id, roundId);
  assert.equal(stored.focusReviewRound.attemptedItemIds.length, 4);
  assert.equal(typeof stored.focusReviewRound.completedAt, "string");

  const nextRound = await getFocus(true);
  assert.notEqual(nextRound.focusProgress.roundId, roundId);
  assert.equal(nextRound.focusProgress.attemptCount, 0);
  assert.equal(nextRound.questions.length, 4);

  console.log(JSON.stringify({
    checkpoint: "focus-round-persistence-http",
    completedRoundPersistsAsFourOfFour: true,
    reloadKeepsFrozenOrder: true,
    explicitRestartCreatesSeparateRound: true,
    realStoreTouched: false
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
