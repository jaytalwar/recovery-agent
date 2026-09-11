import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyEvent } from "../src/agent/classifier.js";
import { decideRecoveryAction, Action } from "../src/agent/decisionEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/payment_events.json"), "utf-8")
);

function decideFor(id) {
  const event = fixtures.find((e) => e.id === id);
  assert.ok(event, `fixture "${id}" must exist`);
  const classification = classifyEvent(event);
  return decideRecoveryAction(event, classification);
}

test("repeated card decline -> SWITCH_TO_UPI", () => {
  const decision = decideFor("evt_card_repeat_002");
  assert.equal(decision.action, Action.SWITCH_TO_UPI);
  assert.ok(decision.reasoning.some((r) => r.includes("2 times")));
});

test("insufficient funds -> SWITCH_TO_UPI", () => {
  const decision = decideFor("evt_insufficient_funds_001");
  assert.equal(decision.action, Action.SWITCH_TO_UPI);
});

test("otp timeout -> INSTANT_RETRY_LINK with short expiry", () => {
  const decision = decideFor("evt_otp_timeout_001");
  assert.equal(decision.action, Action.INSTANT_RETRY_LINK);
  assert.equal(decision.linkExpiryMinutes, 20);
});

test("network issue -> INSTANT_RETRY_LINK", () => {
  const decision = decideFor("evt_network_error_001");
  assert.equal(decision.action, Action.INSTANT_RETRY_LINK);
});

test("abandoned cart -> REMINDER_WITH_DISCOUNT with a positive discount", () => {
  const decision = decideFor("evt_abandoned_001");
  assert.equal(decision.action, Action.REMINDER_WITH_DISCOUNT);
  assert.ok(decision.discountPercent > 0);
});

test("unknown category -> MANUAL_REVIEW", () => {
  const event = { event: "refund.processed", payload: {}, meta: {} };
  const classification = classifyEvent(event);
  const decision = decideRecoveryAction(event, classification);
  assert.equal(decision.action, Action.MANUAL_REVIEW);
});
