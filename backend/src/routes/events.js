import { Router } from "express";
import { listRecoveryAttempts, getRecoveryAttempt, setRecoveryOutcome, getStats } from "../db/store.js";

export const eventsRouter = Router();

eventsRouter.get("/events", (req, res) => {
  res.json(listRecoveryAttempts());
});

eventsRouter.get("/events/:id", (req, res) => {
  const attempt = getRecoveryAttempt(req.params.id);
  if (!attempt) return res.status(404).json({ error: "not found" });
  res.json(attempt);
});

const VALID_STATUSES = new Set(["recovered", "failed", "expired"]);

eventsRouter.post("/events/:id/outcome", (req, res) => {
  const { status } = req.body ?? {};
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` });
  }
  const existing = getRecoveryAttempt(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const updated = setRecoveryOutcome(req.params.id, status);
  res.json(updated);
});

eventsRouter.get("/stats", (req, res) => {
  res.json(getStats());
});
