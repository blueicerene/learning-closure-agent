import { Router } from "express";
import { getLastActionSummary } from "../services/learningLog.js";

export const lastActionRouter = Router();

lastActionRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getLastActionSummary());
  } catch (error) {
    next(error);
  }
});
