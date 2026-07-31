import assert from "node:assert/strict";
import { appendReinforcementQuestion } from "../quizReinforcement";

const questions = [
  { itemId: "a", attemptKind: "plan" as const },
  { itemId: "b", attemptKind: "plan" as const },
  { itemId: "c", attemptKind: "plan" as const }
];

const scheduled = appendReinforcementQuestion(questions, questions[0], 0);
assert.equal(scheduled.length, 4);
assert.deepEqual(scheduled[3], { itemId: "a", attemptKind: "reinforcement" });

const deduplicated = appendReinforcementQuestion(scheduled, questions[0], 0);
assert.deepEqual(deduplicated, scheduled);

const fullPlan = Array.from({ length: 20 }, (_, index) => ({
  itemId: `item-${index}`,
  attemptKind: "plan" as const
}));
assert.strictEqual(
  appendReinforcementQuestion(fullPlan, fullPlan[0], 0),
  fullPlan
);

console.log(JSON.stringify({
  checkpoint: "quiz-reinforcement",
  appendedLaterInSession: true,
  duplicatePrevented: true,
  twentyQuestionCapacityPreserved: true
}));
