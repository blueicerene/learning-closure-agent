import assert from "node:assert/strict";
import { quizProgress } from "../quizPlanProgress.js";

assert.deepEqual(
  quizProgress("due", 22, 170, {
    dailyPlanCompleted: 4,
    dailyPlanTotal: 14
  }),
  { completed: 4, total: 14 }
);

assert.deepEqual(
  quizProgress("all", 22, 170, {
    dailyPlanCompleted: 4,
    dailyPlanTotal: 14
  }),
  { completed: 22, total: 170 }
);

console.log("PASS quiz plan progress fixture: due mode uses the frozen daily plan");
