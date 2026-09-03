import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyEvent, Category } from "../src/agent/classifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/payment_events.json"), "utf-8")
);

function findFixture(id) {
  const event = fixtures.find((e) => e.id === id);
  assert.ok(event, `fixture "${id}" must exist`);
  return event;
}

test("repeated card decline classifies as CARD_ISSUE", () => {
  const result = classifyEvent(findFixture("evt_card_repeat_002"));
  assert.equal(result.category, Category.CARD_ISSUE);
  assert.ok(result.reasoning.length > 0);
});

test("insufficient funds classifies as INSUFFICIENT_FUNDS", () => {
  const result = classifyEvent(findFixture("evt_insufficient_funds_001"));
  assert.equal(result.category, Category.INSUFFICIENT_FUNDS);
});

test("otp timeout classifies as OTP_TIMEOUT", () => {
  const result = classifyEvent(findFixture("evt_otp_timeout_001"));
  assert.equal(result.category, Category.OTP_TIMEOUT);
});

test("otp retries exceeded also classifies as OTP_TIMEOUT", () => {
  const result = classifyEvent(findFixture("evt_otp_invalid_001"));
  assert.equal(result.category, Category.OTP_TIMEOUT);
});

test("gateway timeout classifies as NETWORK_ISSUE", () => {
  const result = classifyEvent(findFixture("evt_network_error_001"));
  assert.equal(result.category, Category.NETWORK_ISSUE);
});

test("server-side network issue classifies as NETWORK_ISSUE", () => {
  const result = classifyEvent(findFixture("evt_server_error_001"));
  assert.equal(result.category, Category.NETWORK_ISSUE);
});

test("order.abandoned classifies as ABANDONED", () => {
  const result = classifyEvent(findFixture("evt_abandoned_001"));
  assert.equal(result.category, Category.ABANDONED);
  assert.equal(result.confidence, 0.95);
});

test("unknown error_reason falls back to UNKNOWN", () => {
  const event = {
    event: "payment.failed",
    payload: { payment: { entity: { error_code: "BAD_REQUEST_ERROR", error_reason: "something_new", method: "card" } } },
    meta: { attempt_number: 1 },
  };
  const result = classifyEvent(event);
  assert.equal(result.category, Category.UNKNOWN);
});

test("unrecognized event type falls back to UNKNOWN", () => {
  const result = classifyEvent({ event: "refund.processed", payload: {} });
  assert.equal(result.category, Category.UNKNOWN);
});
