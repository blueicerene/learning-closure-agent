import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "legal-vocab-quality-focus-"));
const storePath = path.join(tmpDir, "legal-vocab.json");
process.env.LEGAL_VOCAB_PATH = storePath;
process.env.DAILY_PLAN_V2_ENABLED = "false";
process.env.DISABLE_QUIZ_DEFINITION_REPAIR = "true";

const {
  flagVocabQuestionIssue,
  getLearningStatus,
  getVocabReview,
  recordVocabAnswer
} = await import("../services/vocab.js");

const date = "2026-07-27";
const timestamp = `${date}T14:00:00.000Z`;

function item(id: string, term: string, definition: string, reviewState: Record<string, unknown> = {}) {
  return {
    id,
    term,
    definition,
    chineseDefinition: `${term} 中文释义`,
    legalContext: `${term} 的法律语境。`,
    lookupQuality: "saved",
    sourceLabel: "隔离测试",
    isImportant: false,
    sourceText: `${term} - ${definition}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    reviewState: {
      status: "new",
      correctStreak: 0,
      wrongCount: 0,
      ...reviewState
    }
  };
}

const municipal = item(
  "municipal",
  "municipal",
  "A financial instrument issued by a municipality."
);
const focusTarget = item(
  "focus-target",
  "estoppel",
  "A rule preventing a party from denying a position previously relied upon."
);
const historicalWrong = item(
  "historical-wrong",
  "venue",
  "The legally proper place or jurisdiction in which a case is heard.",
  {
    status: "review",
    correctStreak: 1,
    wrongCount: 4,
    wrongStreak: 0,
    lastResult: "correct",
    lastReviewedAt: "2026-07-20",
    nextReviewAt: "2026-08-01"
  }
);
const distractors = [
  item("d1", "injunction", "A court order requiring or prohibiting a specified act."),
  item("d2", "tort", "A civil wrong for which the law provides a remedy."),
  item("d3", "affidavit", "A written statement sworn or affirmed to be true.")
];

await writeFile(storePath, JSON.stringify({
  version: "v0.1",
  updatedAt: timestamp,
  items: [municipal, focusTarget, historicalWrong, ...distractors]
}, null, 2));

const badMunicipalQuestion = (await getVocabReview(date, "all")).questions
  .find((question) => question.itemId === "municipal");
assert.ok(badMunicipalQuestion);

await recordVocabAnswer({
  itemId: "municipal",
  selectedDefinition: distractors[0].definition,
  correctDefinition: municipal.definition,
  isCorrect: false,
  answeredAt: timestamp,
  sessionId: "municipal-session",
  attemptKind: "plan"
});
const issueResult = await flagVocabQuestionIssue(
  "municipal",
  "词性不匹配：形容词 municipal 被错误匹配为 municipal bond 的名词释义。"
);
assert.equal(issueResult.latestWrongExempted, true);
assert.equal(issueResult.item.reviewState.wrongCount, 0);
assert.equal(issueResult.item.reviewState.focus, false);
const storeAfterIssue = JSON.parse(await readFile(storePath, "utf8"));
const municipalAfterIssue = storeAfterIssue.items.find(
  (candidate: { id: string }) => candidate.id === "municipal"
);
assert.equal(municipalAfterIssue.lastAnswerSnapshot, undefined);
assert.equal(storeAfterIssue.lastReviewEvent, undefined);
assert.equal(
  (await getVocabReview(date, "all")).questions.some((question) => question.itemId === "municipal"),
  false
);

const firstWrong = await recordVocabAnswer({
  itemId: "focus-target",
  selectedDefinition: distractors[0].definition,
  correctDefinition: focusTarget.definition,
  isCorrect: false,
  answeredAt: `${date}T14:05:00.000Z`,
  sessionId: "focus-session",
  attemptKind: "plan"
});
assert.equal(firstWrong.reviewState.reinforcementPending, true);
assert.equal(firstWrong.reviewState.focus, false);
assert.equal((await getVocabReview(date, "focus")).questions.length, 0);

const reinforcementWrong = await recordVocabAnswer({
  itemId: "focus-target",
  selectedDefinition: distractors[1].definition,
  correctDefinition: focusTarget.definition,
  isCorrect: false,
  answeredAt: `${date}T14:10:00.000Z`,
  sessionId: "focus-session",
  attemptKind: "reinforcement"
});
assert.equal(reinforcementWrong.reviewState.focus, true);
assert.equal(reinforcementWrong.reviewState.reinforcementPending, false);

const focusReview = await getVocabReview(date, "focus");
assert.deepEqual(focusReview.questions.map((question) => question.itemId), ["focus-target"]);
const initialFocusRoundId = focusReview.focusProgress?.roundId;
assert.equal(typeof initialFocusRoundId, "string");
assert.equal(
  focusReview.questions.some((question) => question.itemId === "historical-wrong"),
  false
);
assert.equal((await getLearningStatus()).repeatedWrong, 1);

const firstRecovery = await recordVocabAnswer({
  itemId: "focus-target",
  selectedDefinition: focusTarget.definition,
  correctDefinition: focusTarget.definition,
  isCorrect: true,
  answeredAt: "2026-07-28T14:00:00.000Z",
  sessionId: "independent-1",
  focusRoundId: initialFocusRoundId,
  attemptKind: "independent"
});
assert.equal(firstRecovery.reviewState.focus, true);
assert.equal(firstRecovery.reviewState.focusRecoveryCorrectCount, 1);
const firstRecoveryFocusRound = await getVocabReview(date, "focus");
assert.equal(firstRecoveryFocusRound.focusProgress?.attemptCount, 1);
assert.equal(firstRecoveryFocusRound.questions.length, 1);
const focusRoundId = firstRecoveryFocusRound.focusProgress?.roundId;
assert.equal(typeof focusRoundId, "string");

const resumedFocusRound = await getVocabReview(date, "focus");
assert.equal(resumedFocusRound.focusProgress?.roundId, focusRoundId);
assert.equal(resumedFocusRound.focusProgress?.attemptCount, 1);

const secondFocusRound = await getVocabReview(date, "focus", { restartFocusRound: true });
const secondFocusRoundId = secondFocusRound.focusProgress?.roundId;
assert.equal(typeof secondFocusRoundId, "string");
assert.notEqual(secondFocusRoundId, focusRoundId);

const secondRecovery = await recordVocabAnswer({
  itemId: "focus-target",
  selectedDefinition: focusTarget.definition,
  correctDefinition: focusTarget.definition,
  isCorrect: true,
  answeredAt: "2026-07-29T14:00:00.000Z",
  sessionId: "independent-2",
  focusRoundId: secondFocusRoundId,
  attemptKind: "independent"
});
assert.equal(secondRecovery.reviewState.focus, false);
assert.equal(secondRecovery.reviewState.focusRecoveryCorrectCount, 2);
const completedSecondFocusRound = await getVocabReview(date, "focus");
assert.equal(completedSecondFocusRound.questions.length, 1);
assert.equal(completedSecondFocusRound.focusProgress?.attemptCount, 1);
assert.equal(completedSecondFocusRound.focusProgress?.focusRoundItems, 0);

const isolatedStore = JSON.parse(await readFile(storePath, "utf8"));
const repairedMunicipal = isolatedStore.items.find((candidate: { id: string }) => candidate.id === "municipal");
assert.equal(repairedMunicipal.questionQuality.status, "pending-review");
assert.equal(repairedMunicipal.reviewState.wrongCount, 0);

console.log(JSON.stringify({
  checkpoint: "question-quality-focus",
  isolatedStore: storePath,
  municipal: {
    latestWrongExempted: issueResult.latestWrongExempted,
    quizEligibility: issueResult.item.questionQuality?.status
  },
  focus: {
    firstWrong: "reinforcement-pending",
    reinforcementWrong: "focus",
    independentCorrectAnswersToExit: 2,
    historicalWrongExcluded: true
  }
}, null, 2));
