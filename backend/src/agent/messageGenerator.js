// Generates a personalized recovery message.
//
// Given the classification + decision (with their reasoning trace) and the
// customer/order details, asks an LLM to (a) write a short, on-brand
// recovery message referencing the Payment Link, and (b) state its own
// reasoning for the tone/copy choices it made. Both the deterministic
// reasoning (classifier + decision engine) and the LLM's message-level
// reasoning are persisted together so the dashboard can show the full
// "why" behind every send.
//
// Provider priority: Claude (the assignment's required LLM) if
// ANTHROPIC_API_KEY is set -> Groq (free-tier fallback for local testing
// without Anthropic credits) if only GROQ_API_KEY is set -> a static
// per-action template if neither is set. This keeps Claude as the primary
// path while not blocking on billing during development.

import Anthropic from "@anthropic-ai/sdk";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const anthropicClient = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

const groqKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const activeProvider = anthropicClient ? "claude" : groqKey ? "groq" : "template";
export const isLiveMode = activeProvider !== "template";

const ACTION_COPY_HINT = {
  SWITCH_TO_UPI:
    "Suggest paying via UPI or a wallet instead of the card that failed. Reassure them their order is still held.",
  INSTANT_RETRY_LINK:
    "Encourage an immediate retry — the issue was transient (OTP timeout or a network blip), not their payment method.",
  REMINDER_WITH_DISCOUNT:
    "Gently remind them they left items in checkout, and highlight the time-limited discount as an incentive to finish.",
  MANUAL_REVIEW: "Write a neutral, generic follow-up asking if they'd like help completing their purchase.",
};

function buildPrompt({ context, decision, paymentLink }) {
  const { customerName, product, amount, currency, category } = context;
  const amountDisplay = `${currency} ${(amount / 100).toFixed(2)}`;

  return `You are the recovery-messaging module of "Recovery Agent", an autonomous agent that wins back failed or abandoned Razorpay checkouts.

Customer: ${customerName}
Product: ${product}
Order amount: ${amountDisplay}
Failure category: ${category}
Chosen recovery action: ${decision.action}
Why this action was chosen (deterministic policy reasoning):
${decision.reasoning.map((r) => `- ${r}`).join("\n")}
Payment Link to include: ${paymentLink.short_url}
${decision.discountPercent ? `Discount to mention: ${decision.discountPercent}% off, valid ${decision.linkExpiryMinutes} minutes` : ""}
Copy guidance: ${ACTION_COPY_HINT[decision.action] ?? ACTION_COPY_HINT.MANUAL_REVIEW}

Write a short recovery message (SMS/WhatsApp length, under 320 characters, no markdown) that:
- Uses the customer's first name
- Is warm but not pushy, and never mentions internal error codes
- Includes the Payment Link exactly as given
- Matches the copy guidance above

Respond with ONLY a JSON object, no other text, in this exact shape:
{"message": "<the recovery message>", "reasoning": "<1-2 sentences on why you wrote it this way>"}`;
}

function parseModelJson(text, providerLabel) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return { message: parsed.message, reasoning: parsed.reasoning };
  } catch (err) {
    return {
      message: text.trim(),
      reasoning: `${providerLabel} did not return valid JSON; using raw response text as the message.`,
    };
  }
}

function mockGenerate({ context, decision, paymentLink }) {
  const firstName = context.customerName.split(" ")[0];
  const discountLine = decision.discountPercent
    ? ` Use code SAVE${decision.discountPercent} for ${decision.discountPercent}% off, valid for a limited time.`
    : "";

  const byAction = {
    SWITCH_TO_UPI: `Hi ${firstName}, your payment for ${context.product} didn't go through with that card. Try UPI or a wallet instead — it's quick: ${paymentLink.short_url}`,
    INSTANT_RETRY_LINK: `Hi ${firstName}, that was just a hiccup — your order for ${context.product} is still waiting. Retry here: ${paymentLink.short_url}`,
    REMINDER_WITH_DISCOUNT: `Hi ${firstName}, you left ${context.product} in your cart!${discountLine} Complete it here: ${paymentLink.short_url}`,
    MANUAL_REVIEW: `Hi ${firstName}, we noticed an issue completing your order for ${context.product}. Need a hand? ${paymentLink.short_url}`,
  };

  return {
    message: byAction[decision.action] ?? byAction.MANUAL_REVIEW,
    reasoning: "Generated from a static template (no ANTHROPIC_API_KEY or GROQ_API_KEY set) matching the chosen action's copy guidance.",
  };
}

async function generateWithClaude(prompt) {
  const response = await anthropicClient.messages.create({
    model: anthropicModel,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseModelJson(text, "Claude");
}

async function generateWithGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: groqModel,
      max_tokens: 700,
      // gpt-oss on Groq reasons by default; at "medium"+ it can burn the whole
      // token budget on internal reasoning before writing any output ("length"
      // finish reason, empty content). This is a short copywriting task, not a
      // reasoning-heavy one, so keep effort low and leave headroom either way.
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseModelJson(text, "Groq");
}

/**
 * @param {object} args
 * @param {object} args.context - { customerName, product, amount, currency, category }
 * @param {object} args.decision - output of decisionEngine.decideRecoveryAction
 * @param {object} args.paymentLink - output of razorpay.createRecoveryPaymentLink
 * @returns {Promise<{ message: string, reasoning: string, mock: boolean, provider: string, prompt?: string }>}
 */
export async function generateRecoveryMessage({ context, decision, paymentLink }) {
  const prompt = buildPrompt({ context, decision, paymentLink });

  if (activeProvider === "claude") {
    const result = await generateWithClaude(prompt);
    return { ...result, mock: false, provider: "claude", prompt };
  }

  if (activeProvider === "groq") {
    const result = await generateWithGroq(prompt);
    return { ...result, mock: false, provider: "groq", prompt };
  }

  const result = mockGenerate({ context, decision, paymentLink });
  return { ...result, mock: true, provider: "template", prompt };
}
