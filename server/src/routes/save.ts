import { Router } from "express";
import { saveClassificationCorrectionIfChanged } from "../services/classificationCorrections.js";
import { updateLearningLog } from "../services/learningLog.js";
import { updateLearningProgress } from "../services/learningProgress.js";
import { saveLearningClosure } from "../services/markdown.js";
import { validateClassification, validateSavePayload } from "../services/sanitizer.js";

export const saveRouter = Router();

saveRouter.post("/", async (req, res, next) => {
  try {
    const { session, closure } = validateSavePayload(req.body);
    const originalClassification = req.body?.originalClassification
      ? validateClassification(req.body.originalClassification, session)
      : undefined;
    const markdownPath = await saveLearningClosure(session, closure);
    await saveClassificationCorrectionIfChanged(session, originalClassification, closure.classification);
    await updateLearningLog(session, closure, markdownPath);
    await updateLearningProgress(session, closure, markdownPath);
    res.json({ saved: true, markdownPath });
  } catch (error) {
    next(error);
  }
});
