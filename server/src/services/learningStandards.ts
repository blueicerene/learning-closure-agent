import { readFileSync } from "node:fs";
import path from "node:path";
import type { LearningSession } from "../types.js";

type NextActionRule = {
  whenContentIncludes: string[];
  prioritize: string[];
};

type SubjectLearningStandard = {
  coreTopics: string[];
  nextActionRules: NextActionRule[];
};

type LearningStandards = Record<string, Record<string, SubjectLearningStandard>>;

export type LearningStandardContext = {
  used: boolean;
  matchedTopics: string[];
  coreTopics: string[];
  prioritizedNextActions: string[];
  promptContext: string;
};

const standards = loadLearningStandards();

export function getLearningStandardContext(session: LearningSession): LearningStandardContext {
  const standard = standards[session.primaryGoalTrack]?.[session.subject];
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
  const matchedTopics = standard.coreTopics.filter((topic) => {
    const topicText = topic.toLowerCase();
    if (rawText.includes(topicText)) return true;
    if (topic === "Division of Powers" && rawText.includes("division of powers")) return true;
    if (topic === "Federal Paramountcy" && rawText.includes("paramountcy")) return true;
    if (topic === "Double Aspect Doctrine" && rawText.includes("double aspect")) return true;
    return false;
  });

  const prioritizedNextActions = standard.nextActionRules
    .filter((rule) => rule.whenContentIncludes.some((needle) => rawText.includes(needle.toLowerCase())))
    .flatMap((rule) => rule.prioritize);

  return {
    used: true,
    matchedTopics,
    coreTopics: standard.coreTopics,
    prioritizedNextActions,
    promptContext: [
      `Learning standard available for ${session.primaryGoalTrack} / ${session.subject}.`,
      `Core topics: ${standard.coreTopics.join(", ") || "None"}.`,
      `Matched topics from captured content: ${matchedTopics.join(", ") || "None"}.`,
      `Prioritized next actions from learning standard: ${prioritizedNextActions.join("; ") || "None"}.`
    ].join("\n")
  };
}

function loadLearningStandards(): LearningStandards {
  const candidates = [
    path.resolve(process.cwd(), "../config/learning-standards.json"),
    path.resolve(process.cwd(), "config/learning-standards.json")
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, "utf8")) as LearningStandards;
    } catch {
      // Try the next likely cwd.
    }
  }

  return {};
}
