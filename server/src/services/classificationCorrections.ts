import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Classification, LearningSession } from "../types.js";

type ClassificationCorrection = {
  capturedAt: string;
  originalClassification: Classification;
  correctedClassification: Classification;
  rawTextSnippet: string;
  reason: "user corrected classification";
};

export async function saveClassificationCorrectionIfChanged(
  session: LearningSession,
  originalClassification: Classification | undefined,
  correctedClassification: Classification
): Promise<void> {
  if (!originalClassification || classificationsEqual(originalClassification, correctedClassification)) {
    return;
  }

  const correction: ClassificationCorrection = {
    capturedAt: new Date().toISOString(),
    originalClassification,
    correctedClassification,
    rawTextSnippet: session.rawText.slice(0, 800),
    reason: "user corrected classification"
  };

  const correctionsPath = getCorrectionsPath();
  const existing = await readCorrections(correctionsPath);
  await mkdir(path.dirname(correctionsPath), { recursive: true });
  await writeFile(correctionsPath, `${JSON.stringify([...existing, correction], null, 2)}\n`, "utf8");
}

function getCorrectionsPath(): string {
  return process.env.LEARNING_CORRECTIONS_PATH
    || path.resolve(process.cwd(), "output/classification-corrections.json");
}

async function readCorrections(correctionsPath: string): Promise<ClassificationCorrection[]> {
  try {
    const raw = await readFile(correctionsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function classificationsEqual(left: Classification, right: Classification): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function normalize(classification: Classification): Classification {
  return {
    ...classification,
    secondaryGoalTracks: [...classification.secondaryGoalTracks].sort(),
    relatedSubjects: [...classification.relatedSubjects].sort(),
    subtopics: [...classification.subtopics].sort(),
    knowledgeTypes: [...classification.knowledgeTypes].sort()
  };
}
