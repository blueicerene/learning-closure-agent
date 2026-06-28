import dotenv from "dotenv";
import { createSessionClosure } from "../services/llm.js";
import type { LearningSession, SessionClosure } from "../types.js";

dotenv.config({ path: "server/.env" });
dotenv.config();

process.env.USE_MOCK_LLM = "false";

const section91Input = `Section 91 of the Constitution Act, 1867 gives the federal Parliament legislative authority over matters listed in that section. It is central to Canadian constitutional law because it helps define the division of powers between the federal Parliament and provincial legislatures. Section 91 should be studied together with Section 92, which lists provincial powers. The relationship between these two sections is important for understanding Canadian federalism, including doctrines such as POGG, paramountcy, and double aspect.`;

const session: LearningSession = {
  id: "section-91-fixture",
  goal: "NCA / Canadian Constitutional Law",
  primaryGoalTrack: "LLM",
  subject: "Canadian Constitutional Law",
  sourceType: "manual",
  title: "Section 91 Study Fixture",
  capturedAt: new Date("2026-06-27T20:00:00Z").toISOString(),
  rawText: section91Input
};

const closure = await createSessionClosure(session);
assertUsefulSection91Closure(closure);

console.log(JSON.stringify({
  ok: true,
  summary: closure.summary,
  keyTakeaways: closure.keyTakeaways,
  knowledgeCards: closure.knowledgeCards,
  unresolvedQuestions: closure.unresolvedQuestions,
  nextActions: closure.nextActions,
  suggestedTags: closure.suggestedTags,
  learningStandardUsed: closure.learningStandardUsed,
  learningStandardMatchedTopics: closure.learningStandardMatchedTopics,
  classification: closure.classification
}, null, 2));

function assertUsefulSection91Closure(closure: SessionClosure): void {
  const failures: string[] = [];

  if (!closure.summary.trim() || closure.summary === "No substantial learning summary was generated.") {
    failures.push("summary is empty");
  }

  if (closure.keyTakeaways.length === 0) {
    failures.push("keyTakeaways is empty");
  }

  if (closure.knowledgeCards.length === 0) {
    failures.push("knowledgeCards is empty");
  }

  const cardTitles = closure.knowledgeCards.map((card) => card.title.toLowerCase()).join(" | ");
  if (!cardTitles.includes("section 91")) {
    failures.push("knowledgeCards does not include Section 91");
  }

  if (!cardTitles.includes("division of powers")) {
    failures.push("knowledgeCards does not include Division of Powers");
  }

  if (closure.nextActions.length === 0) {
    failures.push("nextActions is empty");
  }

  if (closure.classification.primaryGoalTrack !== "LLM") {
    failures.push("primaryGoalTrack was not preserved");
  }

  if (closure.classification.subject !== "Canadian Constitutional Law") {
    failures.push("subject was not preserved");
  }

  if (!closure.classification.topic.trim()) {
    failures.push("classification topic is empty");
  }

  if (closure.classification.knowledgeTypes.length === 0) {
    failures.push("knowledgeTypes is empty");
  }

  if (!closure.learningStandardUsed) {
    failures.push("learningStandardUsed is false");
  }

  if (closure.learningStandardMatchedTopics.length === 0) {
    failures.push("learningStandardMatchedTopics is empty");
  }

  if (failures.length > 0) {
    throw new Error(`Section 91 fixture failed: ${failures.join(", ")}`);
  }
}
