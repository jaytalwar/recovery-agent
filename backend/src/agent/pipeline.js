// Ties the whole agent loop together for a single event:
// classify -> decide -> create Payment Link -> generate message -> "send" -> persist.
//
// "Sending" is mocked via console.log by default, per the hackathon scope —
// swapping in a real WhatsApp/email API only requires replacing sendMessage().

import { randomUUID } from "node:crypto";
import { classifyEvent } from "./classifier.js";
import { decideRecoveryAction } from "./decisionEngine.js";
import { createRecoveryPaymentLink } from "../api/razorpay.js";
import { generateRecoveryMessage } from "./messageGenerator.js";
import { saveRecoveryAttempt } from "../db/store.js";

function extractContext(event) {
  if (event.event === "payment.failed") {
    const payment = event.payload.payment.entity;
    return {
      eventType: event.event,
      customerName: event.meta?.customer_name ?? "Customer",
      email: payment.email,
      contact: payment.contact,
      product: event.meta?.product ?? "your order",
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  if (event.event === "order.abandoned") {
    const order = event.payload.order.entity;
    return {
      eventType: event.event,
      customerName: event.meta?.customer_name ?? "Customer",
      email: order.email,
      contact: order.contact,
      product: event.meta?.product ?? "your cart",
      amount: order.amount,
      currency: order.currency,
    };
  }

  throw new Error(`Cannot extract context for unrecognized event type "${event.event}"`);
}

function sendMessage({ channel, contact, email, message }) {
  console.log(`\n[recovery-agent] sending ${channel} to ${contact ?? email}:\n${message}\n`);
}

/**
 * @param {object} event - a webhook-shaped event (see fixtures/payment_events.json)
 * @returns {Promise<object>} the persisted recovery attempt record
 */
export async function processEvent(event) {
  const context = extractContext(event);

  const classification = classifyEvent(event);
  const decision = decideRecoveryAction(event, classification);

  const paymentLink = await createRecoveryPaymentLink({
    amount: context.amount,
    currency: context.currency,
    customerName: context.customerName,
    email: context.email,
    contact: context.contact,
    description: `Complete your order: ${context.product}`,
    expiryMinutes: decision.linkExpiryMinutes ?? 60,
    // Razorpay requires reference_id to be globally unique on the account, forever —
    // event.id alone would collide on every re-run against a fresh local DB (the
    // fixtures are static), so a short unique suffix is appended per attempt.
    referenceId: `${event.id}_${randomUUID().slice(0, 8)}`,
  });

  const generated = await generateRecoveryMessage({
    context: { ...context, category: classification.category },
    decision,
    paymentLink,
  });

  sendMessage({
    channel: "whatsapp",
    contact: context.contact,
    email: context.email,
    message: generated.message,
  });

  const attemptId = saveRecoveryAttempt({
    eventId: event.id,
    eventType: event.event,
    customerName: context.customerName,
    email: context.email,
    contact: context.contact,
    product: context.product,
    amount: context.amount,
    currency: context.currency,
    category: classification.category,
    classificationReasoning: classification.reasoning,
    action: decision.action,
    decisionReasoning: decision.reasoning,
    discountPercent: decision.discountPercent,
    paymentLinkId: paymentLink.id,
    paymentLinkUrl: paymentLink.short_url,
    paymentLinkMock: paymentLink.mock,
    linkExpiryMinutes: decision.linkExpiryMinutes,
    message: generated.message,
    messageReasoning: generated.reasoning,
    messageMock: generated.mock,
    messageProvider: generated.provider,
    status: "sent",
  });

  return attemptId;
}
