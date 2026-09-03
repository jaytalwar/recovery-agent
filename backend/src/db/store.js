import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const insertStmt = db.prepare(`
  INSERT INTO recovery_attempts (
    id, event_id, event_type, customer_name, email, contact, product,
    amount, currency, category, classification_reasoning, action,
    decision_reasoning, discount_percent, payment_link_id, payment_link_url,
    payment_link_mock, link_expiry_minutes, message, message_reasoning, message_mock, status
  ) VALUES (
    @id, @event_id, @event_type, @customer_name, @email, @contact, @product,
    @amount, @currency, @category, @classification_reasoning, @action,
    @decision_reasoning, @discount_percent, @payment_link_id, @payment_link_url,
    @payment_link_mock, @link_expiry_minutes, @message, @message_reasoning, @message_mock, @status
  )
`);

export function saveRecoveryAttempt(record) {
  const id = randomUUID();
  insertStmt.run({
    id,
    event_id: record.eventId,
    event_type: record.eventType,
    customer_name: record.customerName,
    email: record.email ?? null,
    contact: record.contact ?? null,
    product: record.product ?? null,
    amount: record.amount,
    currency: record.currency ?? "INR",
    category: record.category,
    classification_reasoning: JSON.stringify(record.classificationReasoning),
    action: record.action,
    decision_reasoning: JSON.stringify(record.decisionReasoning),
    discount_percent: record.discountPercent ?? null,
    payment_link_id: record.paymentLinkId ?? null,
    payment_link_url: record.paymentLinkUrl ?? null,
    payment_link_mock: record.paymentLinkMock ? 1 : 0,
    link_expiry_minutes: record.linkExpiryMinutes ?? null,
    message: record.message ?? null,
    message_reasoning: record.messageReasoning ?? null,
    message_mock: record.messageMock ? 1 : 0,
    status: record.status ?? "sent",
  });
  return id;
}

function parseRow(row) {
  if (!row) return row;
  return {
    ...row,
    classificationReasoning: JSON.parse(row.classification_reasoning),
    decisionReasoning: JSON.parse(row.decision_reasoning),
    paymentLinkMock: Boolean(row.payment_link_mock),
    messageMock: Boolean(row.message_mock),
  };
}

export function listRecoveryAttempts() {
  const rows = db.prepare("SELECT * FROM recovery_attempts ORDER BY created_at DESC").all();
  return rows.map(parseRow);
}

export function getRecoveryAttempt(id) {
  return parseRow(db.prepare("SELECT * FROM recovery_attempts WHERE id = ?").get(id));
}

const updateStatusStmt = db.prepare(`
  UPDATE recovery_attempts
  SET status = @status, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = @id
`);

export function setRecoveryOutcome(id, status) {
  updateStatusStmt.run({ id, status });
  return getRecoveryAttempt(id);
}

export function getStats() {
  const attempts = db.prepare("SELECT COUNT(*) AS n FROM recovery_attempts").get().n;
  const recovered = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS gmv FROM recovery_attempts WHERE status = 'recovered'")
    .get();

  return {
    attempts,
    recovered: recovered.n,
    gmvRecoveredPaise: recovered.gmv,
    successRate: attempts > 0 ? recovered.n / attempts : 0,
  };
}
