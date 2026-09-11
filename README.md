# Recovery Agent

An autonomous AI agent that recovers failed and abandoned Razorpay checkouts —
built for the **Razorpay AI Builder Internship 2026, Track 1 (AI Growth &
Agentic Commerce)**.

## The problem

A meaningful share of Razorpay transactions never complete: cards get
declined, OTPs time out, networks drop mid-payment, or customers simply
abandon checkout before attempting to pay. Today, recovering that revenue is
either manual (someone notices and follows up) or doesn't happen at all.
Merchants lose GMV, and customers who *wanted* to buy never get a nudge to
finish.

Recovery Agent watches the payment event stream, figures out **why** each
payment failed or stalled, and autonomously decides and executes a tailored
recovery action — a fresh Payment Link, a channel switch, or a time-limited
incentive — instead of leaving that revenue on the table.

## How the agent reasons and acts

Every event goes through four stages, and each stage's reasoning is logged
and persisted so it can be inspected on the dashboard — this is deliberate:
a judge (or a merchant) should be able to see *why* the agent did what it
did, not just that it did something.

1. **Classify** ([`backend/src/agent/classifier.js`](backend/src/agent/classifier.js)) —
   a rule-based classifier maps the event's `error_code` / `error_reason`
   (plus attempt count, for repeated card declines) to one of five failure
   categories: `CARD_ISSUE`, `INSUFFICIENT_FUNDS`, `OTP_TIMEOUT`,
   `NETWORK_ISSUE`, `ABANDONED`. It emits a plain-English reasoning trace for
   every decision.

2. **Decide** ([`backend/src/agent/decisionEngine.js`](backend/src/agent/decisionEngine.js)) —
   a small deterministic policy maps category → recovery action:

   | Category | Action | Why |
   |---|---|---|
   | `CARD_ISSUE` | Switch to UPI/wallet | Retrying the same card is unlikely to work |
   | `INSUFFICIENT_FUNDS` | Switch to UPI/wallet | Let the customer pay from a different source |
   | `OTP_TIMEOUT` | Instant retry, fresh Payment Link | The blocker was auth, not the payment method |
   | `NETWORK_ISSUE` | Instant retry, fresh Payment Link | Transient gateway/network failure |
   | `ABANDONED` | Reminder + time-limited discount | No attempt was made — needs an incentive, not a retry |

3. **Create the Payment Link** ([`backend/src/api/razorpay.js`](backend/src/api/razorpay.js)) —
   a real Razorpay **test-mode** Payment Link is created via the Razorpay
   Node SDK, sized and expiry-tuned to the chosen action (e.g. a 20-minute
   expiry for an OTP-timeout retry vs. 24 hours for an abandoned-cart
   reminder).

4. **Generate and send the message** ([`backend/src/agent/messageGenerator.js`](backend/src/agent/messageGenerator.js)) —
   the Claude API writes a short, personalized recovery message referencing
   the customer's name, product, and the Payment Link, following copy
   guidance specific to the chosen action. Claude also returns its own
   one-line reasoning for the tone/copy it chose, which is stored alongside
   the classifier's and decision engine's reasoning. The message is then
   "sent" (mocked via console log — see below) and every field is persisted
   to SQLite for the dashboard.

## Architecture

```
                         ┌─────────────────────────────┐
                         │   Mock Razorpay webhook feed │
                         │  backend/fixtures/*.json     │
                         │  (payment.failed / abandoned)│
                         └───────────────┬───────────────┘
                                         │ POST /api/simulate/next|all
                                         ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          backend (Node.js + Express)                   │
│                                                                         │
│   agent/pipeline.js  ── orchestrates one event through:                │
│                                                                         │
│    1. agent/classifier.js      rule-based → failure category + why     │
│    2. agent/decisionEngine.js  category → recovery action + why        │
│    3. api/razorpay.js          Razorpay SDK → test-mode Payment Link   │
│    4. agent/messageGenerator.js Claude API → personalized message + why│
│    5. console.log(...)         "send" the message (mock channel)       │
│    6. db/store.js              persist attempt + full reasoning trace  │
│                                                                         │
│   routes/events.js    GET /api/events, /api/stats,                     │
│                        POST /api/events/:id/outcome                    │
│   routes/simulate.js  POST /api/simulate/next|all (drives the feed)    │
│                                                                         │
│   db/  SQLite (better-sqlite3) — backend/data/recovery_agent.sqlite    │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │ REST (fetch, polled every 5s)
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     frontend (Next.js + Tailwind)                      │
│  Dashboard: stat tiles (attempts / recovered / success rate / GMV)     │
│  + live table: event → category → action → message → outcome,         │
│  each row expandable to show the full reasoning trace                 │
└───────────────────────────────────────────────────────────────────────┘
```

## What's simulated vs. real

| Piece | Status |
|---|---|
| Payment failure/abandonment events | **Simulated** — JSON fixtures in [`backend/fixtures/payment_events.json`](backend/fixtures/payment_events.json), modeled on Razorpay's documented `payment.failed` webhook payload shape (`error_code`, `error_reason`, `error_source`, `error_step`, etc). `order.abandoned` is a synthetic event type: Razorpay doesn't emit a real "cart abandoned" webhook, so it's modeled here as an `order.created` order with zero payment attempts, to represent checkout drop-off. Fed into the agent one at a time via the dashboard's "Run next event" button, standing in for a live webhook listener. |
| Classification + decision logic | **Real** — deterministic rules, unit-tested against the fixtures (`npm test` in `backend/`, 15 tests). |
| Razorpay Payment Link creation | **Real when test keys are set** — uses the actual Razorpay Node SDK in test mode. Without `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` in `backend/.env`, falls back to a mock link (`https://rzp.io/mock/...`) so the full pipeline still runs. |
| Recovery message generation | **Real when an API key is set** — calls the Claude API (`@anthropic-ai/sdk`) with the classification, decision, and reasoning as context. Without `ANTHROPIC_API_KEY`, falls back to a static per-action template so the pipeline still runs. |
| Sending the message | **Simulated** — logged to the backend console (`[recovery-agent] sending whatsapp to ...`) rather than hitting a real WhatsApp/email/SMS API. Swapping in a real channel only requires replacing `sendMessage()` in `backend/src/agent/pipeline.js`. |
| Outcome tracking (recovered / failed) | **Manual, via dashboard buttons** — stands in for a real webhook confirming the retried payment succeeded. In production this would be driven by a second `payment.captured` webhook tied back to the same `reference_id`. |
| Storage | **Real** — SQLite via `better-sqlite3`, on disk at `backend/data/recovery_agent.sqlite` (gitignored). |

## Running it locally

Requires Node.js 18+.

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in RAZORPAY_KEY_ID/SECRET and ANTHROPIC_API_KEY to go live; leave blank for mock mode
npm test                # 15 unit tests for the classifier + decision engine
npm start                # http://localhost:4000
```

```bash
# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env    # NEXT_PUBLIC_API_URL, defaults to http://localhost:4000
npm run dev               # http://localhost:3000
```

Open `http://localhost:3000`, click **Run next event** (or **Run all**) to
feed the mock webhook stream through the agent, expand a row to see the
reasoning trace and generated message, and use the **Recovered / Failed**
buttons to record outcomes and watch the stat tiles update.

### Getting real Razorpay test-mode Payment Links

1. Sign up / log in at [dashboard.razorpay.com](https://dashboard.razorpay.com), switch to **Test Mode**.
2. Settings → API Keys → generate a test key pair.
3. Put `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `backend/.env`.
4. Restart the backend — new recovery attempts will now create real
   test-mode Payment Links you can open and pay against with Razorpay's
   [test card/UPI numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/).

### Getting Claude-generated messages

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Put `ANTHROPIC_API_KEY` in `backend/.env` (optionally override
   `ANTHROPIC_MODEL`, default `claude-sonnet-5`).
3. Restart the backend — new recovery attempts will use Claude-written
   messages instead of the static templates.

## Project structure

```
recovery-agent/
├── backend/
│   ├── src/
│   │   ├── agent/       # classifier, decision engine, Claude message generator, pipeline
│   │   ├── api/          # Razorpay Payment Links integration
│   │   ├── db/            # SQLite schema + queries
│   │   ├── routes/         # Express routes (events, stats, simulate)
│   │   └── server.js
│   ├── fixtures/          # mock Razorpay webhook events
│   └── tests/               # unit tests for agent/
└── frontend/
    ├── app/                 # Next.js App Router pages
    ├── components/           # StatTile, EventsTable
    └── lib/                    # API client
```
