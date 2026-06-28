import { Router } from "express";
import { getLearningProgress } from "../services/learningProgress.js";

export const progressRouter = Router();

progressRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getLearningProgress());
  } catch (error) {
    next(error);
  }
});
