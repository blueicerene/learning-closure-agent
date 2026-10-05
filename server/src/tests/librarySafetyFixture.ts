import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmpDir = path.join(os.tmpdir(), `library-safety-${Date.now()}`);
const storePath = path.join(tmpDir, "legal-vocab.json");
process.env.LEGAL_VOCAB_PATH = storePath;
process.env.DAILY_PLAN_V2_ENABLED = "false";
process.env.USE_OPENAI_LEGAL_LOOKUP = "false";

const {
  deleteVocabItem,
  getTermShapeIssue,
  getVocabDateContext,
  getVocabItems,
  getVocabReview,
  markVocabQualityOk,
  retireVocabItem,
  recheckVocabItem,
  updateVocabItem
} = await import("../services/vocab.js");

const now = "2026-07-29T16:00:00.000Z";

function item(
  id: string,
  term: string,
  definition: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    term,
    definition,
    sourceText: term,
    createdAt: now,
    updatedAt: now,
    reviewState: {
      status: "learning",
      correctStreak: 0,
      wrongCount: 0,
      nextReviewAt: "2026-07-29"
    },
    ...extra
  };
}

async function writeStore(overrides: Record<string, unknown> = {}) {
  await writeFile(storePath, `${JSON.stringify({
    version: "v0.1",
    updatedAt: now,
    items: [
      item("good-1", "estoppel", "A rule preventing a person from denying a prior representation relied upon by another.", {
        lookupQuality: "saved"
      }),
      item("good-2", "injunction", "A court order requiring a person to do or stop doing a specified act.", {
        lookupQuality: "saved"
      }),
      item("good-3", "consideration", "Something of legal value exchanged to support the formation of a binding contract.", {
        lookupQuality: "saved"
      }),
      item("good-4", "fiduciary duty", "A legal duty to act loyally and in good faith for another person's interests.", {
        lookupQuality: "saved"
      }),
      item("legacy-pending", "The Prank Panel", "An American reality comedy television series that aired on ABC.", {
        lookupQuality: "reference"
      }),
      item("explicit-pending", "devoted", "Dedicated exclusively to a particular legal purpose or use.", {
        lookupQuality: "saved",
        questionQuality: {
          status: "pending-review",
          reasons: ["fixture"],
          evaluatedAt: now
        }
      })
    ],
    ...overrides
  }, null, 2)}\n`, "utf8");
}

async function run() {
  await mkdir(tmpDir, { recursive: true });
  await writeStore();

  const initialReview = await getVocabReview("2026-07-29", "all");
  assert.equal(initialReview.canStart, true);
  assert.equal(initialReview.questions.length, 4);
  assert.ok(initialReview.questions.every((question) =>
    question.itemId !== "legacy-pending"
    && question.itemId !== "explicit-pending"
    && !question.options.includes("An American reality comedy television series that aired on ABC.")
    && !question.options.includes("Dedicated exclusively to a particular legal purpose or use.")
  ));

  const confirmed = await markVocabQualityOk("explicit-pending");
  assert.equal(confirmed.item.questionQuality?.status, "eligible");
  assert.equal((await getVocabItems()).stats.needsReview, 1);

  const edited = await updateVocabItem("legacy-pending", {
    term: "panel of judges",
    definition: "A group of judges assigned to hear and decide a case together."
  });
  assert.equal(edited.item.questionQuality?.status, "eligible");
  assert.equal((await getVocabItems()).stats.needsReview, 0);

  const weakRecheck = await recheckVocabItem("legacy-pending", async () => ({
    term: "panel of judges",
    definition: "A group of people assembled for a discussion.",
    lookupQuality: "dictionary",
    sourceLabel: "备用在线词典"
  }));
  assert.equal(weakRecheck.item.questionQuality?.status, "pending-review");

  const trustedRecheck = await recheckVocabItem("legacy-pending", async () => ({
    term: "panel of judges",
    definition: "A group of judges assigned to hear and decide a case together.",
    lookupQuality: "oxford",
    sourceLabel: "Oxford Dictionaries API"
  }));
  assert.equal(trustedRecheck.item.questionQuality?.status, "eligible");

  await writeStore({
    dailyReviewPlans: {
      "2026-07-29": {
        version: 2,
        date: "2026-07-29",
        dueItemIds: ["good-1"],
        reviewItemIds: ["good-1"],
        newItemIds: [],
        completedItemIds: [],
        createdAt: now
      }
    },
    focusReviewRound: {
      id: "focus-1",
      createdAt: now,
      itemIds: ["good-2"],
      attemptedItemIds: []
    },
    activeQuestion: {
      itemId: "good-3",
      occurredAt: now
    }
  });
  const beforeBlockedDeletes = await readFile(storePath, "utf8");
  await assert.rejects(() => deleteVocabItem("good-1"), /学习计划/);
  await assert.rejects(() => deleteVocabItem("good-2"), /重点复习轮次/);
  await assert.rejects(() => deleteVocabItem("good-3"), /当前题目/);
  assert.equal(await readFile(storePath, "utf8"), beforeBlockedDeletes);
  assert.deepEqual(await deleteVocabItem("good-4"), { deleted: true });

  assert.deepEqual(getVocabDateContext("2026-07-30T05:30:00.000Z"), {
    learningDate: "2026-07-29",
    nextLearningDate: "2026-07-30"
  });
  assert.deepEqual(getVocabDateContext("2026-07-30T06:30:00.000Z"), {
    learningDate: "2026-07-30",
    nextLearningDate: "2026-07-31"
  });

  const sentenceFragment = "and on the use of the finding of guilt for any purpose, after the statutory time";
  assert.match(getTermShapeIssue(sentenceFragment) ?? "", /句子片段|正文片段/);
  await writeStore({
    items: [
      item("bad-fragment", sentenceFragment, "Restrictions on using a conviction after a prescribed period.", {
        lookupQuality: "saved",
        sourceLabel: "Manually confirmed",
        questionQuality: { status: "pending-review", reasons: ["fixture"], evaluatedAt: now },
        reviewState: {
          status: "learning",
          correctStreak: 0,
          wrongCount: 2,
          wrongStreak: 1,
          lastResult: "wrong",
          focus: true,
          reinforcementPending: true,
          nextReviewAt: "2026-07-29"
        }
      }),
      item("good-1", "estoppel", "A rule preventing a person from denying a prior representation relied upon by another."),
      item("good-2", "injunction", "A court order requiring a person to do or stop doing a specified act."),
      item("good-3", "consideration", "Something of legal value exchanged to support the formation of a binding contract."),
      item("good-4", "fiduciary duty", "A legal duty to act loyally and in good faith for another person's interests.")
    ],
    lastReviewEvent: {
      itemId: "bad-fragment",
      result: "wrong",
      wrongStreak: 1,
      occurredAt: now
    },
    dailyReviewPlans: {
      "2026-07-28": {
        version: 2,
        date: "2026-07-28",
        dueItemIds: ["bad-fragment"],
        reviewItemIds: ["bad-fragment"],
        newItemIds: [],
        completedItemIds: ["bad-fragment"],
        createdAt: now,
        completedAt: now
      },
      "2026-07-29": {
        version: 2,
        date: "2026-07-29",
        dueItemIds: ["bad-fragment", "good-1"],
        reviewItemIds: ["bad-fragment", "good-1"],
        newItemIds: [],
        completedItemIds: [],
        createdAt: now
      }
    },
    focusReviewRound: {
      id: "focus-invalid",
      createdAt: now,
      itemIds: ["bad-fragment"],
      attemptedItemIds: []
    },
    activeQuestion: {
      itemId: "bad-fragment",
      occurredAt: now
    }
  });
  const beforeRejectedConfirmation = await readFile(storePath, "utf8");
  await assert.rejects(() => markVocabQualityOk("bad-fragment"), /句子片段|正文片段/);
  assert.equal(await readFile(storePath, "utf8"), beforeRejectedConfirmation);

  const retired = await retireVocabItem("bad-fragment", "正文片段，不适合继续出题。");
  assert.equal(retired.item.questionQuality?.status, "pending-review");
  assert.ok(retired.item.retiredAt);
  assert.equal(retired.item.reviewState.wrongCount, 0);
  assert.equal(retired.item.reviewState.focus, false);
  assert.equal(retired.item.reviewState.reinforcementPending, false);

  const retiredStore = JSON.parse(await readFile(storePath, "utf8"));
  assert.deepEqual(retiredStore.dailyReviewPlans["2026-07-28"].dueItemIds, ["bad-fragment"]);
  assert.deepEqual(retiredStore.dailyReviewPlans["2026-07-28"].completedItemIds, ["bad-fragment"]);
  assert.deepEqual(retiredStore.dailyReviewPlans["2026-07-29"].dueItemIds, ["good-1"]);
  assert.deepEqual(retiredStore.dailyReviewPlans["2026-07-29"].reviewItemIds, ["good-1"]);
  assert.equal(retiredStore.focusReviewRound, undefined);
  assert.equal(retiredStore.activeQuestion, undefined);
  assert.equal(retiredStore.lastReviewEvent, undefined);
  const afterRetireReview = await getVocabReview("2026-07-29", "all");
  assert.ok(afterRetireReview.questions.every((question) => question.itemId !== "bad-fragment"));

  console.log(JSON.stringify({
    passed: true,
    isolatedStore: storePath,
    checks: [
      "待确认词不进入题干或干扰项",
      "人工确认、编辑和重新检索更新统一质量状态",
      "计划、重点轮次和当前题目引用阻止删除",
      "正文片段不能被人工确认放行",
      "移出学习保留完成历史并清除无效记忆信号",
      "America/Toronto 02:00 学习日边界"
    ]
  }, null, 2));
}

try {
  await run();
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}
