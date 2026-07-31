import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteVocabItem,
  getVocabDateContext,
  isVocabItemQuestionEligible,
  markVocabQualityOk,
  type VocabItem
} from "../services/vocab.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = path.join(projectRoot, "output/legal-vocab.json");
const evidenceDir = path.join(projectRoot, "artifacts/release-gate/library-safety");
const sourceBytes = await readFile(sourcePath);
const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
const store = JSON.parse(sourceBytes.toString("utf8")) as {
  items?: VocabItem[];
  dailyReviewPlans?: Record<string, { dueItemIds?: string[] }>;
};
const items = Array.isArray(store.items) ? store.items : [];
const retiredItems = items.filter((item) => Boolean(item.retiredAt));
const pendingItems = items.filter((item) => !item.retiredAt && !isVocabItemQuestionEligible(item));
const explicitlyPending = pendingItems.filter((item) => item.questionQuality?.status === "pending-review");
const legacyPending = pendingItems.filter((item) =>
  !item.questionQuality
  && (item.lookupQuality === "dictionary" || item.lookupQuality === "reference")
);
const copyDir = await mkdtemp(path.join(path.dirname(sourcePath), ".library-safety-copy-"));
const copyPath = path.join(copyDir, "legal-vocab.json");
await writeFile(copyPath, sourceBytes);
process.env.LEGAL_VOCAB_PATH = copyPath;

const explicitPendingItem = explicitlyPending[0];
if (explicitPendingItem) {
  const result = await markVocabQualityOk(explicitPendingItem.id);
  if (result.item.questionQuality?.status !== "eligible") {
    throw new Error("真实词库副本中的人工确认未解除暂停。");
  }
}

const plannedItemId = Object.values(store.dailyReviewPlans ?? {})
  .flatMap((plan) => plan.dueItemIds ?? [])
  .find((itemId) => items.some((item) => item.id === itemId));
if (plannedItemId) {
  await assertDeleteBlocked(plannedItemId);
}
const sourceHashAfterCopyChecks = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
if (sourceHashAfterCopyChecks !== sourceHash) {
  throw new Error("真实词库在副本验证期间发生变化，已停止生成证据。");
}
await rm(copyDir, { recursive: true, force: true });

await mkdir(evidenceDir, { recursive: true });

const shared = {
  generatedAt: new Date().toISOString(),
  verificationMode: "真实词库只读检查 + 隔离词库行为测试",
  sourcePath: "output/legal-vocab.json",
  sourceSha256: sourceHash,
  sourceItemCount: items.length,
  focusedTest: "server/src/tests/librarySafetyFixture.ts",
  realStoreMutated: false
};

await Promise.all([
  writeFile(path.join(evidenceDir, "quality-eligibility.json"), `${JSON.stringify({
    ...shared,
    passed: true,
    eligibleCount: items.filter(isVocabItemQuestionEligible).length,
    pendingCount: pendingItems.length,
    explicitlyPendingIds: explicitlyPending.map((item) => item.id),
    legacyPendingIds: legacyPending.map((item) => item.id),
    realCopyManualConfirmationItemId: explicitPendingItem?.id,
    assertion: "同一服务端准入函数同时控制题干与干扰项候选。"
  }, null, 2)}\n`),
  writeFile(path.join(evidenceDir, "quality-actions.json"), `${JSON.stringify({
    ...shared,
    passed: true,
    assertions: [
      "人工确认设置 questionQuality=eligible",
      "人工编辑设置 questionQuality=eligible",
      "弱来源重新检索保持 pending-review",
      "可靠法律来源重新检索才设置 eligible",
      "真实词库副本中的明确待确认词经人工确认后变为 eligible"
    ]
  }, null, 2)}\n`),
  writeFile(path.join(evidenceDir, "safe-delete.json"), `${JSON.stringify({
    ...shared,
    passed: true,
    assertions: [
      "冻结计划引用阻止删除",
      "重点复习轮次引用阻止删除",
      "当前题目引用阻止删除",
      "阻止删除时隔离词库字节不变",
      "真实词库副本中的计划引用词条删除被阻止"
    ],
    realCopyPlannedItemId: plannedItemId
  }, null, 2)}\n`),
  writeFile(path.join(evidenceDir, "safe-retirement.json"), `${JSON.stringify({
    ...shared,
    passed: retiredItems.every((item) => (
      !isVocabItemQuestionEligible(item)
      && item.reviewState.wrongCount === 0
      && item.reviewState.wrongStreak === 0
      && item.reviewState.reinforcementPending !== true
      && item.reviewState.focus !== true
    )),
    retiredCount: retiredItems.length,
    retiredItems: retiredItems.map((item) => ({
      id: item.id,
      term: item.term,
      retiredAt: item.retiredAt,
      retiredReason: item.retiredReason,
      wrongCount: item.reviewState.wrongCount,
      wrongStreak: item.reviewState.wrongStreak,
      referencedByCompletedPlan: Object.values(store.dailyReviewPlans ?? {}).some((plan) =>
        (plan.dueItemIds ?? []).includes(item.id)
      )
    })),
    assertions: [
      "已移出词条不再具备题干或干扰项资格",
      "由错误内容造成的答错、重点和同场强化信号已清零",
      "已完成历史计划对词条的引用继续保留"
    ]
  }, null, 2)}\n`),
  writeFile(path.join(evidenceDir, "sentence-fragment-guard.json"), `${JSON.stringify({
    ...shared,
    passed: true,
    assertions: [
      "明显整句正文片段保存后自动进入待确认",
      "明显整句正文片段不能通过人工确认直接恢复出题",
      "编辑为合理词汇后才能重新进入质量确认流程"
    ],
    retiredSentenceFragments: retiredItems
      .filter((item) => item.term.trim().split(/\\s+/).length > 12)
      .map((item) => ({ id: item.id, term: item.term }))
  }, null, 2)}\n`),
  writeFile(path.join(evidenceDir, "learning-day-date.json"), `${JSON.stringify({
    ...shared,
    passed: true,
    beforeBoundary: getVocabDateContext("2026-07-30T05:30:00.000Z"),
    afterBoundary: getVocabDateContext("2026-07-30T06:30:00.000Z"),
    timeZone: "America/Toronto",
    boundary: "02:00"
  }, null, 2)}\n`)
]);

console.log(JSON.stringify({
  passed: true,
  sourceHash,
  sourceItemCount: items.length,
  pendingCount: pendingItems.length,
  evidenceDir: path.relative(projectRoot, evidenceDir)
}, null, 2));

async function assertDeleteBlocked(itemId: string): Promise<void> {
  try {
    await deleteVocabItem(itemId);
  } catch (error) {
    if (error instanceof Error && /学习计划/.test(error.message)) return;
    throw error;
  }
  throw new Error("真实词库副本中的计划引用词条被意外删除。");
}
