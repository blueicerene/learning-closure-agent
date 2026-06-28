export type SourceType = "chatgpt" | "notebooklm" | "youtube" | "pdf" | "webpage" | "manual";
export type GoalTrack = "LLM" | "Bar" | "Certificate";
export type ReviewStatus = "needs_review" | "reviewed";

export type LearningSession = {
  id: string;
  goal?: string;
  primaryGoalTrack: GoalTrack;
  subject: string;
  sourceType: SourceType;
  title: string;
  url?: string;
  capturedAt: string;
  rawText: string;
};

export type KnowledgeCard = {
  title: string;
  summary: string;
  tags: string[];
};

export type NextAction = {
  action: string;
  reason: string;
};

export type Classification = {
  primaryGoalTrack: GoalTrack;
  secondaryGoalTracks: GoalTrack[];
  subject: string;
  relatedSubjects: string[];
  topic: string;
  subtopics: string[];
  jurisdiction?: string;
  knowledgeTypes: string[];
  classificationConfidence: number;
  classificationReason: string;
  reviewStatus: ReviewStatus;
};

export type SessionClosure = {
  sessionId: string;
  summary: string;
  keyTakeaways: string[];
  knowledgeCards: KnowledgeCard[];
  unresolvedQuestions: string[];
  nextActions: NextAction[];
  suggestedTags: string[];
  classification: Classification;
  learningStandardUsed: boolean;
  learningStandardMatchedTopics: string[];
};

export type LastActionResponse = {
  hasLastAction: boolean;
  lastTitle?: string;
  lastCapturedAt?: string;
  nextActions: NextAction[];
};

export type CaptureMode = "page" | "selection";

export type CaptureResponse =
  | {
      ok: true;
      session: LearningSession;
    }
  | {
      ok: false;
      error: string;
    };
