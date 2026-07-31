import assert from "node:assert/strict";
import {
  firstUnattemptedQuestionIndex,
  isFocusRoundComplete,
  recordFocusAttempt
} from "../focusRound.js";

const itemIds = ["a", "b", "c", "d"];
assert.equal(firstUnattemptedQuestionIndex(itemIds, ["a", "b"]), 2);
assert.equal(firstUnattemptedQuestionIndex(itemIds, ["a", "c"], 2), 3);
assert.equal(firstUnattemptedQuestionIndex(itemIds, itemIds), -1);

const initial = {
  total: 4,
  roundId: "round-1",
  attemptCount: 3,
  focusRoundItems: 4,
  attemptedItemIds: ["a", "b", "c"]
};
const completed = recordFocusAttempt(initial, "d");
assert.equal(completed.attemptCount, 4);
assert.equal(isFocusRoundComplete(completed), true);
assert.deepEqual(recordFocusAttempt(completed, "d"), completed);

console.log(JSON.stringify({
  checkpoint: "focus-round-web",
  resumesAtNextUnattempted: true,
  completionPersistsFromAttemptedIds: true,
  duplicateAttemptIgnored: true
}, null, 2));
