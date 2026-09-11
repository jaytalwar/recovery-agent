import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "recovery_agent.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS recovery_attempts (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    email TEXT,
    contact TEXT,
    product TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    category TEXT NOT NULL,
    classification_reasoning TEXT NOT NULL,
    action TEXT NOT NULL,
    decision_reasoning TEXT NOT NULL,
    discount_percent INTEGER,
    payment_link_id TEXT,
    payment_link_url TEXT,
    payment_link_mock INTEGER NOT NULL DEFAULT 0,
    link_expiry_minutes INTEGER,
    message TEXT,
    message_reasoning TEXT,
    message_mock INTEGER NOT NULL DEFAULT 0,
    message_provider TEXT NOT NULL DEFAULT 'template',
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved_at TEXT
  )
`);
