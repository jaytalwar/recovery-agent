import "dotenv/config";
import express from "express";
import cors from "cors";
import { eventsRouter } from "./routes/events.js";
import { simulateRouter } from "./routes/simulate.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api", eventsRouter);
app.use("/api", simulateRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[recovery-agent] backend listening on http://localhost:${port}`);
});
