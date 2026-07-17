import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { closureRouter } from "./routes/closure.js";
import { lastActionRouter } from "./routes/lastAction.js";
import { progressRouter } from "./routes/progress.js";
import { saveRouter } from "./routes/save.js";
import { vocabRouter } from "./routes/vocab.js";

dotenv.config({ path: "server/.env" });
dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3333);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/closure", closureRouter);
app.use("/api/save", saveRouter);
app.use("/api/last-action", lastActionRouter);
app.use("/api/progress", progressRouter);
app.use("/api/vocab", vocabRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`Learning Closure Agent server running at http://localhost:${port}`);
});
