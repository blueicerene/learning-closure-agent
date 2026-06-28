import { readFileSync } from "node:fs";
import path from "node:path";
import type { LearningSession } from "../types.js";

type StandardSource = {
  sourceType: "built_in" | "official_search" | "user_uploaded" | "user_custom";
  sourceName: string;
  sourceUrl: string;
  sourceFile: string;
  retrievedAt: string;
  uploadedAt: string;
  authorityLevel: "official" | "institutional" | "user" | "internal";
  confirmedByUser: boolean;
};

type TopicGroup = {
  group: string;
  topics: string[];
};

type NextActionRule = {
  ifTopicIncludes: string[];
  suggest: string[];
};

export type LearningStandard = {
  standardId: string;
  standardName: string;
  goalTrack: string;
  subject: string;
  standardSources: StandardSource[];
  requiredTopicGroups: TopicGroup[];
  supportingTopics: string[];
  agentSuggestedTopics: string[];
  userAddedTopics: string[];
  recommendedSequence: string[];
  nextActionRules: NextActionRule[];
  confirmedByUser: boolean;
  lastReviewedAt: string;
  version: string;
  status: "active" | "draft" | "archived";
};

type LearningStandardsConfig = {
  standards: LearningStandard[];
};

export type LearningStandardContext = {
  used: boolean;
  matchedTopics: string[];
  coreTopics: string[];
  prioritizedNextActions: string[];
  promptContext: string;
};

const standards = loadLearningStandards();

export function getLearningStandardContext(session: LearningSession): LearningStandardContext {
  const standard = findLearningStandard(session.primaryGoalTrack, session.subject);

  if (!standard) {
    return {
      used: false,
      matchedTopics: [],
      coreTopics: [],
      prioritizedNextActions: [],
      promptContext: "No learning standard is available for this subject. Fall back to the captured content."
    };
  }

  const rawText = session.rawText.toLowerCase();
  const coreTopics = collectStandardTopics(standard);
  const matchedTopics = coreTopics.filter((topic) => topicMatchesRawText(topic, rawText));
  const prioritizedNextActions = standard.nextActionRules
    .filter((rule) => rule.ifTopicIncludes.some((topic) => topicMatchesRawText(topic, rawText)))
    .flatMap((rule) => rule.suggest);

  return {
    used: true,
    matchedTopics,
    coreTopics,
    prioritizedNextActions,
    promptContext: [
      `Learning standard available: ${standard.standardId} (${standard.standardName}).`,
      `Standard version: ${standard.version}. Confirmed by user: ${standard.confirmedByUser}.`,
      `Core topics: ${coreTopics.join(", ") || "None"}.`,
      `Recommended sequence: ${standard.recommendedSequence.join(" -> ") || "None"}.`,
      `Matched topics from captured content: ${matchedTopics.join(", ") || "None"}.`,
      `Prioritized next actions from learning standard: ${prioritizedNextActions.join("; ") || "None"}.`
    ].join("\n")
  };
}

export function findLearningStandard(goalTrack: string, subject: string): LearningStandard | undefined {
  return standards.find((item) => (
    item.status === "active"
    && item.goalTrack === goalTrack
    && item.subject === subject
  ));
}

export function getStandardTopics(standard: LearningStandard): string[] {
  return collectStandardTopics(standard);
}

function collectStandardTopics(standard: LearningStandard): string[] {
  return unique([
    ...standard.requiredTopicGroups.flatMap((group) => group.topics),
    ...standard.supportingTopics,
    ...standard.agentSuggestedTopics,
    ...standard.userAddedTopics
  ]);
}

function topicMatchesRawText(topic: string, rawText: string): boolean {
  const normalizedTopic = topic.toLowerCase();
  if (rawText.includes(normalizedTopic)) return true;
  if (topic === "Federal vs Provincial Powers" && rawText.includes("federal powers") && rawText.includes("provincial powers")) return true;
  if (topic === "Federal Paramountcy" && rawText.includes("paramountcy")) return true;
  if (topic === "Double Aspect Doctrine" && rawText.includes("double aspect")) return true;
  if (topic === "Amending Procedures" && rawText.includes("amending formula")) return true;
  return false;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function loadLearningStandards(): LearningStandard[] {
  const candidates = [
    path.resolve(process.cwd(), "../config/learning-standards.json"),
    path.resolve(process.cwd(), "config/learning-standards.json")
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as LearningStandardsConfig;
      return Array.isArray(parsed.standards) ? parsed.standards : [];
    } catch {
      // Try the next likely cwd.
    }
  }

  return [];
}
