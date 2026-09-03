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

  const expireBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

  const link = await client.paymentLink.create({
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
  });

  return { id: link.id, short_url: link.short_url, mock: false };
}
