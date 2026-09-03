// Decides the recovery action for a classified failure/abandonment event.
//
// This is the deterministic policy layer: given a Category from classifier.js
// (plus a couple of signals like attempt count), it picks one of a small set
// of recovery actions and logs the reasoning behind that choice.

import { Category } from "./classifier.js";

export const Action = {
  SWITCH_TO_UPI: "SWITCH_TO_UPI",
  INSTANT_RETRY_LINK: "INSTANT_RETRY_LINK",
  REMINDER_WITH_DISCOUNT: "REMINDER_WITH_DISCOUNT",
  MANUAL_REVIEW: "MANUAL_REVIEW",
};

/**
 * @param {object} event - the raw webhook-shaped event
 * @param {{category: string, reasoning: string[], confidence: number}} classification
 * @returns {{ action: string, reasoning: string[], discountPercent: number|null, linkExpiryMinutes: number|null }}
 */
export function decideRecoveryAction(event, classification) {
  const attemptNumber = event.meta?.attempt_number ?? 1;
  const reasoning = [];

  switch (classification.category) {
    case Category.CARD_ISSUE: {
      reasoning.push(
        attemptNumber >= 2
          ? `Card declined ${attemptNumber} times on this order — retrying the same card is unlikely to succeed.`
          : "Card declined by the issuing bank — the card itself is the blocker, not a transient error."
      );
      reasoning.push("Recommending SWITCH_TO_UPI: a UPI/wallet Payment Link avoids the card network entirely.");
      return {
        action: Action.SWITCH_TO_UPI,
        reasoning,
        discountPercent: null,
        linkExpiryMinutes: 60,
      };
    }

    case Category.INSUFFICIENT_FUNDS: {
      reasoning.push("Insufficient funds on the linked card/account at time of payment.");
      reasoning.push(
        "Recommending SWITCH_TO_UPI: customer can pay from a different bank account/UPI app without needing to fund the same card."
      );
      return {
        action: Action.SWITCH_TO_UPI,
        reasoning,
        discountPercent: null,
        linkExpiryMinutes: 120,
      };
    }

    case Category.OTP_TIMEOUT: {
      reasoning.push("Failure happened at the authentication step (OTP timeout/mismatch), not the payment method itself.");
      reasoning.push("Recommending INSTANT_RETRY_LINK: a fresh Payment Link lets the customer retry immediately with a new OTP.");
      return {
        action: Action.INSTANT_RETRY_LINK,
        reasoning,
        discountPercent: null,
        linkExpiryMinutes: 15,
      };
    }

    case Category.NETWORK_ISSUE: {
      reasoning.push("Failure was on the gateway/network side (timeout or server error), unrelated to the customer's payment method.");
      reasoning.push("Recommending INSTANT_RETRY_LINK: the same method will likely succeed once the transient issue clears.");
      return {
        action: Action.INSTANT_RETRY_LINK,
        reasoning,
        discountPercent: null,
        linkExpiryMinutes: 30,
      };
    }

    case Category.ABANDONED: {
      reasoning.push("No payment was ever attempted — this is checkout drop-off, not a technical failure.");
      reasoning.push(
        "Recommending REMINDER_WITH_DISCOUNT: a time-limited incentive gives the customer a reason to come back and complete checkout."
      );
      return {
        action: Action.REMINDER_WITH_DISCOUNT,
        reasoning,
        discountPercent: 10,
        linkExpiryMinutes: 24 * 60,
      };
    }

    default: {
      reasoning.push(`Category "${classification.category}" has no automated policy — routing to MANUAL_REVIEW.`);
      return {
        action: Action.MANUAL_REVIEW,
        reasoning,
        discountPercent: null,
        linkExpiryMinutes: null,
      };
    }
  }
}
