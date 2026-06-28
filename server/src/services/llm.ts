import type { LearningSession, SessionClosure } from "../types.js";
import { getLearningLog } from "./learningLog.js";
import { getLearningStandardContext, type LearningStandardContext } from "./learningStandards.js";
import { validateLlmSessionClosure } from "./sanitizer.js";
import { taxonomy } from "./taxonomy.js";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const systemPrompt = `You are a Learning Closure Agent.

Your job is to transform a captured learning session into a useful learning closure.

Be practical and helpful. Do not be overly conservative.
Do not return an empty closure just because the input is short.
If the input contains a clear study concept, legal rule, statute, doctrine, definition, comparison, exam topic, or explanation, it is meaningful learning content and must receive a substantive closure.
Only return a minimal closure when the input is clearly not learning content, such as navigation text, UI boilerplate, random fragments, or unrelated noise.

Return valid JSON only. Do not return Markdown.

Language:
- Write summary, keyTakeaways, unresolvedQuestions, and nextActions primarily in Chinese.
- Keep legal terms such as Section 91, Section 92, POGG, paramountcy, double aspect, federal powers, and provincial powers in English when useful.
- classificationReason must be short Chinese.

Classification rules:
- primaryGoalTrack and subject are selected by the user. Copy them exactly. Never override them.
- secondaryGoalTracks and relatedSubjects are inferred by you and may be empty arrays.
- topic and subtopics are inferred from the content.
- jurisdiction is inferred from the content when clear.
- knowledgeTypes must use only the allowed list provided in the user prompt.
- classificationConfidence must be a number from 0 to 1.
- If classification is unclear, use topic "Unclassified", subtopics [], classificationConfidence below 0.6, and reviewStatus "needs_review".

For meaningful legal learning text, the closure must include:
- a concrete 2-4 sentence summary
- 2-4 key takeaways
- at least 1 knowledge card
- at least 1 unresolved question
- at least 1 next action
- classification metadata
- learning standard usage metadata

Content focus rules:
- The captured raw text is authoritative. Use learning standards, examples, and prior learning log only as context.
- Do not make Section 91 the main subject unless the captured text itself makes Section 91 the main subject.
- If the captured text is mainly about Section 92, the summary and knowledge cards must center Section 92; Section 91 may appear only as comparison or background.
- If the captured text is mainly about Section 91, the summary and knowledge cards should center Section 91; Section 92 may appear as comparison or next reading.
- If the captured text discusses Section 91 and Section 92 evenly, treat the closure as a comparison within division of powers.
- learningStandardMatchedTopics may include broader standard topics, but the body of the closure must follow the captured content emphasis.
- Use classification topic such as "Division of Powers" when appropriate.
- Use knowledgeTypes such as "statute", "concept", "doctrine", and "comparison" when appropriate.

Do not invent sources.
Do not claim certainty if the input is unclear.
Use the learning standard and learning log only to improve unresolvedQuestions and nextActions.
Do not generate completion percentages, pass probabilities, mastery scores, complex study plans, or schedules.

Return exactly this JSON shape using camelCase keys:
{
  "sessionId": "string",
  "summary": "string",
  "keyTakeaways": ["string"],
  "knowledgeCards": [{ "title": "string", "summary": "string", "tags": ["string"] }],
  "unresolvedQuestions": ["string"],
  "nextActions": [{ "action": "string", "reason": "string" }],
  "suggestedTags": ["string"],
  "learningStandardUsed": true,
  "learningStandardMatchedTopics": ["Relevant standard topic"],
  "classification": {
    "primaryGoalTrack": "LLM",
    "secondaryGoalTracks": ["Certificate"],
    "subject": "Canadian Constitutional Law",
    "relatedSubjects": ["NCA"],
    "topic": "Division of Powers",
    "subtopics": ["Relevant subtopic"],
    "jurisdiction": "Canada",
    "knowledgeTypes": ["statute", "concept", "doctrine", "comparison"],
    "classificationConfidence": 0.88,
    "classificationReason": "本次内容讨论明确的法律学习主题，因此归入用户选择的课程方向。",
    "reviewStatus": "needs_review"
  }
}`;

export async function createSessionClosure(session: LearningSession): Promise<SessionClosure> {
  if (shouldUseMock()) {
    return createMockClosure(session);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Set USE_MOCK_LLM=true for mock flow.");
  }

  const standardContext = getLearningStandardContext(session);
  const learningLog = await getLearningLog();
  const learningLogSummary = summarizeLearningLog(learningLog);
  const firstClosure = await requestLlmClosure(session, apiKey, false, standardContext, learningLogSummary);
  if (!isMeaningfulStudyText(session.rawText) || isUsefulClosure(firstClosure)) {
    return firstClosure;
  }

  console.warn("[Learning Closure Agent] LLM returned a sparse closure for meaningful study text. Retrying with stricter instructions.");
  logParsedClosure(firstClosure, "Sparse parsed closure before retry");

  const retryClosure = await requestLlmClosure(session, apiKey, true, standardContext, learningLogSummary);
  if (isUsefulClosure(retryClosure)) {
    return retryClosure;
  }

  logParsedClosure(retryClosure, "Sparse parsed closure after retry");
  throw new Error("LLM returned an empty or sparse closure for meaningful study text after retry.");
}

async function requestLlmClosure(
  session: LearningSession,
  apiKey: string,
  retrySparse: boolean,
  standardContext: LearningStandardContext,
  learningLogSummary: string
): Promise<SessionClosure> {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: retrySparse ? 0.1 : 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(session, retrySparse, standardContext, learningLogSummary) }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM closure failed: ${response.status} ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned an empty response");
  }

  logRawLlmResponse(content);

  try {
    const parsed = parseLlmJson(content);
    const normalized = normalizeClosureShape(unwrapClosure(parsed));
    const closure = validateLlmSessionClosure(normalized, session);
    logParsedClosure(closure, "Parsed closure");
    return closure;
  } catch (error) {
    logParseError(error);
    const detail = error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`LLM closure parse error: ${detail}. Markdown was not saved and learning-log.json was not updated.`);
  }
}

function shouldUseMock(): boolean {
  const flag = process.env.USE_MOCK_LLM;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return !process.env.OPENAI_API_KEY;
}

function createMockClosure(session: LearningSession): SessionClosure {
  const topic = session.goal || session.title || "Current learning session";
  const standardContext = getLearningStandardContext(session);

  return {
    sessionId: session.id,
    summary: `Mock closure for "${topic}". The captured session appears to contain material worth preserving for future review.`,
    keyTakeaways: [
      "The session contains reusable learning context that should be saved before it is lost.",
      "The most valuable output is not only a summary, but also a small next step for continuity.",
      "Manual, selected-text, and page capture modes make the workflow resilient when page layouts change."
    ],
    knowledgeCards: [
      {
        title: "Learning closure",
        summary: "A learning closure turns a study session into a summary, durable knowledge, unresolved questions, and next actions.",
        tags: ["learning-closure", "workflow"]
      },
      {
        title: "Next action",
        summary: "A next action gives the learner a concrete place to restart instead of re-orienting from scratch.",
        tags: ["next-action", "accountability"]
      }
    ],
    unresolvedQuestions: [
      "Which part of this session should be tested with a real learning page first?",
      "Did the generated next action make it easier to continue studying?"
    ],
    nextActions: [
      {
        action: `Continue reviewing ${topic}`,
        reason: "This keeps the next session anchored to the captured material."
      }
    ],
    suggestedTags: ["learning", session.sourceType, "closure"],
    learningStandardUsed: standardContext.used,
    learningStandardMatchedTopics: standardContext.matchedTopics,
    classification: {
      primaryGoalTrack: session.primaryGoalTrack,
      secondaryGoalTracks: [],
      subject: session.subject,
      relatedSubjects: [],
      topic: "Learning Closure Workflow",
      subtopics: ["Session capture", "Next action"],
      jurisdiction: undefined,
      knowledgeTypes: ["workflow_note", "concept"],
      classificationConfidence: 0.82,
      classificationReason: "Mock 模式下根据用户选择保留主分类，并将内容归为学习收尾工作流。",
      reviewStatus: "reviewed"
    }
  };
}

function buildUserPrompt(
  session: LearningSession,
  retrySparse: boolean,
  standardContext: LearningStandardContext,
  learningLogSummary: string
): string {
  const contentFocusGuidance = buildConstitutionalSectionGuidance(session.rawText);

  return `Goal:
${session.goal || ""}

User-selected Primary Goal Track:
${session.primaryGoalTrack}

User-selected Subject:
${session.subject}

Source Type:
${session.sourceType}

Title:
${session.title}

URL:
${session.url || ""}

Captured At:
${session.capturedAt}

Raw Text:
${session.rawText}

Learning Standard Context:
${standardContext.promptContext}

Learning Log Context:
${learningLogSummary}

Return a SessionClosure JSON object.

Important:
- classification.primaryGoalTrack must be exactly "${session.primaryGoalTrack}".
- classification.subject must be exactly "${session.subject}".
- Do not overwrite the user-selected primaryGoalTrack or subject.
- Allowed goal tracks: ${taxonomy.goalTracks.join(", ")}.
- Allowed knowledgeTypes: ${taxonomy.knowledgeTypes.join(", ")}.
- Use valid JSON with camelCase keys only.
- learningStandardUsed must be ${standardContext.used}.
- learningStandardMatchedTopics must be exactly these matched topics unless the content strongly supports another listed core topic: ${JSON.stringify(standardContext.matchedTopics)}.
- summary, keyTakeaways, unresolvedQuestions, and nextActions should be in Chinese where natural.
- classificationReason must be Chinese.
- Treat meaningful legal study text as worth closing.
- Do not return empty arrays for meaningful legal text.
- The next action should tell the learner exactly what to read, compare, ask, or review next.
- When learning standard prioritized next actions exist, use them to shape nextActions only if they fit the captured content focus.
- Use learning log only for continuity with the last session, not for scoring or progress tracking.
- Use sessionId exactly as: ${session.id}
${contentFocusGuidance}
${retrySparse ? "\nRetry instruction: the previous response was too empty. The raw text is meaningful study material. Produce a substantive closure now and follow the captured content focus guidance above." : ""}`;
}

function parseLlmJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (firstError) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw firstError;
    }

    return JSON.parse(jsonMatch[0]);
  }
}

function unwrapClosure(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const record = parsed as Record<string, unknown>;
  return record.closure
    ?? record.sessionClosure
    ?? record.SessionClosure
    ?? record.session_closure
    ?? record.learningClosure
    ?? record.learning_closure
    ?? parsed;
}

function normalizeClosureShape(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const value = input as Record<string, unknown>;
  const classificationInput = getObject(value.classification) ?? getObject(value.classification_metadata) ?? {};

  return {
    sessionId: pick(value, "sessionId", "session_id") ?? undefined,
    summary: pick(value, "summary", "sessionSummary", "session_summary") ?? undefined,
    keyTakeaways: pick(value, "keyTakeaways", "key_takeaways", "takeaways") ?? [],
    knowledgeCards: normalizeKnowledgeCards(pick(value, "knowledgeCards", "knowledge_cards", "cards")),
    unresolvedQuestions: pick(value, "unresolvedQuestions", "unresolved_questions", "questions") ?? [],
    nextActions: normalizeNextActions(pick(value, "nextActions", "next_actions", "actions")),
    suggestedTags: pick(value, "suggestedTags", "suggested_tags", "tags") ?? [],
    learningStandardUsed: pick(value, "learningStandardUsed", "learning_standard_used") ?? false,
    learningStandardMatchedTopics: pick(value, "learningStandardMatchedTopics", "learning_standard_matched_topics") ?? [],
    classification: {
      primaryGoalTrack: pick(classificationInput, "primaryGoalTrack", "primary_goal_track") ?? undefined,
      secondaryGoalTracks: pick(classificationInput, "secondaryGoalTracks", "secondary_goal_tracks") ?? [],
      subject: pick(classificationInput, "subject") ?? undefined,
      relatedSubjects: pick(classificationInput, "relatedSubjects", "related_subjects") ?? [],
      topic: pick(classificationInput, "topic") ?? undefined,
      subtopics: pick(classificationInput, "subtopics", "subTopics", "sub_topics") ?? [],
      jurisdiction: pick(classificationInput, "jurisdiction") ?? undefined,
      knowledgeTypes: pick(classificationInput, "knowledgeTypes", "knowledge_types") ?? [],
      classificationConfidence: pick(classificationInput, "classificationConfidence", "classification_confidence", "confidence") ?? undefined,
      classificationReason: pick(classificationInput, "classificationReason", "classification_reason", "reason") ?? undefined,
      reviewStatus: pick(classificationInput, "reviewStatus", "review_status") ?? undefined
    }
  };
}

function normalizeKnowledgeCards(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  return input.map((card) => {
    if (!card || typeof card !== "object") return card;
    const value = card as Record<string, unknown>;
    return {
      title: pick(value, "title", "name") ?? undefined,
      summary: pick(value, "summary", "description") ?? undefined,
      tags: pick(value, "tags") ?? []
    };
  });
}

function normalizeNextActions(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];
  return input.map((action) => {
    if (typeof action === "string") {
      return { action, reason: "继续推进本次学习主题。" };
    }

    if (!action || typeof action !== "object") return action;
    const value = action as Record<string, unknown>;
    return {
      action: pick(value, "action", "title", "task") ?? undefined,
      reason: pick(value, "reason", "why") ?? undefined
    };
  });
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function getObject(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

function summarizeLearningLog(log: Awaited<ReturnType<typeof getLearningLog>>): string {
  if (!log.lastSessionId) {
    return "No previous learning session is available.";
  }

  const actions = log.lastNextActions.map((item) => `${item.action}: ${item.reason}`).join("; ");
  return [
    `Last session title: ${log.lastTitle || "Unknown"}.`,
    `Last captured at: ${log.lastCapturedAt || "Unknown"}.`,
    `Last next actions: ${actions || "None"}.`
  ].join("\n");
}

function debugEnabled(): boolean {
  return (process.env.DEBUG_LLM === "true" || process.env.LOG_LLM_RESPONSE === "true") && !shouldUseMock();
}

function logRawLlmResponse(content: string): void {
  if (!debugEnabled()) return;
  console.log("[Learning Closure Agent] Raw LLM response:");
  console.log(content);
}

function logParsedClosure(closure: SessionClosure, label: string): void {
  if (!debugEnabled()) return;
  console.log(`[Learning Closure Agent] ${label}:`);
  console.log(JSON.stringify(closure, null, 2));
}

function logParseError(error: unknown): void {
  if (!debugEnabled()) return;
  console.error("[Learning Closure Agent] LLM parse error:");
  console.error(error instanceof Error ? error.message : error);
}

function isUsefulClosure(closure: SessionClosure): boolean {
  return (
    closure.summary.trim().length > 30 &&
    closure.summary !== "No substantial learning summary was generated." &&
    closure.keyTakeaways.length > 0 &&
    closure.knowledgeCards.length > 0 &&
    closure.nextActions.length > 0 &&
    closure.classification.topic.trim().length > 0 &&
    closure.classification.knowledgeTypes.length > 0
  );
}

function isMeaningfulStudyText(rawText: string): boolean {
  const text = rawText.toLowerCase();
  if (rawText.trim().length >= 120) return true;

  return [
    "section 91",
    "section 92",
    "constitution act",
    "federal parliament",
    "provincial",
    "division of powers",
    "pogg",
    "paramountcy",
    "double aspect",
    "federalism"
  ].some((term) => text.includes(term));
}

type ConstitutionalSectionFocus = "section91" | "section92" | "comparison" | "none";

function buildConstitutionalSectionGuidance(rawText: string): string {
  const focus = getConstitutionalSectionFocus(rawText);

  if (focus === "section92") {
    return `
Captured content focus: Section 92.
Do not return an empty or minimal closure.
Required for this input:
- summary must explain Section 92 as the exclusive provincial legislative powers provision and connect it to Canadian federalism / division of powers
- keyTakeaways must contain 2-4 items centered on Section 92
- knowledgeCards must include "Section 92" and may include "Division of Powers"
- unresolvedQuestions should include how Section 92 should be understood with Section 91 and how provincial powers interact with doctrines such as POGG, paramountcy, or interjurisdictional immunity
- nextActions must not make "Read Section 92" the first action, because Section 92 is already the captured focus
- nextActions should prefer comparing Section 91 and Section 92, studying property and civil rights under Section 92(13), studying local or private matters under Section 92(16), and then studying POGG / paramountcy / interjurisdictional immunity
- classification.topic should be "Division of Powers" or a close equivalent
- classification.subtopics must include "Section 92"
- classification.knowledgeTypes should include relevant values from the allowed list, such as statute, concept, doctrine, comparison
- learningStandardUsed must be true
- learningStandardMatchedTopics must include "Section 92" when applicable
`;
  }

  if (focus === "section91") {
    return `
Captured content focus: Section 91.
Do not return an empty or minimal closure.
Required for this input:
- summary must explain Section 91 as the federal legislative powers provision and connect it to Canadian federalism / division of powers
- keyTakeaways must contain 2-4 items centered on Section 91
- knowledgeCards must include "Section 91" and "Division of Powers"
- unresolvedQuestions must include how Section 91 should be understood with Section 92 and how POGG relates to Section 91
- nextActions should include reading Section 92, comparing federal powers and provincial powers, and studying POGG / paramountcy / double aspect
- classification.topic should be "Division of Powers" or a close equivalent
- classification.knowledgeTypes should include relevant values from the allowed list, such as statute, concept, doctrine, comparison
- learningStandardUsed must be true
- learningStandardMatchedTopics must include matched learning standard topics such as Section 91 and Division of Powers when applicable
`;
  }

  if (focus === "comparison") {
    return `
Captured content focus: comparison between Section 91 and Section 92.
Do not return an empty or minimal closure.
Required for this input:
- summary must treat Section 91 and Section 92 as a comparison within Canadian division of powers
- knowledgeCards should include the section or concept most emphasized by the raw text, and may include "Division of Powers"
- nextActions should deepen the comparison instead of repeating a section already studied as the first action
- classification.topic should be "Division of Powers" or a close equivalent
`;
  }

  return "";
}

function getConstitutionalSectionFocus(rawText: string): ConstitutionalSectionFocus {
  const text = rawText.toLowerCase();
  const section91Count = countMatches(text, /\bsection\s*91\b/g);
  const section92Count = countMatches(text, /\bsection\s*92\b/g);

  if (section91Count === 0 && section92Count === 0) return "none";
  if (section92Count > 0 && section91Count === 0) return "section92";
  if (section91Count > 0 && section92Count === 0) return "section91";
  if (section92Count > section91Count) return "section92";
  if (section91Count > section92Count) return "section91";

  const firstSection91 = text.search(/\bsection\s*91\b/);
  const firstSection92 = text.search(/\bsection\s*92\b/);
  if (firstSection92 >= 0 && (firstSection91 < 0 || firstSection92 < firstSection91)) return "section92";
  if (firstSection91 >= 0 && (firstSection92 < 0 || firstSection91 < firstSection92)) return "section91";

  return "comparison";
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
