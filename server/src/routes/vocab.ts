import { Router } from "express";
import {
  backfillVocabQuality,
  deleteVocabItem,
  enrichCurrentDailyPlanFeedbackDetails,
  enrichVocabFeedbackDetails,
  flagVocabQuestionIssue,
  getDailyPlanCalendar,
  getLearningStatus,
  getVocabFeedbackEnrichmentAudit,
  getVocabItems,
  getVocabReview,
  importVocabText,
  lookupDictionaryTerm,
  type LookupEventInput,
  type LookupSource,
  markVocabQualityOk,
  recheckVocabItem,
  recordQuizQuestionStarted,
  retireVocabItem,
  type ReviewMode,
  recordVocabAnswer,
  saveDictionaryEntry,
  saveDictionaryTerm,
  updateVocabItem
} from "../services/vocab.js";

export const vocabRouter = Router();

type ImageLookupPayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
};

const desktopImageLookups = new Map<string, ImageLookupPayload>();
const desktopImageLookupTtlMs = 10 * 60 * 1000;

function pruneDesktopImageLookups() {
  const now = Date.now();
  for (const [key, value] of desktopImageLookups.entries()) {
    if (now - value.createdAt > desktopImageLookupTtlMs) {
      desktopImageLookups.delete(key);
    }
  }
}

vocabRouter.get("/items", async (_req, res, next) => {
  try {
    res.json(await getVocabItems());
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/learning-status", async (_req, res, next) => {
  try {
    res.json(await getLearningStatus());
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/calendar", async (req, res, next) => {
  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    res.json(await getDailyPlanCalendar(month));
  } catch (error) {
    if (error instanceof Error && error.message === "月份格式应为 YYYY-MM。") {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

vocabRouter.post("/quality/backfill", async (_req, res, next) => {
  try {
    res.json(await backfillVocabQuality());
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/quality/enrich-plan-feedback", async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun !== false;
    res.json(await enrichCurrentDailyPlanFeedbackDetails(dryRun));
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/quality/feedback-audit", async (_req, res, next) => {
  try {
    res.json(await getVocabFeedbackEnrichmentAudit());
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/quality/enrich-feedback", async (req, res, next) => {
  try {
    const itemIds = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const dryRun = req.body?.dryRun !== false;
    res.json(await enrichVocabFeedbackDetails({ itemIds, dryRun }));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/image-lookup", (req, res) => {
  pruneDesktopImageLookups();

  const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
  if (!dataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "请提供要识别的图片。" });
    return;
  }

  const key = `desktop-image-${Date.now()}-${crypto.randomUUID()}`;
  desktopImageLookups.set(key, {
    name: typeof req.body?.name === "string" ? req.body.name : "desktop-image.png",
    mimeType: typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/png",
    dataUrl,
    createdAt: Date.now()
  });

  res.json({ key });
});

vocabRouter.get("/image-lookup/:key", (req, res) => {
  pruneDesktopImageLookups();

  const key = typeof req.params?.key === "string" ? req.params.key : "";
  const payload = desktopImageLookups.get(key);
  if (!payload) {
    res.status(404).json({ error: "没有找到拖入的图片，请重新拖入。" });
    return;
  }

  res.json(payload);
});

vocabRouter.post("/import", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      res.status(400).json({ error: "请先粘贴要导入的词汇文本。" });
      return;
    }

    res.json(await importVocabText(text));
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/lookup", async (req, res, next) => {
  try {
    const term = typeof req.query.term === "string" ? req.query.term : "";
    if (!term.trim()) {
      res.status(400).json({ error: "请输入要查询的词汇。" });
      return;
    }

    res.json(await lookupDictionaryTerm(term));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/lookup/save", async (req, res, next) => {
  try {
    const term = typeof req.body?.term === "string" ? req.body.term : "";
    if (!term.trim()) {
      res.status(400).json({ error: "请输入要查询的词汇。" });
      return;
    }

    res.json(await saveDictionaryTerm(term));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/lookup/save-entry", async (req, res, next) => {
  try {
    const term = typeof req.body?.term === "string" ? req.body.term.trim() : "";
    const definition = typeof req.body?.definition === "string" ? req.body.definition.trim() : "";
    if (!term || !definition) {
      res.status(400).json({ error: "词汇和英文释义均不能为空。" });
      return;
    }

    const lookupEvent = parseLookupEvent(req.body?.lookupEvent);
    if (req.body?.lookupEvent && !lookupEvent) {
      res.status(400).json({ error: "查询事件信息无效。" });
      return;
    }

    res.json(await saveDictionaryEntry({
      term,
      definition,
      chineseDefinition: typeof req.body?.chineseDefinition === "string" ? req.body.chineseDefinition : undefined,
      legalContext: typeof req.body?.legalContext === "string" ? req.body.legalContext : undefined,
      lookupQuality: isLookupQuality(req.body?.lookupQuality) ? req.body.lookupQuality : undefined,
      sourceLabel: typeof req.body?.sourceLabel === "string" ? req.body.sourceLabel : undefined,
      lookupWarning: typeof req.body?.lookupWarning === "string" ? req.body.lookupWarning : undefined,
      phonetic: typeof req.body?.phonetic === "string" ? req.body.phonetic : undefined,
      pronunciation: typeof req.body?.pronunciation === "string" ? req.body.pronunciation : undefined,
      legalNote: req.body?.legalNote
    }, lookupEvent));
  } catch (error) {
    next(error);
  }
});

const lookupSources = new Set<LookupSource>([
  "web",
  "extension-selection",
  "extension-image",
  "desktop-image"
]);

function parseLookupEvent(value: unknown): LookupEventInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { eventId?: unknown; source?: unknown; occurredAt?: unknown };
  const eventId = typeof candidate.eventId === "string" ? candidate.eventId.trim() : "";
  const source = typeof candidate.source === "string" ? candidate.source as LookupSource : undefined;
  if (!eventId || eventId.length > 160 || !source || !lookupSources.has(source)) return undefined;

  return {
    eventId,
    source,
    occurredAt: typeof candidate.occurredAt === "string" ? candidate.occurredAt : undefined
  };
}

function isLookupQuality(value: unknown): value is "ai-legal" | "legal-glossary" | "saved" | "reference" | "dictionary" {
  return value === "ai-legal"
    || value === "legal-glossary"
    || value === "saved"
    || value === "reference"
    || value === "dictionary";
}

vocabRouter.delete("/items/:itemId", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }

    res.json(await deleteVocabItem(itemId));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/items/:itemId/retire", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : undefined;
    res.json(await retireVocabItem(itemId, reason));
  } catch (error) {
    next(error);
  }
});

vocabRouter.patch("/items/:itemId", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }

    res.json(await updateVocabItem(itemId, {
      term: typeof req.body?.term === "string" ? req.body.term : "",
      definition: typeof req.body?.definition === "string" ? req.body.definition : "",
      chineseDefinition: typeof req.body?.chineseDefinition === "string" ? req.body.chineseDefinition : undefined,
      legalContext: typeof req.body?.legalContext === "string" ? req.body.legalContext : undefined,
      phonetic: typeof req.body?.phonetic === "string" ? req.body.phonetic : undefined,
      pronunciation: typeof req.body?.pronunciation === "string" ? req.body.pronunciation : undefined
    }));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/items/:itemId/quality-ok", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }

    res.json(await markVocabQualityOk(itemId));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/items/:itemId/recheck", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }

    res.json(await recheckVocabItem(itemId));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/items/:itemId/question-issue", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : undefined;
    res.json(await flagVocabQuestionIssue(itemId, reason));
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/review", async (req, res, next) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const requestedMode = typeof req.query.mode === "string" ? req.query.mode : "due";
    const mode: ReviewMode = requestedMode === "all"
      || requestedMode === "wrong"
      || requestedMode === "focus"
      ? requestedMode
      : "due";
    res.json(await getVocabReview(date, mode, {
      restartFocusRound: mode === "focus" && req.query.restartFocusRound === "1"
    }));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/answer", async (req, res, next) => {
  try {
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
    const selectedDefinition = typeof req.body?.selectedDefinition === "string" ? req.body.selectedDefinition : "";
    const correctDefinition = typeof req.body?.correctDefinition === "string" ? req.body.correctDefinition : "";
    const isCorrect = Boolean(req.body?.isCorrect);

    if (!itemId || !selectedDefinition || !correctDefinition) {
      res.status(400).json({ error: "答题信息不完整，请重新作答。" });
      return;
    }

    res.json(await recordVocabAnswer({
      itemId,
      selectedDefinition,
      correctDefinition,
      isCorrect,
      sessionId: typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined,
      focusRoundId: typeof req.body?.focusRoundId === "string" ? req.body.focusRoundId : undefined,
      attemptKind: req.body?.attemptKind === "reinforcement" || req.body?.attemptKind === "independent"
        ? req.body.attemptKind
        : "plan"
    }));
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/quiz-activity", async (req, res, next) => {
  try {
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "缺少词条编号。" });
      return;
    }

    res.json(await recordQuizQuestionStarted({
      itemId,
      occurredAt: typeof req.body?.occurredAt === "string" ? req.body.occurredAt : undefined
    }));
  } catch (error) {
    next(error);
  }
});
