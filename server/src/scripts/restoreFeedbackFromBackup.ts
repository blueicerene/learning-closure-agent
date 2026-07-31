import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../../../");
const sourcePath = path.join(projectRoot, "output/legal-vocab.json");
const backupArg = readArg("--backup");
const itemIds = readArg("--item-ids").split(",").map((value) => value.trim()).filter(Boolean);
const backupPath = path.resolve(backupArg);

async function run() {
  const [sourceRaw, backupRaw] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(backupPath, "utf8")
  ]);
  const current = JSON.parse(sourceRaw) as VocabStore;
  const backup = JSON.parse(backupRaw) as VocabStore;
  const protectedBefore = protectedHash(current);
  const backupById = new Map(backup.items.map((item) => [item.id, item]));
  const restored: { itemId: string; term: string }[] = [];

  for (const itemId of itemIds) {
    const currentItem = current.items.find((item) => item.id === itemId);
    const backupItem = backupById.get(itemId);
    if (!currentItem || !backupItem) {
      throw new Error(`备份或当前词库中没有词条 ${itemId}。`);
    }
    restoreField(currentItem, backupItem, "phonetic");
    restoreField(currentItem, backupItem, "pronunciation");
    restoreField(currentItem, backupItem, "legalContext");
    restoreField(currentItem, backupItem, "legalNote");
    restored.push({ itemId, term: currentItem.term });
  }

  if (protectedHash(current) !== protectedBefore) {
    throw new Error("恢复操作改变了受保护字段，未写入。");
  }
  const temporaryPath = `${sourcePath}.feedback-restore-${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  await rename(temporaryPath, sourcePath);
  console.log(JSON.stringify({
    sourcePath,
    backupPath,
    restored,
    protectedProjectionSha256: protectedBefore
  }, null, 2));
}

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

function restoreField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: "phonetic" | "pronunciation" | "legalContext" | "legalNote"
) {
  if (Object.prototype.hasOwnProperty.call(source, field)) {
    target[field] = source[field];
  } else {
    delete target[field];
  }
}

function protectedHash(store: VocabStore): string {
  return createHash("sha256").update(JSON.stringify({
    version: store.version,
    items: store.items.map((item) => {
      const {
        phonetic: _phonetic,
        pronunciation: _pronunciation,
        legalContext: _legalContext,
        legalNote: _legalNote,
        ...protectedItem
      } = item;
      return protectedItem;
    }),
    lastReviewEvent: store.lastReviewEvent,
    activeQuestion: store.activeQuestion,
    dailyReviewPlans: store.dailyReviewPlans,
    lookupTrackingStartedAt: store.lookupTrackingStartedAt
  })).digest("hex");
}

type VocabItem = Record<string, unknown> & { id: string; term: string };
type VocabStore = {
  version?: unknown;
  items: VocabItem[];
  lastReviewEvent?: unknown;
  activeQuestion?: unknown;
  dailyReviewPlans?: unknown;
  lookupTrackingStartedAt?: unknown;
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
