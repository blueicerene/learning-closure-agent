import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearningSession, SessionClosure } from "../types.js";

export async function saveLearningClosure(session: LearningSession, closure: SessionClosure): Promise<string> {
  const inboxPath = process.env.OBSIDIAN_INBOX_PATH;
  if (!inboxPath) {
    throw new Error("OBSIDIAN_INBOX_PATH is not configured");
  }

  await mkdir(inboxPath, { recursive: true });

  const capturedAt = new Date(session.capturedAt);
  const fileDate = Number.isNaN(capturedAt.valueOf()) ? new Date() : capturedAt;
  const fileName = `${formatFileDate(fileDate)}-learning-closure.md`;
  const markdownPath = path.join(inboxPath, fileName);

  await writeFile(markdownPath, renderMarkdown(session, closure, fileDate), "utf8");
  return markdownPath;
}

export function renderMarkdown(session: LearningSession, closure: SessionClosure, date = new Date()): string {
  return `${renderFrontmatter(session, closure, date)}

# Learning Closure - ${session.title}

Date: ${formatDisplayDate(date)}
Goal: ${formatGoal(session)}
Source Type: ${session.sourceType}
Source: ${session.url || "Manual input"}

---

## Session Summary

${closure.summary}

---

## Key Takeaways

${numbered(closure.keyTakeaways)}

---

## Knowledge Cards

${closure.knowledgeCards.length ? closure.knowledgeCards.map(renderCard).join("\n\n---\n\n") : "No knowledge cards generated."}

---

## Unresolved Questions

${numbered(closure.unresolvedQuestions)}

---

## Next Actions

${closure.nextActions.length ? closure.nextActions.map((item, index) => `${index + 1}. **${item.action}**  \n   Reason: ${item.reason}`).join("\n\n") : "No next actions generated."}

---

## Suggested Tags

${closure.suggestedTags.map(formatTag).filter(Boolean).join(" ") || "#learning"}
`;
}

function renderFrontmatter(session: LearningSession, closure: SessionClosure, date: Date): string {
  const classification = closure.classification;

  return `---
title: "${yamlEscape(`Learning Closure - ${session.title}`)}"
date: "${formatDisplayDate(date)}"
primary_goal_track: "${yamlEscape(classification.primaryGoalTrack)}"
secondary_goal_tracks:
${yamlList(classification.secondaryGoalTracks)}
subject: "${yamlEscape(classification.subject)}"
related_subjects:
${yamlList(classification.relatedSubjects)}
topic: "${yamlEscape(classification.topic)}"
subtopics:
${yamlList(classification.subtopics)}
jurisdiction: "${yamlEscape(classification.jurisdiction || "")}"
knowledge_types:
${yamlList(classification.knowledgeTypes)}
learning_standard_used: ${closure.learningStandardUsed}
learning_standard_matched_topics:
${yamlList(closure.learningStandardMatchedTopics)}
source_type: "${yamlEscape(session.sourceType)}"
source_url: "${yamlEscape(session.url || "")}"
review_status: "${yamlEscape(classification.reviewStatus)}"
classification_confidence: ${classification.classificationConfidence}
classification_reason: "${yamlEscape(classification.classificationReason)}"
status: "inbox"
---`;
}

function renderCard(card: SessionClosure["knowledgeCards"][number]): string {
  return `### ${card.title}

Summary:
${card.summary}

Tags: ${card.tags.map(formatTag).filter(Boolean).join(" ") || "#learning"}`;
}

function numbered(items: string[]): string {
  return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "None captured.";
}

function formatFileDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}-${hh}${min}`;
}

function formatDisplayDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTag(tag: string): string {
  const normalized = tag.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-");
  return normalized ? `#${normalized}` : "";
}

function formatGoal(session: LearningSession): string {
  if (session.primaryGoalTrack && session.subject) {
    return `${session.primaryGoalTrack} / ${session.subject}`;
  }

  return "Not specified";
}

function yamlList(items: string[]): string {
  return items.length ? items.map((item) => `  - "${yamlEscape(item)}"`).join("\n") : "  []";
}

function yamlEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
