import dotenv from "dotenv";
import { createSessionClosure } from "../services/llm.js";
import type { LearningSession, SessionClosure } from "../types.js";

dotenv.config({ path: "server/.env" });
dotenv.config();

process.env.USE_MOCK_LLM = "false";

const section92Input = `Section 92 of the Constitution Act, 1867 lists the areas of exclusive provincial legislative authority. It includes property and civil rights in the province, municipal institutions, local works and undertakings, and matters of a merely local or private nature in the province. Section 92 should be read together with Section 91 because Canadian federalism depends on the division of powers between Parliament and provincial legislatures.`;

const session: LearningSession = {
  id: "section-92-fixture",
  goal: "NCA / Canadian Constitutional Law",
  primaryGoalTrack: "LLM",
  subject: "Canadian Constitutional Law",
  sourceType: "manual",
  title: "Section 92 Study Fixture",
  capturedAt: new Date("2026-06-28T20:00:00Z").toISOString(),
  rawText: section92Input
};

const closure = await createSessionClosure(session);
assertUsefulSection92Closure(closure);

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

function assertUsefulSection92Closure(closure: SessionClosure): void {
  const failures: string[] = [];

  if (!closure.summary.trim() || closure.summary === "No substantial learning summary was generated.") {
    failures.push("summary is empty");
  }

  const normalizedSummary = closure.summary.toLowerCase();
  if (!normalizedSummary.includes("section 92")) {
    failures.push("summary does not center Section 92");
  }

  const summarySection92Index = normalizedSummary.indexOf("section 92");
  const summarySection91Index = normalizedSummary.indexOf("section 91");
  if (summarySection91Index >= 0 && summarySection91Index < summarySection92Index) {
    failures.push("summary mentions Section 91 before Section 92");
  }

  if (closure.keyTakeaways.length === 0) {
    failures.push("keyTakeaways is empty");
  }

  if (closure.knowledgeCards.length === 0) {
    failures.push("knowledgeCards is empty");
  }

  const cardTitles = closure.knowledgeCards.map((card) => card.title.toLowerCase()).join(" | ");
  if (!cardTitles.includes("section 92")) {
    failures.push("knowledgeCards does not include Section 92");
  }

  if (closure.nextActions.length === 0) {
    failures.push("nextActions is empty");
  }

  const firstAction = closure.nextActions[0]?.action.toLowerCase().trim() ?? "";
  if (firstAction.includes("read section 92") || firstAction.includes("阅读 section 92")) {
    failures.push("first next action still tells the learner to read Section 92");
  }

  const allActions = closure.nextActions.map((item) => `${item.action} ${item.reason}`.toLowerCase()).join(" | ");
  if (!["compare", "比较", "property and civil rights", "local", "private", "pogg", "paramountcy", "interjurisdictional"].some((term) => allActions.includes(term))) {
    failures.push("nextActions do not deepen Section 92 study");
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

  const subtopics = closure.classification.subtopics.map((topic) => topic.toLowerCase()).join(" | ");
  if (!subtopics.includes("section 92")) {
    failures.push("classification subtopics does not include Section 92");
  }

  if (closure.classification.knowledgeTypes.length === 0) {
    failures.push("knowledgeTypes is empty");
  }

  if (!closure.learningStandardUsed) {
    failures.push("learningStandardUsed is false");
  }

  const matchedTopics = closure.learningStandardMatchedTopics.map((topic) => topic.toLowerCase()).join(" | ");
  if (!matchedTopics.includes("section 92")) {
    failures.push("learningStandardMatchedTopics does not include Section 92");
  }

  if (failures.length > 0) {
    throw new Error(`Section 92 fixture failed: ${failures.join(", ")}`);
  }
}
