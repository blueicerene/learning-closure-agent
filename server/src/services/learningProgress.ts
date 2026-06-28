import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearningSession, NextAction, SessionClosure } from "../types.js";
import { findLearningStandard, getStandardTopics, type LearningStandard } from "./learningStandards.js";

type CoveredTopic = {
  topic: string;
  count: number;
  firstStudiedAt: string;
  lastStudiedAt: string;
  sourceFiles: string[];
  hasUnresolvedQuestions: boolean;
  hasPendingNextActions: boolean;
};

type ProgressQuestion = {
  question: string;
  capturedAt: string;
  sourceFile: string;
};

type ProgressAction = NextAction & {
  capturedAt: string;
  sourceFile: string;
};

type StandardProgress = {
  standardId: string;
  standardName: string;
  goalTrack: string;
  subject: string;
  coveredTopics: Record<string, CoveredTopic>;
  missingTopics: string[];
  unresolvedQuestions: ProgressQuestion[];
  pendingNextActions: ProgressAction[];
  sourceFiles: string[];
  lastStudiedAt: string;
};

export type LearningProgress = {
  version: "v0.2";
  lastUpdatedAt: string;
  standards: Record<string, StandardProgress>;
};

const emptyProgress: LearningProgress = {
  version: "v0.2",
  lastUpdatedAt: "",
  standards: {}
};

export async function getLearningProgress(): Promise<LearningProgress> {
  const progressPath = getProgressPath();

  try {
    const raw = await readFile(progressPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      ...emptyProgress,
      ...parsed,
      version: "v0.2",
      standards: parsed.standards && typeof parsed.standards === "object" ? parsed.standards : {}
    };
  } catch {
    return emptyProgress;
  }
}

export async function updateLearningProgress(
  session: LearningSession,
  closure: SessionClosure,
  markdownPath: string
): Promise<void> {
  const standard = findLearningStandard(closure.classification.primaryGoalTrack, closure.classification.subject);
  if (!standard) return;

  const progressPath = getProgressPath();
  const progress = await getLearningProgress();
  const now = new Date().toISOString();
  const standardProgress = progress.standards[standard.standardId] ?? createStandardProgress(standard);
  const matchedTopics = getMatchedTopics(closure);

  for (const topic of matchedTopics) {
    const existing = standardProgress.coveredTopics[topic];
    standardProgress.coveredTopics[topic] = existing
      ? {
          ...existing,
          count: existing.count + 1,
          lastStudiedAt: session.capturedAt,
          sourceFiles: unique([...existing.sourceFiles, markdownPath]),
          hasUnresolvedQuestions: existing.hasUnresolvedQuestions || closure.unresolvedQuestions.length > 0,
          hasPendingNextActions: existing.hasPendingNextActions || closure.nextActions.length > 0
        }
      : {
          topic,
          count: 1,
          firstStudiedAt: session.capturedAt,
          lastStudiedAt: session.capturedAt,
          sourceFiles: [markdownPath],
          hasUnresolvedQuestions: closure.unresolvedQuestions.length > 0,
          hasPendingNextActions: closure.nextActions.length > 0
        };
  }

  standardProgress.missingTopics = getMissingTopics(standard, standardProgress.coveredTopics);
  standardProgress.unresolvedQuestions = [
    ...standardProgress.unresolvedQuestions,
    ...closure.unresolvedQuestions.map((question) => ({
      question,
      capturedAt: session.capturedAt,
      sourceFile: markdownPath
    }))
  ];
  standardProgress.pendingNextActions = [
    ...standardProgress.pendingNextActions,
    ...closure.nextActions.map((action) => ({
      ...action,
      capturedAt: session.capturedAt,
      sourceFile: markdownPath
    }))
  ];
  standardProgress.sourceFiles = unique([...standardProgress.sourceFiles, markdownPath]);
  standardProgress.lastStudiedAt = session.capturedAt;

  progress.standards[standard.standardId] = standardProgress;
  progress.lastUpdatedAt = now;

  await mkdir(path.dirname(progressPath), { recursive: true });
  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  await writeProgressSummary(progress, getSummaryPath(progressPath));
}

function createStandardProgress(standard: LearningStandard): StandardProgress {
  return {
    standardId: standard.standardId,
    standardName: standard.standardName,
    goalTrack: standard.goalTrack,
    subject: standard.subject,
    coveredTopics: {},
    missingTopics: getStandardTopics(standard),
    unresolvedQuestions: [],
    pendingNextActions: [],
    sourceFiles: [],
    lastStudiedAt: ""
  };
}

function getMatchedTopics(closure: SessionClosure): string[] {
  const fromStandard = closure.learningStandardMatchedTopics.filter(Boolean);
  if (fromStandard.length > 0) return unique(fromStandard);

  return unique([
    closure.classification.topic,
    ...closure.classification.subtopics
  ].filter(Boolean));
}

function getMissingTopics(standard: LearningStandard, coveredTopics: Record<string, CoveredTopic>): string[] {
  const covered = new Set(Object.keys(coveredTopics));
  return getStandardTopics(standard).filter((topic) => !covered.has(topic));
}

async function writeProgressSummary(progress: LearningProgress, summaryPath: string): Promise<void> {
  const sections = Object.values(progress.standards).map((standard) => {
    const standardDefinition = findLearningStandard(standard.goalTrack, standard.subject);
    const coveredTopicNames = Object.keys(standard.coveredTopics);
    const missingCoreTopics = standardDefinition
      ? standardDefinition.requiredTopicGroups
          .flatMap((group) => group.topics)
          .filter((topic) => !coveredTopicNames.includes(topic))
      : standard.missingTopics;
    const missingSupportingTopics = standardDefinition
      ? standardDefinition.supportingTopics.filter((topic) => !coveredTopicNames.includes(topic))
      : [];

    return `## ${standard.goalTrack} / ${standard.subject}

Last Studied At: ${standard.lastStudiedAt || "Not studied yet"}

### 建议下一步

${formatRecommendedNextAction(standard.pendingNextActions)}

### 已接触主题

${list(coveredTopicNames)}

### 待覆盖核心主题

${list(missingCoreTopics)}

### 待补充辅助主题

${list(missingSupportingTopics)}

### 未解决问题

${list(standard.unresolvedQuestions.map((item) => item.question))}

### 待执行行动

${list(standard.pendingNextActions.map((item) => `${item.action}：${item.reason}`))}

### 来源文件

${list(standard.sourceFiles.map(formatSourceFile))}
`;
  });

  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `# 学习进度摘要

Last Updated At: ${progress.lastUpdatedAt || "Not updated yet"}

${sections.join("\n---\n\n") || "暂无学习进度。"}
`, "utf8");
}

function formatRecommendedNextAction(actions: ProgressAction[]): string {
  const [firstAction] = actions;
  if (!firstAction) return "暂无建议。";
  return `${firstAction.action}：${firstAction.reason}`;
}

function formatSourceFile(sourceFile: string): string {
  const outputSegment = `${path.sep}output${path.sep}`;
  const outputIndex = sourceFile.lastIndexOf(outputSegment);
  if (outputIndex >= 0) {
    return sourceFile.slice(outputIndex + 1);
  }

  return path.basename(sourceFile);
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function getProgressPath(): string {
  return process.env.LEARNING_PROGRESS_PATH
    || path.resolve(process.cwd(), "output/learning-progress.json");
}

function getSummaryPath(progressPath: string): string {
  return path.join(path.dirname(progressPath), "Learning Progress Summary.md");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
