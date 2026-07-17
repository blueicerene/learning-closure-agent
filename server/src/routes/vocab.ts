import { Router } from "express";
import {
  backfillVocabQuality,
  deleteVocabItem,
  getVocabItems,
  getVocabReview,
  importVocabText,
  lookupDictionaryTerm,
  markVocabQualityOk,
  recheckVocabItem,
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

vocabRouter.post("/quality/backfill", async (_req, res, next) => {
  try {
    res.json(await backfillVocabQuality());
  } catch (error) {
    next(error);
  }
});

vocabRouter.post("/image-lookup", (req, res) => {
  pruneDesktopImageLookups();

  const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
  if (!dataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "dataUrl image is required" });
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
    res.status(404).json({ error: "Dropped image was not found. Try dragging it again." });
    return;
  }

  res.json(payload);
});

vocabRouter.post("/import", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      res.status(400).json({ error: "Import text is required" });
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
      res.status(400).json({ error: "Lookup term is required" });
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
      res.status(400).json({ error: "Lookup term is required" });
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
      res.status(400).json({ error: "term and definition are required" });
      return;
    }

    res.json(await saveDictionaryEntry({
      term,
      definition,
      chineseDefinition: typeof req.body?.chineseDefinition === "string" ? req.body.chineseDefinition : undefined,
      legalContext: typeof req.body?.legalContext === "string" ? req.body.legalContext : undefined,
      phonetic: typeof req.body?.phonetic === "string" ? req.body.phonetic : undefined,
      pronunciation: typeof req.body?.pronunciation === "string" ? req.body.pronunciation : undefined,
      legalNote: req.body?.legalNote
    }));
  } catch (error) {
    next(error);
  }
});

vocabRouter.delete("/items/:itemId", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    res.json(await deleteVocabItem(itemId));
  } catch (error) {
    next(error);
  }
});

vocabRouter.patch("/items/:itemId", async (req, res, next) => {
  try {
    const itemId = typeof req.params?.itemId === "string" ? req.params.itemId : "";
    if (!itemId) {
      res.status(400).json({ error: "itemId is required" });
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
      res.status(400).json({ error: "itemId is required" });
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
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    res.json(await recheckVocabItem(itemId));
  } catch (error) {
    next(error);
  }
});

vocabRouter.get("/review", async (req, res, next) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const requestedMode = typeof req.query.mode === "string" ? req.query.mode : "due";
    const mode: ReviewMode = requestedMode === "all" || requestedMode === "wrong" ? requestedMode : "due";
    res.json(await getVocabReview(date, mode));
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
      res.status(400).json({ error: "itemId, selectedDefinition, and correctDefinition are required" });
      return;
    }

    res.json(await recordVocabAnswer({
      itemId,
      selectedDefinition,
      correctDefinition,
      isCorrect
    }));
  } catch (error) {
    next(error);
  }
});
