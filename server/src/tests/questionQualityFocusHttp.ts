import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "legal-vocab-quality-focus-http-"));
const storePath = path.join(tmpDir, "legal-vocab.json");
process.env.LEGAL_VOCAB_PATH = storePath;
process.env.DAILY_PLAN_V2_ENABLED = "false";

const timestamp = "2026-07-27T14:00:00.000Z";
const definition = {
  municipal: "A financial instrument issued by a municipality.",
  estoppel: "A rule preventing a party from denying a position previously relied upon.",
  injunction: "A court order requiring or prohibiting a specified act.",
  tort: "A civil wrong for which the law provides a remedy.",
  affidavit: "A written statement sworn or affirmed to be true."
};

function item(id: string, term: string, itemDefinition: string) {
  return {
    id,
    term,
    definition: itemDefinition,
    chineseDefinition: `${term} 中文释义`,
    legalContext: `${term} 的法律语境。`,
    lookupQuality: "saved",
    sourceLabel: "HTTP 隔离测试",
    sourceText: `${term} - ${itemDefinition}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    reviewState: {
      status: "new",
      correctStreak: 0,
      wrongCount: 0
    }
  };
}

await writeFile(storePath, JSON.stringify({
  version: "v0.1",
  updatedAt: timestamp,
  items: [
    item("municipal", "municipal", definition.municipal),
    item("focus-target", "estoppel", definition.estoppel),
    item("d1", "injunction", definition.injunction),
    item("d2", "tort", definition.tort),
    item("d3", "affidavit", definition.affidavit)
  ]
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

async function postJson(pathname: string, body: unknown) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${pathname} returned ${response.status}`);
  return response.json();
}

try {
  await postJson("/answer", {
    itemId: "municipal",
    selectedDefinition: definition.injunction,
    correctDefinition: definition.municipal,
    isCorrect: false,
    sessionId: "municipal-session",
    attemptKind: "plan"
  });
  const issue = await postJson("/items/municipal/question-issue", {
    reason: "municipal 被错误匹配为 municipal bond。"
  });
  assert.equal(issue.latestWrongExempted, true);
  assert.equal(issue.item.reviewState.wrongCount, 0);

  await postJson("/answer", {
    itemId: "focus-target",
    selectedDefinition: definition.injunction,
    correctDefinition: definition.estoppel,
    isCorrect: false,
    sessionId: "focus-session",
    attemptKind: "plan"
  });
  const reinforcement = await postJson("/answer", {
    itemId: "focus-target",
    selectedDefinition: definition.tort,
    correctDefinition: definition.estoppel,
    isCorrect: false,
    sessionId: "focus-session",
    attemptKind: "reinforcement"
  });
  assert.equal(reinforcement.reviewState.focus, true);

  const focusResponse = await fetch(`${baseUrl}/review?date=2026-07-27&mode=focus`);
  assert.equal(focusResponse.ok, true);
  const focus = await focusResponse.json();
  assert.deepEqual(focus.questions.map((question: { itemId: string }) => question.itemId), ["focus-target"]);
  assert.equal(typeof focus.focusProgress?.roundId, "string");
  const focusRoundId = focus.focusProgress.roundId;
  assert.equal(focus.focusProgress.attemptCount, 0);

  await postJson("/answer", {
    itemId: "focus-target",
    selectedDefinition: definition.estoppel,
    correctDefinition: definition.estoppel,
    isCorrect: true,
    sessionId: "independent-1",
    focusRoundId,
    attemptKind: "independent"
  });
  const focusAfterFirstRecovery = await (await fetch(`${baseUrl}/review?date=2026-07-27&mode=focus`)).json();
  assert.equal(focusAfterFirstRecovery.focusProgress.roundId, focusRoundId);
  assert.equal(focusAfterFirstRecovery.focusProgress.attemptCount, 1);
  assert.deepEqual(focusAfterFirstRecovery.focusProgress.attemptedItemIds, ["focus-target"]);
  assert.equal(focusAfterFirstRecovery.questions[0].reviewState.focusRecoveryCorrectCount, 1);

  const sameRoundRetry = await postJson("/answer", {
    itemId: "focus-target",
    selectedDefinition: definition.estoppel,
    correctDefinition: definition.estoppel,
    isCorrect: true,
    sessionId: "independent-retry",
    focusRoundId,
    attemptKind: "independent"
  });
  assert.equal(sameRoundRetry.reviewState.focus, true);
  assert.equal(sameRoundRetry.reviewState.focusRecoveryCorrectCount, 1);

  const nextRound = await (
    await fetch(`${baseUrl}/review?date=2026-07-27&mode=focus&restartFocusRound=1`)
  ).json();
  assert.notEqual(nextRound.focusProgress.roundId, focusRoundId);
  assert.equal(nextRound.focusProgress.attemptCount, 0);

  const recovered = await postJson("/answer", {
    itemId: "focus-target",
    selectedDefinition: definition.estoppel,
    correctDefinition: definition.estoppel,
    isCorrect: true,
    sessionId: "independent-2",
    focusRoundId: nextRound.focusProgress.roundId,
    attemptKind: "independent"
  });
  assert.equal(recovered.reviewState.focus, false);
  assert.equal(recovered.reviewState.focusRecoveryCorrectCount, 2);

  console.log(JSON.stringify({
    checkpoint: "question-quality-focus-http",
    municipalWrongExempted: true,
    focusEnteredAfterSameSessionReinforcementWrong: true,
    focusRoundProgressPersistsAcrossReload: true,
    sameRoundRetryDoesNotDoubleCount: true,
    focusExitedAfterTwoSeparateRoundCorrectAnswers: true,
    realStoreTouched: false
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
