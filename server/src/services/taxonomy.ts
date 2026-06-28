import { readFileSync } from "node:fs";
import path from "node:path";
import type { GoalTrack } from "../types.js";

type Taxonomy = {
  goalTracks: GoalTrack[];
  subjects: Record<GoalTrack, string[]>;
  knowledgeTypes: string[];
};

const taxonomyPath = path.resolve(process.cwd(), "../config/taxonomy.json");
const fallbackPath = path.resolve(process.cwd(), "config/taxonomy.json");

export const taxonomy: Taxonomy = JSON.parse(
  readFileSync(resolveTaxonomyPath(), "utf8")
) as Taxonomy;

export function isGoalTrack(value: string): value is GoalTrack {
  return taxonomy.goalTracks.includes(value as GoalTrack);
}

export function validSubjectForTrack(track: GoalTrack, subject: string): boolean {
  return taxonomy.subjects[track]?.includes(subject) ?? false;
}

export function filterGoalTracks(values: string[]): GoalTrack[] {
  return values.filter(isGoalTrack);
}

export function filterKnowledgeTypes(values: string[]): string[] {
  return values.filter((value) => taxonomy.knowledgeTypes.includes(value));
}

function resolveTaxonomyPath(): string {
  try {
    readFileSync(taxonomyPath, "utf8");
    return taxonomyPath;
  } catch {
    return fallbackPath;
  }
}
