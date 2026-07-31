import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import {
  DAILY_PLAN_MAX_ITEMS,
  DAILY_PLAN_MAX_NEW_ITEMS,
  createDailyPlanV2,
  getFrozenPlanPendingIds,
  partitionDailyPlanCandidates,
  selectFrozenPlanItems,
  summarizeDailyPlan,
  type DailyPlanCandidate
} from "../services/dailyPlan.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const evidenceDir = path.join(projectRoot, "artifacts/release-gate/daily-plan");
const args = process.argv.slice(2);
const caseName = argumentValue("--case");
const fixturePath = argumentValue("--fixture");
const useReadOnlyCopy = args.includes("--read-only-copy");

async function run(): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });

  if (fixturePath) {
    assert.equal(useReadOnlyCopy, true, "real fixture checks require --read-only-copy");
    await runRealStoreDryRun(path.resolve(projectRoot, fixturePath));
    return;
  }

  const supportedCases = new Set([
    "plan-total-at-most-20",
    "new-items-at-most-10",
    "separate-review-and-pending-pools",
    "frozen-plan-does-not-expand",
    "review-returns-frozen-plan-only",
    "resume-frozen-plan",
    "calendar-completion-statuses",
    "two-am-learning-day-cutoff"
  ]);
  assert.ok(caseName && supportedCases.has(caseName), `unsupported daily-plan release case: ${caseName}`);

  if (caseName === "resume-frozen-plan") {
    await runResumeFrozenPlanContract();
    return;
  }

  if (caseName === "calendar-completion-statuses") {
    await runCalendarStatusContract();
    return;
  }

  if (caseName === "two-am-learning-day-cutoff") {
    await runLearningDayCutoffContract();
    return;
  }

  if (caseName === "frozen-plan-does-not-expand" || caseName === "review-returns-frozen-plan-only") {
    await runFrozenApiContract(caseName);
    return;
  }

  const date = "2026-07-26";
  const mixedItems = [
    ...makeCandidates("review", 14, true, date),
    ...makeCandidates("pending", 30, false, date)
  ];
  const pools = partitionDailyPlanCandidates(mixedItems, date);
  const plan = createDailyPlanV2(mixedItems, date, "2026-07-26T12:00:00.000Z");
  const summary = summarizeDailyPlan(plan, pools);
  const pendingOnlyPlan = createDailyPlanV2(
    makeCandidates("pending-only", 30, false, date),
    date,
    "2026-07-26T12:00:00.000Z"
  );
  const reviewBacklogPlan = createDailyPlanV2([
    ...makeCandidates("review-backlog", 25, true, date),
    ...makeCandidates("blocked-pending", 30, false, date)
  ], date, "2026-07-26T12:00:00.000Z");

  assert.equal(pools.reviewDue.length, 14);
  assert.equal(pools.pending.length, 30);
  assert.ok(plan.dueItemIds.length <= DAILY_PLAN_MAX_ITEMS);
  assert.ok((plan.newItemIds?.length ?? 0) <= DAILY_PLAN_MAX_NEW_ITEMS);
  assert.equal(pendingOnlyPlan.newItemIds?.length, DAILY_PLAN_MAX_NEW_ITEMS);
  assert.equal(reviewBacklogPlan.dueItemIds.length, DAILY_PLAN_MAX_ITEMS);
  assert.equal(reviewBacklogPlan.newItemIds?.length, 0);
  assert.deepEqual(
    new Set(plan.dueItemIds),
    new Set([...(plan.reviewItemIds ?? []), ...(plan.newItemIds ?? [])])
  );

  await writeEvidence(`${caseName}.json`, {
    case: caseName,
    passed: true,
    input: { total: mixedItems.length, reviewDue: pools.reviewDue.length, pending: pools.pending.length },
    plan: summary,
    boundaryScenarios: {
      pendingOnly: summarizeDailyPlan(pendingOnlyPlan),
      reviewBacklog: summarizeDailyPlan(reviewBacklogPlan)
    },
    limits: { total: DAILY_PLAN_MAX_ITEMS, new: DAILY_PLAN_MAX_NEW_ITEMS }
  });
  console.log(`PASS ${caseName}: total=${summary.total}, review=${summary.reviewCount}, new=${summary.newCount}`);
}

async function runLearningDayCutoffContract(): Promise<void> {
  const { learningDayKey } = await import("../services/vocab.js");
  const beforeMidnight = learningDayKey("2026-07-29T03:59:59.000Z");
  const afterMidnightBeforeCutoff = learningDayKey("2026-07-29T04:00:05.000Z");
  const beforeCutoff = learningDayKey("2026-07-29T05:59:59.000Z");
  const atCutoff = learningDayKey("2026-07-29T06:00:00.000Z");

  assert.equal(beforeMidnight, "2026-07-28");
  assert.equal(afterMidnightBeforeCutoff, "2026-07-28");
  assert.equal(beforeCutoff, "2026-07-28");
  assert.equal(atCutoff, "2026-07-29");

  await writeEvidence("two-am-learning-day-cutoff.json", {
    case: "two-am-learning-day-cutoff",
    passed: true,
    timeZone: "America/Toronto",
    cutoff: "02:00",
    fixtures: {
      beforeMidnight,
      afterMidnightBeforeCutoff,
      beforeCutoff,
      atCutoff
    }
  });
  console.log("PASS two-am-learning-day-cutoff: 00:00-01:59 remains on the previous learning day");
}

async function runCalendarStatusContract(): Promise<void> {
  const { summarizeDailyPlanCalendarDay } = await import("../services/vocab.js");
  const makePlan = (dueItemIds: string[], completedItemIds: string[]) => ({
    version: 2 as const,
    date: "2026-07-26",
    createdAt: "2026-07-26T12:00:00.000Z",
    dueItemIds,
    completedItemIds,
    reviewItemIds: dueItemIds,
    newItemIds: []
  });
  const complete = summarizeDailyPlanCalendarDay(
    "2026-07-24",
    makePlan(["a", "b"], ["a", "b", "not-in-plan"])
  );
  const partial = summarizeDailyPlanCalendarDay(
    "2026-07-25",
    makePlan(["a", "b", "c", "d"], ["a", "b"])
  );
  const belowHalf = summarizeDailyPlanCalendarDay(
    "2026-07-26",
    makePlan(["a", "b", "c", "d"], ["a"])
  );
  const noPlan = summarizeDailyPlanCalendarDay("2026-07-23");

  assert.equal(complete.status, "complete");
  assert.equal(complete.progress, 100);
  assert.equal(partial.status, "partial");
  assert.equal(partial.progress, 50);
  assert.equal(belowHalf.status, "empty");
  assert.equal(belowHalf.progress, 25);
  assert.equal(noPlan.status, "empty");
  assert.equal(noPlan.hasPlan, false);

  await writeEvidence("calendar-status-rules.json", {
    case: "calendar-completion-statuses",
    passed: true,
    rule: {
      complete: "all frozen plan items completed",
      partial: "at least 50% completed but not all",
      empty: "below 50% or no frozen plan"
    },
    fixtures: { complete, partial, belowHalf, noPlan }
  });
  console.log("PASS calendar-completion-statuses: complete/partial/empty data rules");
}

async function runFrozenApiContract(name: string): Promise<void> {
  const tmpDir = await makeTempDir();
  const storePath = path.join(tmpDir, "legal-vocab.json");
  process.env.LEGAL_VOCAB_PATH = storePath;
  process.env.USE_OPENAI_LEGAL_LOOKUP = "false";
  process.env.DAILY_PLAN_V2_ENABLED = "true";
  const date = torontoLearningDayKey(new Date());
  const initialItems = [
    ...makeStoreItems("api-review", 6, true, date),
    ...makeStoreItems("api-pending", 25, false, date)
  ];
  await writeFile(storePath, JSON.stringify(makeStore(initialItems), null, 2), "utf8");

  const { getVocabReview } = await import("../services/vocab.js");
  const first = await getVocabReview(date, "due");
  const frozenIds = first.questions.map((question) => question.itemId);
  assert.ok(frozenIds.length <= DAILY_PLAN_MAX_ITEMS);

  const storedAfterFreeze = JSON.parse(await readFile(storePath, "utf8"));
  const frozenPlan = storedAfterFreeze.dailyReviewPlans[date];
  assert.deepEqual(frozenIds, getFrozenPlanPendingIds(frozenPlan));

  storedAfterFreeze.items.push(
    ...makeStoreItems("late-pending", 4, false, date),
    ...makeStoreItems("late-review", 2, true, date)
  );
  await writeFile(storePath, JSON.stringify(storedAfterFreeze, null, 2), "utf8");
  const second = await getVocabReview(date, "due");
  const secondIds = second.questions.map((question) => question.itemId);
  assert.deepEqual(secondIds, frozenIds);

  await writeEvidence(`${name}.json`, {
    case: name,
    passed: true,
    frozenPlanTotal: frozenIds.length,
    addedAfterFreeze: 6,
    firstReadIds: frozenIds,
    secondReadIds: secondIds,
    unchanged: true
  });
  await rm(tmpDir, { recursive: true, force: true });
  console.log(`PASS ${name}: frozen plan stayed at ${frozenIds.length} after six candidates were added`);
}

async function runResumeFrozenPlanContract(): Promise<void> {
  const tmpDir = await makeTempDir();
  const storePath = path.join(tmpDir, "legal-vocab.json");
  process.env.LEGAL_VOCAB_PATH = storePath;
  process.env.USE_OPENAI_LEGAL_LOOKUP = "false";
  process.env.DAILY_PLAN_V2_ENABLED = "true";
  const date = torontoLearningDayKey(new Date());
  const initialItems = [
    ...makeStoreItems("resume-review", 6, true, date),
    ...makeStoreItems("resume-pending", 25, false, date)
  ];
  await writeFile(storePath, JSON.stringify(makeStore(initialItems), null, 2), "utf8");

  try {
    const { getLearningStatus, getVocabReview, recordVocabAnswer } = await import("../services/vocab.js");
    const first = await getVocabReview(date, "due");
    const frozenIds = first.questions.map((question) => question.itemId);
    assert.ok(frozenIds.length > 2);

    for (const question of first.questions.slice(0, 2)) {
      await recordVocabAnswer({
        itemId: question.itemId,
        selectedDefinition: question.correctDefinition,
        correctDefinition: question.correctDefinition,
        isCorrect: true
      });
    }

    const storedAfterAnswers = JSON.parse(await readFile(storePath, "utf8"));
    const frozenPlan = storedAfterAnswers.dailyReviewPlans[date];
    assert.deepEqual(frozenPlan.dueItemIds, frozenIds);
    assert.deepEqual(frozenPlan.completedItemIds, frozenIds.slice(0, 2));

    const resumed = await getVocabReview(date, "due");
    const resumedIds = resumed.questions.map((question) => question.itemId);
    assert.deepEqual(resumedIds, frozenIds.slice(2));

    const nextDate = new Date(`${date}T12:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const utcShiftedClientDate = nextDate.toISOString().slice(0, 10);
    const guarded = await getVocabReview(utcShiftedClientDate, "due");
    assert.equal(guarded.date, date);
    assert.deepEqual(
      guarded.questions.map((question) => question.itemId),
      resumedIds
    );

    const learningStatus = await getLearningStatus();
    assert.equal(learningStatus.dailyPlanTotal, frozenIds.length);
    assert.equal(learningStatus.dailyPlanCompleted, 2);
    assert.equal(learningStatus.dueToday, frozenIds.length - 2);

    await writeEvidence("resume-frozen-plan.json", {
      case: "resume-frozen-plan",
      passed: true,
      frozenPlanTotal: frozenIds.length,
      completedBeforeExit: frozenPlan.completedItemIds,
      frozenOrderPreserved: true,
      resumedAtItemId: resumedIds[0],
      expectedNextItemId: frozenIds[2],
      remainingIds: resumedIds,
      utcShiftedClientDateIgnored: true,
      learningStatus: {
        dailyPlanTotal: learningStatus.dailyPlanTotal,
        dailyPlanCompleted: learningStatus.dailyPlanCompleted,
        dueToday: learningStatus.dueToday
      },
      source: "isolated temporary vocab store"
    });
    console.log(
      `PASS resume-frozen-plan: total=${frozenIds.length}, completed=2, remaining=${resumedIds.length}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runRealStoreDryRun(sourcePath: string): Promise<void> {
  const sourceBefore = await readFile(sourcePath);
  const sourceHashBefore = sha256(sourceBefore);
  const parsed = JSON.parse(sourceBefore.toString("utf8"));
  const date = torontoLearningDayKey(new Date());
  const eligibleItems = (parsed.items as DailyPlanCandidate[]).filter(isEligibleRealItem);
  const pools = partitionDailyPlanCandidates(eligibleItems, date);
  const plan = createDailyPlanV2(eligibleItems, date, new Date().toISOString());
  const summary = summarizeDailyPlan(plan, pools);

  assert.ok(plan.dueItemIds.length <= DAILY_PLAN_MAX_ITEMS);
  assert.ok((plan.newItemIds?.length ?? 0) <= DAILY_PLAN_MAX_NEW_ITEMS);
  assert.ok((plan.reviewItemIds?.length ?? 0) + (plan.newItemIds?.length ?? 0) <= DAILY_PLAN_MAX_ITEMS);

  const tmpDir = await makeTempDir();
  const copyPath = path.join(tmpDir, "legal-vocab.json");
  const copyStore = structuredClone(parsed);
  copyStore.dailyReviewPlans = {
    ...(copyStore.dailyReviewPlans ?? {}),
    [date]: plan
  };
  await writeFile(copyPath, JSON.stringify(copyStore, null, 2), "utf8");
  process.env.LEGAL_VOCAB_PATH = copyPath;
  process.env.USE_OPENAI_LEGAL_LOOKUP = "false";
  process.env.DAILY_PLAN_V2_ENABLED = "true";

  const { getVocabReview } = await import("../services/vocab.js");
  const firstRead = await getVocabReview(date, "due");
  assert.deepEqual(firstRead.questions.map((question) => question.itemId), plan.dueItemIds);

  const copyAfterFirstRead = JSON.parse(await readFile(copyPath, "utf8"));
  copyAfterFirstRead.items.push(...makeStoreItems("post-freeze", 3, false, date));
  await writeFile(copyPath, JSON.stringify(copyAfterFirstRead, null, 2), "utf8");
  const secondRead = await getVocabReview(date, "due");
  assert.deepEqual(
    secondRead.questions.map((question) => question.itemId),
    firstRead.questions.map((question) => question.itemId)
  );

  const sourceAfter = await readFile(sourcePath);
  const sourceHashAfter = sha256(sourceAfter);
  assert.equal(sourceHashAfter, sourceHashBefore);

  await writeEvidence("real-store-bounded-plan.json", {
    passed: true,
    mode: "read-only-copy",
    sourcePath,
    sourceItemCount: parsed.items.length,
    expectedEarlierBaselineCount: 159,
    sourceCountDrift: parsed.items.length - 159,
    eligibleInputCount: eligibleItems.length,
    inventory: {
      reviewDue: pools.reviewDue.length,
      pending: pools.pending.length
    },
    dryRunPlan: summary,
    frozenRead: {
      firstCount: firstRead.questions.length,
      secondCountAfterAddingThreePendingItems: secondRead.questions.length,
      unchanged: true
    },
    sourceIntegrity: {
      sha256Before: sourceHashBefore,
      sha256After: sourceHashAfter,
      unchanged: sourceHashBefore === sourceHashAfter
    }
  });
  await rm(tmpDir, { recursive: true, force: true });
  console.log(
    `PASS real-store-bounded-plan: source=${parsed.items.length}, total=${summary.total}, `
      + `review=${summary.reviewCount}, new=${summary.newCount}, source unchanged`
  );
}

function makeCandidates(
  prefix: string,
  count: number,
  reviewed: boolean,
  date: string
): DailyPlanCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    createdAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`,
    updatedAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`,
    isImportant: !reviewed && index < 2,
    reviewState: {
      status: reviewed ? "review" : "new",
      wrongCount: reviewed && index < 2 ? 2 : 0,
      lastResult: reviewed && index < 2 ? "wrong" : undefined,
      lastReviewedAt: reviewed ? "2026-07-01" : undefined,
      nextReviewAt: reviewed ? date : undefined
    }
  }));
}

function makeStoreItems(prefix: string, count: number, reviewed: boolean, date: string) {
  return makeCandidates(prefix, count, reviewed, date).map((item, index) => ({
    ...item,
    term: `${prefix} term ${index + 1}`,
    definition: `A distinct legal definition for ${prefix} candidate number ${index + 1}.`,
    sourceText: `${prefix} term ${index + 1}`,
    isImportant: Boolean(item.isImportant)
  }));
}

function makeStore(items: unknown[]) {
  return {
    version: "v0.1",
    updatedAt: new Date().toISOString(),
    items,
    dailyReviewPlans: {}
  };
}

function isEligibleRealItem(item: DailyPlanCandidate & { definition?: string }): boolean {
  const definition = item.definition?.trim() ?? "";
  return Boolean(item.id) && definition.length >= 12 && !/[\u3400-\u9fff]/u.test(definition);
}

async function makeTempDir(): Promise<string> {
  return await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "daily-plan-v2-"))
  );
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function argumentValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function torontoLearningDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const calendarDate = `${values.year}-${values.month}-${values.day}`;
  if (Number(values.hour) >= 2) return calendarDate;
  const previous = new Date(`${calendarDate}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
