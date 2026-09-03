// Rule-based classifier for Razorpay payment failure/abandonment events.
//
// Takes a raw webhook-shaped event (payment.failed or order.abandoned) and
// returns a failure category plus a human-readable reasoning trace, so the
// decision engine and dashboard can both explain *why* a category was chosen.

export const Category = {
  CARD_ISSUE: "CARD_ISSUE",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  OTP_TIMEOUT: "OTP_TIMEOUT",
  NETWORK_ISSUE: "NETWORK_ISSUE",
  ABANDONED: "ABANDONED",
  UNKNOWN: "UNKNOWN",
};

// error_reason -> category, for values Razorpay documents on payment.failed.
const ERROR_REASON_MAP = {
  issuer_declined: Category.CARD_ISSUE,
  payment_declined_by_bank: Category.CARD_ISSUE,
  risk_check_failed: Category.CARD_ISSUE,
  fraudulent_transaction_block: Category.CARD_ISSUE,

  insufficient_funds: Category.INSUFFICIENT_FUNDS,

  otp_timeout: Category.OTP_TIMEOUT,
  invalid_otp: Category.OTP_TIMEOUT,
  otp_retries_exceeded: Category.OTP_TIMEOUT,

  gateway_error: Category.NETWORK_ISSUE,
  gateway_timed_out: Category.NETWORK_ISSUE,
  network_issue: Category.NETWORK_ISSUE,
  server_error: Category.NETWORK_ISSUE,
};

function classifyPaymentFailed(event) {
  const payment = event.payload?.payment?.entity;
  const reasoning = [];

  if (!payment) {
    reasoning.push("payment.failed event has no payment entity payload — cannot classify.");
    return { category: Category.UNKNOWN, reasoning, confidence: 0 };
  }

  const errorReason = payment.error_reason;
  const attemptNumber = event.meta?.attempt_number ?? 1;

  reasoning.push(
    `Event is payment.failed with error_code="${payment.error_code}", ` +
      `error_reason="${errorReason}", method="${payment.method}", attempt #${attemptNumber}.`
  );

  const mapped = ERROR_REASON_MAP[errorReason];

  if (!mapped) {
    reasoning.push(`error_reason="${errorReason}" is not in the known rule set — falling back to UNKNOWN.`);
    return { category: Category.UNKNOWN, reasoning, confidence: 0.3 };
  }

  if (mapped === Category.CARD_ISSUE) {
    reasoning.push(
      attemptNumber >= 2
        ? `Card-related decline (${errorReason}) repeated across ${attemptNumber} attempts on the same order — classified as CARD_ISSUE.`
        : `Card-related decline (${errorReason}) on first attempt — classified as CARD_ISSUE, but not yet a repeat pattern.`
    );
  } else {
    reasoning.push(`error_reason="${errorReason}" maps directly to ${mapped}.`);
  }

  return { category: mapped, reasoning, confidence: 0.9 };
}

function classifyAbandoned(event) {
  const order = event.payload?.order?.entity;
  const reasoning = [
    `Event is order.abandoned — order ${order?.id ?? "(unknown)"} was created with ${
      order?.attempts ?? 0
    } payment attempts and no completed payment.`,
    "No payment.failed event exists for this order, so this is a checkout abandonment, not a decline.",
  ];
  return { category: Category.ABANDONED, reasoning, confidence: 0.95 };
}

/**
 * @param {object} event - a webhook-shaped event (see backend/fixtures/payment_events.json)
 * @returns {{ category: string, reasoning: string[], confidence: number }}
 */
export function classifyEvent(event) {
  if (event.event === "payment.failed") return classifyPaymentFailed(event);
  if (event.event === "order.abandoned") return classifyAbandoned(event);

  return {
    category: Category.UNKNOWN,
    reasoning: [`Unrecognized event type "${event.event}" — no classification rule applies.`],
    confidence: 0,
  };
}
