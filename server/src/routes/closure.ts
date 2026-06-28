import { Router } from "express";
import { createSessionClosure } from "../services/llm.js";
import { validateLearningSession } from "../services/sanitizer.js";

export const closureRouter = Router();

closureRouter.post("/", async (req, res, next) => {
  try {
    const session = validateLearningSession(req.body);
    const closure = await createSessionClosure(session);
    res.json(closure);
  } catch (error) {
    next(error);
  }
});
