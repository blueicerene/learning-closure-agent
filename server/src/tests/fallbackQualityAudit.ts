import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditFallbackDictionaryItem,
  CURATED_FALLBACK_TERMS,
  type FallbackQualityAudit
} from "../services/questionQuality.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const store = JSON.parse(await readFile(path.join(projectRoot, "output/legal-vocab.json"), "utf8"));
const curatedTerms = new Set(CURATED_FALLBACK_TERMS);
const fallbackItems = store.items.filter((item: { term?: string }) =>
  curatedTerms.has(item.term?.trim().toLowerCase() ?? "")
);
const audits: FallbackQualityAudit[] = fallbackItems.map(auditFallbackDictionaryItem);

assert.equal(fallbackItems.length, 13);
assert.equal(audits.filter((audit) => audit.decision === "repair").length, 4);
assert.equal(audits.filter((audit) => audit.decision === "confirmed").length, 9);
assert.equal(audits.filter((audit) => audit.decision === "pending-review").length, 0);
assert.deepEqual(
  audits.filter((audit) => audit.decision === "repair").map((audit) => audit.term).sort(),
  ["capacity", "judicial", "municipal", "venue"]
);
for (const audit of audits) {
  const sourceItem = fallbackItems.find(
    (item: { term?: string }) => item.term?.trim().toLowerCase() === audit.term.trim().toLowerCase()
  );
  assert.ok(sourceItem, `missing source item for ${audit.term}`);
  assert.equal(sourceItem.lemma, audit.term.trim().toLowerCase());
  assert.equal(sourceItem.partOfSpeech, audit.expectedPartOfSpeech);
  assert.equal(sourceItem.questionQuality?.status, "eligible");
  if (audit.decision === "repair") {
    assert.equal(sourceItem.definition, audit.repairedDefinition);
    assert.equal(sourceItem.chineseDefinition, audit.repairedChineseDefinition);
    assert.equal(sourceItem.lookupQuality, "legal-glossary");
  }
}

console.log(JSON.stringify({
  checkpoint: "fallback-quality-audit",
  total: audits.length,
  confirmed: audits.filter((audit) => audit.decision === "confirmed").length,
  repair: audits.filter((audit) => audit.decision === "repair").length,
  pendingReview: audits.filter((audit) => audit.decision === "pending-review").length,
  items: audits
}, null, 2));
