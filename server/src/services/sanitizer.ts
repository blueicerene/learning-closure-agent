import type { Classification, GoalTrack, KnowledgeCard, LearningSession, NextAction, ReviewStatus, SessionClosure, SourceType } from "../types.js";
import { filterGoalTracks, filterKnowledgeTypes, isGoalTrack, validSubjectForTrack } from "./taxonomy.js";

const sourceTypes = new Set<SourceType>(["chatgpt", "notebooklm", "youtube", "pdf", "webpage", "manual"]);
const reviewStatuses = new Set<ReviewStatus>(["needs_review", "reviewed"]);

export function validateLearningSession(input: unknown): LearningSession {
  const value = asRecord(input, "Invalid learning session payload");
  const sourceType = String(value.sourceType ?? "");
  const maxChars = Number(process.env.MAX_CAPTURE_CHARS ?? 80_000);

  if (!sourceTypes.has(sourceType as SourceType)) {
    throw new Error("Invalid sourceType");
  }

  const primaryGoalTrack = optionalString(value.primaryGoalTrack) || "LLM";
  if (!isGoalTrack(primaryGoalTrack)) {
    throw new Error("Invalid primaryGoalTrack");
  }

  const subject = optionalString(value.subject) || "Canadian Constitutional Law";
  if (!validSubjectForTrack(primaryGoalTrack, subject)) {
    throw new Error("subject must belong to primaryGoalTrack");
  }

  const session: LearningSession = {
    id: optionalString(value.id) || crypto.randomUUID(),
    goal: optionalString(value.goal) || undefined,
    primaryGoalTrack,
    subject,
    sourceType: sourceType as SourceType,
    title: requiredString(value.title, "title"),
    url: optionalString(value.url) || undefined,
    capturedAt: requiredString(value.capturedAt, "capturedAt"),
    rawText: requiredString(value.rawText, "rawText").slice(0, Number.isFinite(maxChars) ? maxChars : 80_000)
  };

  if (session.rawText.length < 10) {
    throw new Error("Captured text is too short to close a learning session");
  }

  return session;
}

export function validateSessionClosure(input: unknown, sessionId?: string): SessionClosure {
  const value = asRecord(input, "Invalid session closure payload");

  return {
    sessionId: optionalString(value.sessionId) || sessionId || crypto.randomUUID(),
    summary: optionalString(value.summary) || "No substantial learning summary was generated.",
    keyTakeaways: stringArray(value.keyTakeaways).slice(0, 8),
    knowledgeCards: cardArray(value.knowledgeCards).slice(0, 8),
    unresolvedQuestions: stringArray(value.unresolvedQuestions).slice(0, 8),
    nextActions: nextActionArray(value.nextActions).slice(0, 5),
    suggestedTags: stringArray(value.suggestedTags).slice(0, 12),
    classification: validateClassification(value.classification),
    learningStandardUsed: Boolean(value.learningStandardUsed ?? value.learning_standard_used ?? false),
    learningStandardMatchedTopics: stringArray(value.learningStandardMatchedTopics ?? value.learning_standard_matched_topics).slice(0, 12)
  };
}

export function validateLlmSessionClosure(input: unknown, session: LearningSession): SessionClosure {
  const value = asRecord(input, "LLM JSON must be an object");
  const closure = validateSessionClosure(value, session.id);

  if (!hasString(value.summary)) {
    throw new Error("LLM JSON is missing required string field: summary");
  }

  requireArray(value.keyTakeaways, "keyTakeaways");
  requireArray(value.knowledgeCards, "knowledgeCards");
  requireArray(value.unresolvedQuestions, "unresolvedQuestions");
  requireArray(value.nextActions, "nextActions");
  requireArray(value.suggestedTags, "suggestedTags");
  requireArray(value.learningStandardMatchedTopics, "learningStandardMatchedTopics");
  if (!value.classification || typeof value.classification !== "object") {
    throw new Error("LLM JSON is missing required object field: classification");
  }

  closure.classification = validateClassification(value.classification, session);

  return closure;
}

export function validateSavePayload(input: unknown): { session: LearningSession; closure: SessionClosure } {
  const value = asRecord(input, "Invalid save payload");
  const session = validateLearningSession(value.session);
  const closure = validateSessionClosure(value.closure, session.id);

  if (closure.sessionId !== session.id) {
    throw new Error("closure.sessionId must match session.id");
  }

  return { session, closure };
}

export function validateClassification(input: unknown, session?: Pick<LearningSession, "primaryGoalTrack" | "subject">): Classification {
  const value = asRecordOrEmpty(input);
  const fallbackTrack = session?.primaryGoalTrack ?? "LLM";
  const primaryGoalTrack = session?.primaryGoalTrack ?? normalizeGoalTrack(value.primaryGoalTrack, fallbackTrack);
  const subject = session?.subject ?? (optionalString(value.subject) || "Canadian Constitutional Law");
  const confidence = clamp(Number(value.classificationConfidence ?? 0.4), 0, 1);
  const topic = optionalString(value.topic) || "Unclassified";

  return {
    primaryGoalTrack,
    secondaryGoalTracks: filterGoalTracks(stringArray(value.secondaryGoalTracks)).filter((track) => track !== primaryGoalTrack),
    subject,
    relatedSubjects: stringArray(value.relatedSubjects).slice(0, 8),
    topic,
    subtopics: topic === "Unclassified" ? [] : stringArray(value.subtopics).slice(0, 10),
    jurisdiction: optionalString(value.jurisdiction) || undefined,
    knowledgeTypes: filterKnowledgeTypes(stringArray(value.knowledgeTypes)).slice(0, 10),
    classificationConfidence: confidence,
    classificationReason: optionalString(value.classificationReason) || "分类依据不足，需要用户确认。",
    reviewStatus: normalizeReviewStatus(value.reviewStatus, confidence)
  };
}

function cardArray(input: unknown): KnowledgeCard[] {
  if (!Array.isArray(input)) return [];

  return input.map((item) => {
    const value = asRecordOrEmpty(item);
    return {
      title: optionalString(value.title) || "Untitled card",
      summary: optionalString(value.summary) || "No summary provided.",
      tags: stringArray(value.tags).slice(0, 8)
    };
  });
}

function nextActionArray(input: unknown): NextAction[] {
  if (!Array.isArray(input)) return [];

  return input.map((item) => {
    const value = asRecordOrEmpty(item);
    return {
      action: optionalString(value.action) || "Review this session",
      reason: optionalString(value.reason) || "Keep continuity with the previous learning session."
    };
  });
}

function stringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).map((value) => value.trim()).filter(Boolean);
}

function normalizeGoalTrack(input: unknown, fallback: GoalTrack): GoalTrack {
  const value = optionalString(input);
  return isGoalTrack(value) ? value : fallback;
}

function normalizeReviewStatus(input: unknown, confidence: number): ReviewStatus {
  const value = optionalString(input);
  if (reviewStatuses.has(value as ReviewStatus)) {
    return value as ReviewStatus;
  }

  return confidence < 0.8 ? "needs_review" : "reviewed";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function requireArray(input: unknown, field: string): void {
  if (!Array.isArray(input)) {
    throw new Error(`LLM JSON is missing required array field: ${field}`);
  }
}

function hasString(input: unknown): boolean {
  return typeof input === "string" && input.trim().length > 0;
}

function asRecord(input: unknown, errorMessage: string): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    throw new Error(errorMessage);
  }

  return input as Record<string, unknown>;
}

function asRecordOrEmpty(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function requiredString(input: unknown, field: string): string {
  const value = optionalString(input);
  if (!value) {
    throw new Error(`${field} is required`);
  }

  return value;
}

function optionalString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
