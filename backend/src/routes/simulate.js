import { Router } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { processEvent } from "../agent/pipeline.js";
import { db } from "../db/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "../../fixtures/payment_events.json");
const allEvents = JSON.parse(readFileSync(fixturesPath, "utf-8"));

const seenIdsStmt = db.prepare("SELECT DISTINCT event_id FROM recovery_attempts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The Razorpay SDK rejects with a plain { statusCode, error } object rather
// than an Error instance, so err.message is undefined for those failures.
function describeError(err) {
  if (err instanceof Error) return err.message;
  if (err?.error?.description) return err.error.description;
  return JSON.stringify(err);
}

function unprocessedEvents() {
  const seen = new Set(seenIdsStmt.all().map((r) => r.event_id));
  return allEvents.filter((e) => !seen.has(e.id));
}

export const simulateRouter = Router();

// Simulates the next event arriving on the mock Razorpay webhook feed and
// runs it through the full agent pipeline (classify -> decide -> recover).
simulateRouter.post("/simulate/next", async (req, res) => {
  const remaining = unprocessedEvents();
  if (remaining.length === 0) {
    return res.status(200).json({ processed: false, message: "No more mock events in the feed." });
  }

  const event = remaining[0];
  try {
    const attemptId = await processEvent(event);
    res.json({ processed: true, eventId: event.id, attemptId, remaining: remaining.length - 1 });
  } catch (err) {
    console.error(`[recovery-agent] failed processing ${event.id}:`, err);
    res.status(502).json({ processed: false, eventId: event.id, error: describeError(err) });
  }
});

// Drains the whole remaining mock feed in one call, useful for demos.
simulateRouter.post("/simulate/all", async (req, res) => {
  const remaining = unprocessedEvents();
  const results = [];
  const errors = [];
  for (const [i, event] of remaining.entries()) {
    // Razorpay's test-mode API rate-limits rapid back-to-back calls — space them out.
    if (i > 0) await sleep(1000);
    try {
      const attemptId = await processEvent(event);
      results.push({ eventId: event.id, attemptId });
    } catch (err) {
      console.error(`[recovery-agent] failed processing ${event.id}:`, err);
      errors.push({ eventId: event.id, error: describeError(err) });
    }
  }
  res.json({ processedCount: results.length, results, errors });
});

simulateRouter.get("/simulate/status", (req, res) => {
  const remaining = unprocessedEvents();
  res.json({ totalEvents: allEvents.length, remaining: remaining.length });
});
