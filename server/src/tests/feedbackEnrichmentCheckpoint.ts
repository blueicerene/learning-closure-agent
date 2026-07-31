import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";

const projectRoot = path.resolve(import.meta.dirname, "../../../");
const sourcePath = path.join(projectRoot, "output/legal-vocab.json");
const tmpDir = path.join(os.tmpdir(), `quiz-feedback-checkpoint-${Date.now()}`);
const copyPath = path.join(tmpDir, "legal-vocab.json");
const evidencePath = path.join(
  projectRoot,
  "artifacts/release-gate/quiz-feedback/isolated-ai-enrichment.json"
);

async function run() {
  dotenv.config({ path: path.join(projectRoot, "server/.env") });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await copyFile(sourcePath, copyPath);
  process.env.LEGAL_VOCAB_PATH = copyPath;
  process.env.USE_OPENAI_LEGAL_LOOKUP = "true";

  const sourceBefore = await readFile(sourcePath);
  const fixture = JSON.parse(await readFile(copyPath, "utf8"));
  const sampleTerms = ["legitimate", "Paramountcy (Canada)", "authoritative"];
  const sampleItems = sampleTerms.map((term) =>
    fixture.items.find((item: { term?: string }) =>
      item.term?.trim().toLocaleLowerCase("en") === term.toLocaleLowerCase("en")
    )
  );
  if (sampleItems.some((item) => !item)) {
    throw new Error("固定隔离样本不完整，无法验证未来词条自动补全。");
  }
  sampleItems.forEach((item) => {
    delete item.phonetic;
    delete item.pronunciation;
    delete item.legalContext;
    delete item.legalNote;
  });
  await writeFile(copyPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const copyBefore = JSON.parse(await readFile(copyPath, "utf8"));
  const itemIds = sampleItems.map((item) => String(item.id || ""));

  const { enrichVocabFeedbackDetails } = await import("../services/vocab.js");
  const result = await enrichVocabFeedbackDetails({ itemIds, dryRun: false });
  const copyAfter = JSON.parse(await readFile(copyPath, "utf8"));
  const sourceAfter = await readFile(sourcePath);
  const afterItems = itemIds.map((itemId) =>
    copyAfter.items.find((item: { id: string }) => item.id === itemId)
  );

  if (result.enriched !== itemIds.length || afterItems.some((item) =>
    !item?.legalContext
    || !item?.legalNote?.examples?.some((example: { sentence?: string; translation?: string }) =>
      Boolean(example.sentence?.trim() && example.translation?.trim())
    )
    || !/^\/[^/]+\/$/.test(item.phonetic || item.pronunciation || "")
  )) {
    throw new Error(`隔离补全没有产出可靠内容：${JSON.stringify(result)}`);
  }
  if (hash(sourceBefore) !== hash(sourceAfter)) {
    throw new Error("真实词库在隔离补全过程中发生变化。");
  }
  if (protectedHash(copyBefore) !== protectedHash(copyAfter)) {
    throw new Error("补全改变了受保护的词条、计划或学习历史字段。");
  }

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourcePath: "output/legal-vocab.json",
    sourceSha256Before: hash(sourceBefore),
    sourceSha256After: hash(sourceAfter),
    sourceUnchanged: true,
    temporaryCopy: copyPath,
    result,
    samples: afterItems.map((item) => ({
      itemId: item.id,
      term: item.term,
      phonetic: item.phonetic || item.pronunciation || null,
      legalContext: item.legalContext,
      examples: item.legalNote.examples
    })),
    protectedProjectionSha256Before: protectedHash(copyBefore),
    protectedProjectionSha256After: protectedHash(copyAfter),
    protectedFieldsUnchanged: true,
    realAnswerSubmitted: false
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    passed: true,
    terms: evidence.samples.map((item) => item.term),
    exampleCounts: evidence.samples.map((item) => item.examples.length),
    sourceUnchanged: evidence.sourceUnchanged,
    protectedFieldsUnchanged: evidence.protectedFieldsUnchanged,
    evidencePath: path.relative(projectRoot, evidencePath)
  }));
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

run()
  .finally(() => rm(tmpDir, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
