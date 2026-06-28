import type { GoalTrack } from "./types";

export const goalTracks: GoalTrack[] = ["LLM", "Bar", "Certificate"];

export const subjects: Record<GoalTrack, string[]> = {
  LLM: [
    "Canadian Administrative Law",
    "Canadian Constitutional Law",
    "Canadian Criminal Law",
    "Foundations of Canadian Law",
    "Canadian Professional Responsibility",
    "Contracts",
    "Torts",
    "Property",
    "Canadian Legal Research and Writing",
    "Indigenous Law and Peoples"
  ],
  Bar: [
    "Ontario Solicitor - Business Law",
    "Ontario Solicitor - Real Estate",
    "Ontario Solicitor - Wills, Trusts and Estates",
    "Ontario Solicitor - Professional Responsibility",
    "Ontario Solicitor - Practice Management",
    "Ontario Solicitor - Exam Strategy"
  ],
  Certificate: [
    "NCA",
    "English Test",
    "Data Privacy / Compliance",
    "CAMS",
    "Legal Operations",
    "Other Certificate"
  ]
};

export const knowledgeTypes = [
  "concept",
  "statute",
  "case",
  "rule",
  "doctrine",
  "definition",
  "comparison",
  "personal_insight",
  "question",
  "exam_tip",
  "assignment_material",
  "podcast_material",
  "practice_note",
  "workflow_note"
];
