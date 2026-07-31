import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const storePath = path.join(projectRoot, "output/legal-vocab.json");
const backupDir = path.join(projectRoot, "output/backups");
const evidencePath = path.join(
  projectRoot,
  "artifacts/release-gate/daily-plan/midnight-cutoff-repair.json"
);
const apply = process.argv.includes("--apply");
const sourceDate = "2026-07-28";
const prematureDate = "2026-07-29";
const cutoffInstant = new Date("2026-07-29T06:00:00.000Z");

type Plan = {
  version?: number;
  date: string;
  dueItemIds: string[];
  reviewItemIds?: string[];
  newItemIds?: string[];
  completedItemIds: string[];
  createdAt: string;
  completedAt?: string;
};

type Store = {
  updatedAt: string;
  items: { id: string; term: string; updatedAt: string }[];
  dailyReviewPlans: Record<string, Plan>;
  [key: string]: unknown;
};

const sourceBytes = await readFile(storePath);
const sourceHash = sha256(sourceBytes);
const store = JSON.parse(sourceBytes.toString("utf8")) as Store;
const sourcePlan = store.dailyReviewPlans?.[sourceDate];
const prematurePlan = store.dailyReviewPlans?.[prematureDate];

if (!sourcePlan || !prematurePlan) {
  throw new Error("Expected both the source and premature plans to exist.");
}
if (sourcePlan.version !== 2 || prematurePlan.version !== 2) {
  throw new Error("Both plans must use Daily Plan v2.");
}
if (new Date(prematurePlan.createdAt) >= cutoffInstant) {
  throw new Error("The next-day plan was not created before the 02:00 cutoff.");
}

const sourceCompleted = new Set(sourcePlan.completedItemIds);
const sourceRemaining = sourcePlan.dueItemIds.filter((itemId) => !sourceCompleted.has(itemId));
const prematureCompleted = [...new Set(prematurePlan.completedItemIds)];
if (sourceRemaining.length === 0) {
  throw new Error("The source plan is already complete.");
}
if (sourceRemaining.length !== prematureCompleted.length
    || sourceRemaining.some((itemId) => !prematureCompleted.includes(itemId))) {
  throw new Error("Premature completions do not exactly match the prior plan's remaining items.");
}
if (prematureCompleted.some((itemId) => !prematurePlan.dueItemIds.includes(itemId))) {
  throw new Error("A premature completion is not part of the premature plan.");
}

const movedItems = prematureCompleted.map((itemId) => {
  const item = store.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Missing item ${itemId}.`);
  if (new Date(item.updatedAt) >= cutoffInstant) {
    throw new Error(`${item.term} was answered after the 02:00 cutoff.`);
  }
  return { itemId, term: item.term, answeredAt: item.updatedAt };
});

const protectedBefore = protectedHash(store);
const migratedStore = structuredClone(store);
const migratedSourcePlan = migratedStore.dailyReviewPlans[sourceDate];
migratedSourcePlan.completedItemIds = [
  ...migratedSourcePlan.completedItemIds,
  ...sourceRemaining.filter((itemId) => !migratedSourcePlan.completedItemIds.includes(itemId))
];
migratedSourcePlan.completedAt = movedItems
  .map((item) => item.answeredAt)
  .sort()
  .at(-1);
delete migratedStore.dailyReviewPlans[prematureDate];
const protectedAfter = protectedHash(migratedStore);

if (protectedAfter !== protectedBefore) {
  throw new Error("Protected learning data changed during the migration.");
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  sourcePath: storePath,
  sourceSha256: sourceHash,
  sourceDate,
  prematureDate,
  cutoff: "02:00 America/Toronto",
  before: {
    source: planSummary(sourcePlan),
    premature: planSummary(prematurePlan)
  },
  after: {
    source: planSummary(migratedSourcePlan),
    prematurePlanRemoved: true
  },
  movedItems,
  protectedHashBefore: protectedBefore,
  protectedHashAfter: protectedAfter,
  backupPath: null as string | null,
  resultSha256: null as string | null
};

if (apply) {
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `legal-vocab-before-midnight-cutoff-repair-${stamp}.json`);
  await writeFile(backupPath, sourceBytes);
  const backupHash = sha256(await readFile(backupPath));
  if (backupHash !== sourceHash) throw new Error("Backup bytes do not match the source.");

  const latestBytes = await readFile(storePath);
  if (sha256(latestBytes) !== sourceHash) {
    throw new Error("The source changed after validation; migration was not written.");
  }

  const nextBytes = Buffer.from(`${JSON.stringify(migratedStore, null, 2)}\n`, "utf8");
  const temporaryPath = `${storePath}.midnight-cutoff-${process.pid}.tmp`;
  await writeFile(temporaryPath, nextBytes);
  await rename(temporaryPath, storePath);
  summary.backupPath = backupPath;
  summary.resultSha256 = sha256(await readFile(storePath));
}

await mkdir(path.dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

function planSummary(plan: Plan): { total: number; completed: number; completedAt?: string } {
  return {
    total: plan.dueItemIds.length,
    completed: plan.completedItemIds.length,
    completedAt: plan.completedAt
  };
}

function protectedHash(storeValue: Store): string {
  const {
    dailyReviewPlans: _dailyReviewPlans,
    ...protectedStore
  } = storeValue;
  return sha256(Buffer.from(JSON.stringify(protectedStore), "utf8"));
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
