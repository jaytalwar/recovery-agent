// Wraps Razorpay's Payment Links API (test mode) for recovery messages.
//
// If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set, falls back to a mock
// link so the rest of the pipeline (classification -> decision -> message ->
// dashboard) can be exercised end-to-end without live credentials. Swap in
// real Razorpay test keys via backend/.env to switch this to live test-mode
// links — no other code changes needed.

import Razorpay from "razorpay";

const hasCredentials = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const client = hasCredentials
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

export const isLiveMode = hasCredentials;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Razorpay's test-mode API rate-limits fairly aggressively. Retry transient
// 429s with exponential backoff — but not RATE_LIMIT_EXCEEDED, which on test
// mode means a hard, non-transient cap (e.g. "test mode limit of 30 reached
// for payment_link"); retrying that just wastes time until the account is
// activated or the cap resets.
async function withRetry(fn, { retries = 4, baseDelayMs = 1500 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransientRateLimit = err?.statusCode === 429 && err?.error?.code !== "RATE_LIMIT_EXCEEDED";
      if (!isTransientRateLimit || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

/**
 * @param {object} params
 * @param {number} params.amount - amount in paise
 * @param {string} params.currency
 * @param {string} params.customerName
 * @param {string} params.email
 * @param {string} params.contact
 * @param {string} params.description
 * @param {number} params.expiryMinutes
 * @param {string} params.referenceId - unique reference tying the link back to the recovery attempt
 * @returns {Promise<{ id: string, short_url: string, mock: boolean }>}
 */
export async function createRecoveryPaymentLink({
  amount,
  currency = "INR",
  customerName,
  email,
  contact,
  description,
  expiryMinutes = 60,
  referenceId,
}) {
  if (!hasCredentials) {
    const mockId = `plink_mock_${referenceId}`;
    return {
      id: mockId,
      short_url: `https://rzp.io/mock/${mockId}`,
      mock: true,
    };
  }

  // Razorpay rejects expire_by under ~15 minutes out; pad past request latency
  // so a decision-engine value near that floor doesn't intermittently fail.
  const safeExpiryMinutes = Math.max(expiryMinutes, 16);
  const expireBy = Math.floor(Date.now() / 1000) + safeExpiryMinutes * 60;

  try {
    const link = await withRetry(() =>
      client.paymentLink.create({
        amount,
        currency,
        accept_partial: false,
        description,
        customer: {
          name: customerName,
          email,
          contact,
        },
        notify: { sms: true, email: true },
        reminder_enable: true,
        expire_by: expireBy,
        reference_id: referenceId,
      })
    );

    return { id: link.id, short_url: link.short_url, mock: false };
  } catch (err) {
    // Don't let a Razorpay-side failure (account-level test-mode cap, a
    // transient error survives retries, etc.) break the whole recovery
    // attempt — fall back to a mock link so classification, message
    // generation, and the dashboard still complete for this event.
    const description = err?.error?.description ?? err?.message ?? String(err);
    console.warn(`[recovery-agent] Razorpay Payment Link creation failed (${description}); falling back to a mock link.`);
    const mockId = `plink_mock_${referenceId}`;
    return {
      id: mockId,
      short_url: `https://rzp.io/mock/${mockId}`,
      mock: true,
    };
  }
}
