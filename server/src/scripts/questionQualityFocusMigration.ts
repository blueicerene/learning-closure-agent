import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditFallbackDictionaryItem } from "../services/questionQuality.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const storePath = process.env.LEGAL_VOCAB_PATH || path.join(projectRoot, "output/legal-vocab.json");
const apply = process.argv.includes("--apply");
const municipalResetConfirmed = process.argv.includes("--confirm-municipal-neutral-reset");

type JsonRecord = Record<string, unknown>;
type Store = {
  updatedAt?: string;
  items: JsonRecord[];
  [key: string]: unknown;
};

const sourceBytes = await readFile(storePath);
const sourceHash = sha256(sourceBytes);
const source = JSON.parse(sourceBytes.toString("utf8")) as Store;
const migrated = structuredClone(source);
const itemChanges: {
  id: string;
  term: string;
  changes: string[];
}[] = [];

for (const item of migrated.items) {
  if (item.lookupQuality !== "dictionary") continue;
  const audit = auditFallbackDictionaryItem({
    term: String(item.term || ""),
    definition: String(item.definition || ""),
    legalContext: typeof item.legalContext === "string" ? item.legalContext : undefined
  });
  const changes: string[] = [];
  item.lemma = String(item.term || "").toLowerCase();
  item.partOfSpeech = audit.expectedPartOfSpeech;
  changes.push("lemma", "partOfSpeech");

  if (audit.decision === "repair" && audit.repairedDefinition) {
    item.definition = audit.repairedDefinition;
    if (audit.repairedChineseDefinition) {
      item.chineseDefinition = audit.repairedChineseDefinition;
    }
    item.lookupQuality = "saved";
    item.sourceLabel = "人工确认法律释义";
    delete item.lookupWarning;
    changes.push("definition", "chineseDefinition", "lookupQuality", "sourceLabel", "lookupWarning");
  }
  item.questionQuality = audit.decision === "pending-review"
    ? {
        status: "pending-review",
        reasons: audit.reasons,
        evaluatedAt: new Date().toISOString()
      }
    : {
        status: "eligible",
        reasons: audit.reasons,
        evaluatedAt: new Date().toISOString()
      };
  changes.push("questionQuality");
  itemChanges.push({
    id: String(item.id),
    term: String(item.term),
    changes: [...new Set(changes)]
  });
}

const municipal = migrated.items.find((item) => String(item.term).toLowerCase() === "municipal");
if (municipal && municipalResetConfirmed) {
  municipal.reviewState = {
    status: "review",
    correctStreak: 0,
    wrongCount: 0,
    wrongStreak: 0,
    memoryStrength: 18,
    easeFactor: 2.2,
    lastIntervalDays: 1,
    retentionTarget: 0.85,
    lastReviewedAt: "2026-07-27",
    nextReviewAt: "2026-07-28",
    focus: false,
    focusRecoveryCorrectCount: 0,
    reinforcementPending: false
  };
  const change = itemChanges.find((entry) => entry.id === municipal.id);
  change?.changes.push("reviewState:neutral-quality-exemption");
}

for (const item of migrated.items) {
  if (item === municipal) continue;
  const reviewState = item.reviewState as JsonRecord | undefined;
  if (!reviewState || reviewState.status === "mastered") continue;
  const isLegacyFocus = reviewState.lastResult === "wrong"
    && Number(reviewState.wrongStreak ?? 0) >= 2;
  if (!isLegacyFocus) continue;
  reviewState.focus = true;
  reviewState.focusRecoveryCorrectCount = 0;
  reviewState.reinforcementPending = false;
  delete reviewState.reinforcementSessionId;
  itemChanges.push({
    id: String(item.id),
    term: String(item.term),
    changes: ["reviewState.focus:migrated-from-legacy-repeated-wrong"]
  });
}

const protectedBefore = protectedProjection(source);
const protectedAfter = protectedProjection(migrated);
const protectedBeforeHash = sha256(Buffer.from(JSON.stringify(protectedBefore)));
const protectedAfterHash = sha256(Buffer.from(JSON.stringify(protectedAfter)));
if (protectedBeforeHash !== protectedAfterHash) {
  throw new Error("Protected projection changed outside the authorized fields.");
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  storePath,
  sourceHash,
  municipalResetConfirmed,
  historicalAmbiguity: municipalResetConfirmed
    ? undefined
    : "municipal has three invalid-definition wrong answers and no exact answer snapshots; real apply requires --confirm-municipal-neutral-reset.",
  itemChanges,
  fallbackRepairs: itemChanges
    .filter((entry) => entry.changes.includes("definition"))
    .map((entry) => entry.term),
  legacyFocusMigrations: itemChanges
    .filter((entry) => entry.changes.some((change) => change.startsWith("reviewState.focus")))
    .map((entry) => entry.term),
  protectedBeforeHash,
  protectedAfterHash
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
if (!municipalResetConfirmed) {
  throw new Error("Refusing apply until the municipal neutral reset is explicitly confirmed.");
}

const latestBytes = await readFile(storePath);
if (sha256(latestBytes) !== sourceHash) {
  throw new Error("Source hash changed after dry-run calculation; rerun the migration.");
}
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const backupPath = path.join(
  path.dirname(storePath),
  "backups",
  `legal-vocab-before-question-quality-focus-${timestamp}.json`
);
await mkdir(path.dirname(backupPath), { recursive: true });
await writeFile(backupPath, latestBytes);

migrated.updatedAt = new Date().toISOString();
const tempPath = `${storePath}.question-quality-focus.tmp`;
await writeFile(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
await rename(tempPath, storePath);

console.log(JSON.stringify({
  ...summary,
  backupPath,
  backupHash: sha256(await readFile(backupPath)),
  outputHash: sha256(await readFile(storePath))
}, null, 2));

function protectedProjection(store: Store) {
  return {
    ...store,
    updatedAt: undefined,
    items: store.items.map((item) => {
      const clone = structuredClone(item);
      delete clone.definition;
      delete clone.chineseDefinition;
      delete clone.lookupQuality;
      delete clone.sourceLabel;
      delete clone.lookupWarning;
      delete clone.lemma;
      delete clone.partOfSpeech;
      delete clone.questionQuality;
      if (String(clone.term).toLowerCase() === "municipal") {
        delete clone.reviewState;
      } else if (clone.reviewState && typeof clone.reviewState === "object") {
        const reviewState = clone.reviewState as JsonRecord;
        delete reviewState.focus;
        delete reviewState.focusRecoveryCorrectCount;
        delete reviewState.reinforcementPending;
        delete reviewState.reinforcementSessionId;
      }
      return clone;
    })
  };
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
