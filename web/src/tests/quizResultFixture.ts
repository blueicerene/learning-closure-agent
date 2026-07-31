import assert from "node:assert/strict";
import { quizResultFallbacks, quizResultFixture } from "../quizResult";

const correct = quizResultFixture("correct");
const wrong = quizResultFixture("wrong");
const missing = quizResultFixture("missing");

assert.equal(correct.term, "precedent");
assert.equal(correct.examples.length, 1);
assert.equal(wrong.legalContext?.includes("判例法"), true);

const completeDetails = quizResultFallbacks(correct);
assert.equal(completeDetails.hasLegalContext, true);
assert.equal(completeDetails.hasExamples, true);

const missingDetails = quizResultFallbacks(missing);
assert.equal(missingDetails.hasLegalContext, false);
assert.equal(missingDetails.legalContext, "暂无法律语境");
assert.equal(missingDetails.hasExamples, false);
assert.deepEqual(missingDetails.examples, []);

console.log("PASS quiz result fixture: correct, wrong, and missing-detail fallbacks");
