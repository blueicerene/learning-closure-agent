import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearningLog, LearningSession, SessionClosure } from "../types.js";

const defaultLog: LearningLog = {
  lastNextActions: [],
  recentSessions: []
};

export async function getLearningLog(): Promise<LearningLog> {
  const logPath = getLearningLogPath();

  try {
    const raw = await readFile(logPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LearningLog>;
    return {
      ...defaultLog,
      ...parsed,
      lastNextActions: Array.isArray(parsed.lastNextActions) ? parsed.lastNextActions : [],
      recentSessions: Array.isArray(parsed.recentSessions) ? parsed.recentSessions : []
    };
  } catch {
    return defaultLog;
  }
}

export async function getLastActionSummary() {
  const log = await getLearningLog();
  return {
    hasLastAction: log.lastNextActions.length > 0,
    lastTitle: log.lastTitle,
    lastCapturedAt: log.lastCapturedAt,
    nextActions: log.lastNextActions
  };
}

export async function updateLearningLog(
  session: LearningSession,
  closure: SessionClosure,
  markdownPath: string
): Promise<void> {
  const logPath = getLearningLogPath();
  const existing = await getLearningLog();
  const nextLog: LearningLog = {
    lastSessionId: session.id,
    lastCapturedAt: session.capturedAt,
    lastGoal: session.goal,
    lastTitle: session.title,
    lastSourceType: session.sourceType,
    lastNextActions: closure.nextActions,
    recentSessions: [
      {
        sessionId: session.id,
        title: session.title,
        sourceType: session.sourceType,
        capturedAt: session.capturedAt,
        markdownPath
      },
      ...existing.recentSessions.filter((item) => item.sessionId !== session.id)
    ].slice(0, 25)
  };

  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(nextLog, null, 2)}\n`, "utf8");
}

function getLearningLogPath(): string {
  const configured = process.env.LEARNING_LOG_PATH;
  if (configured) return configured;

  const inboxPath = process.env.OBSIDIAN_INBOX_PATH;
  if (inboxPath) return path.join(inboxPath, "learning-log.json");

  return path.resolve(process.cwd(), "learning-log.json");
}
