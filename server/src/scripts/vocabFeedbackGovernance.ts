import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

const projectRoot = path.resolve(import.meta.dirname, "../../../");
dotenv.config({ path: path.join(projectRoot, "server/.env") });

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const batchSize = readPositiveInteger("--batch-size", 10);
const sourcePath = process.env.LEGAL_VOCAB_PATH
  ? path.resolve(process.env.LEGAL_VOCAB_PATH)
  : path.join(projectRoot, "output/legal-vocab.json");
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(projectRoot, "output/enrichment-runs");
const reportPath = path.join(runDir, `vocab-feedback-${apply ? "apply" : "dry-run"}-${runStamp}.json`);

async function run() {
  const sourceBefore = await readFile(sourcePath);
  const storeBefore = JSON.parse(sourceBefore.toString("utf8")) as Record<string, unknown>;
  const sourceSha256Before = hash(sourceBefore);
  const protectedSha256Before = protectedHash(storeBefore);
  const { enrichVocabFeedbackDetails, getVocabFeedbackEnrichmentAudit } = await import("../services/vocab.js");
  const audit = await getVocabFeedbackEnrichmentAudit();

  await mkdir(runDir, { recursive: true });
  if (!apply) {
    const report = {
      schemaVersion: 1,
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      sourcePath,
      sourceSha256: sourceSha256Before,
      protectedProjectionSha256: protectedSha256Before,
      audit: {
        ...audit,
        candidateItemIds: undefined
      },
      projectedBatches: Math.ceil(audit.missingAny / batchSize),
      batchSize,
      allowedItemFields: ["phonetic", "pronunciation", "legalContext", "legalNote"],
      protectedContent: [
        "definition",
        "chineseDefinition",
        "reviewState",
        "dailyReviewPlans",
        "lastReviewEvent",
        "activeQuestion",
        "lookupStats",
        "lookupTrackingStartedAt",
        "createdAt",
        "updatedAt",
        "sourceText"
      ]
    };
    await writeJson(reportPath, report);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return;
  }

  await assertLocalServerStopped();
  const backupDir = path.join(path.dirname(sourcePath), "backups");
  const backupPath = path.join(backupDir, `legal-vocab-before-feedback-enrichment-${runStamp}.json`);
  await mkdir(backupDir, { recursive: true });
  await copyFile(sourcePath, backupPath);
  const backupBytes = await readFile(backupPath);
  if (hash(backupBytes) !== sourceSha256Before) {
    throw new Error("精确备份校验失败，未开始补全。");
  }

  const batchResults: unknown[] = [];
  for (let offset = 0; offset < audit.candidateItemIds.length; offset += batchSize) {
    const itemIds = audit.candidateItemIds.slice(offset, offset + batchSize);
    const result = await enrichVocabFeedbackDetails({ itemIds, dryRun: false });
    const currentStore = JSON.parse(await readFile(sourcePath, "utf8")) as Record<string, unknown>;
    const currentProtectedHash = protectedHash(currentStore);
    if (currentProtectedHash !== protectedSha256Before) {
      throw new Error(`第 ${Math.floor(offset / batchSize) + 1} 批改变了受保护字段，已停止后续补全。`);
    }
    batchResults.push({
      batch: Math.floor(offset / batchSize) + 1,
      offset,
      ...result
    });
    await writeJson(reportPath, buildApplyReport({
      sourceSha256Before,
      protectedSha256Before,
      backupPath,
      audit,
      batchSize,
      batchResults,
      complete: false
    }));
  }

  const sourceAfter = await readFile(sourcePath);
  const storeAfter = JSON.parse(sourceAfter.toString("utf8")) as Record<string, unknown>;
  const finalAudit = await getVocabFeedbackEnrichmentAudit();
  const report = buildApplyReport({
    sourceSha256Before,
    protectedSha256Before,
    backupPath,
    audit,
    batchSize,
    batchResults,
    complete: true,
    sourceSha256After: hash(sourceAfter),
    protectedSha256After: protectedHash(storeAfter),
    finalAudit
  });
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

function buildApplyReport(input: {
  sourceSha256Before: string;
  protectedSha256Before: string;
  backupPath: string;
  audit: { candidateItemIds: string[]; missingAny: number };
  batchSize: number;
  batchResults: unknown[];
  complete: boolean;
  sourceSha256After?: string;
  protectedSha256After?: string;
  finalAudit?: unknown;
}) {
  return {
    schemaVersion: 1,
    mode: "apply",
    updatedAt: new Date().toISOString(),
    sourcePath,
    backupPath: input.backupPath,
    sourceSha256Before: input.sourceSha256Before,
    sourceSha256After: input.sourceSha256After,
    protectedProjectionSha256Before: input.protectedSha256Before,
    protectedProjectionSha256After: input.protectedSha256After,
    protectedFieldsUnchanged:
      !input.protectedSha256After || input.protectedSha256After === input.protectedSha256Before,
    initialCandidateCount: input.audit.missingAny,
    batchSize: input.batchSize,
    processedBatches: input.batchResults.length,
    complete: input.complete,
    finalAudit: input.finalAudit,
    batches: input.batchResults
  };
}

async function assertLocalServerStopped(): Promise<void> {
  try {
    const response = await fetch("http://127.0.0.1:3333/health", {
      signal: AbortSignal.timeout(500)
    });
    if (response.ok) {
      throw new Error("3333 服务仍在运行。为避免并发写入，未开始全库补全。");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("仍在运行")) throw error;
  }
}

function readPositiveInteger(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0 || value > 50) {
    throw new Error(`${flag} 必须是 1 到 50 的整数。`);
  }
  return value;
}

function protectedHash(store: Record<string, unknown>): string {
  const value = store as {
    version?: unknown;
    items?: Array<Record<string, unknown>>;
    lastReviewEvent?: unknown;
    activeQuestion?: unknown;
    dailyReviewPlans?: unknown;
    lookupTrackingStartedAt?: unknown;
  };
  return hash(Buffer.from(JSON.stringify({
    version: value.version,
    items: (value.items ?? []).map((item) => {
      const {
        phonetic: _phonetic,
        pronunciation: _pronunciation,
        legalContext: _legalContext,
        legalNote: _legalNote,
        ...protectedItem
      } = item;
      return protectedItem;
    }),
    lastReviewEvent: value.lastReviewEvent,
    activeQuestion: value.activeQuestion,
    dailyReviewPlans: value.dailyReviewPlans,
    lookupTrackingStartedAt: value.lookupTrackingStartedAt
  })));
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
