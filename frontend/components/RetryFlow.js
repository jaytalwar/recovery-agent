"use client";

// Step-by-step retry timeline shown for attempts recovered via a fresh
// Payment Link — OTP timeout or a transient network/gateway error, both of
// which use the INSTANT_RETRY_LINK action. Tracks the link's expiry window
// so a stale, un-retried link can be flagged separately from a genuine
// "customer tried and it failed" outcome.

const CATEGORY_LABEL = {
  OTP_TIMEOUT: "OTP authentication timed out before the customer could confirm",
  NETWORK_ISSUE: "Gateway/network error interrupted the payment",
};

const FLOW_TITLE = {
  OTP_TIMEOUT: "OTP timeout retry flow",
  NETWORK_ISSUE: "Network issue retry flow",
};

function minutesBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function Step({ tone, title, detail }) {
  const dot = {
    done: "bg-emerald-500",
    pending: "bg-amber-400",
    warn: "bg-rose-500",
    neutral: "bg-slate-300",
  }[tone];

  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${dot}`} />
      <div>
        <div className="text-sm font-medium text-slate-800">{title}</div>
        {detail && <div className="text-xs text-slate-500">{detail}</div>}
      </div>
    </li>
  );
}

export default function RetryFlow({ attempt, onSetOutcome }) {
  const createdAt = new Date(attempt.created_at);
  const now = new Date();
  const expiryMinutes = attempt.link_expiry_minutes;
  const expiresAt = expiryMinutes ? new Date(createdAt.getTime() + expiryMinutes * 60000) : null;
  const isExpired = expiresAt ? now > expiresAt : false;
  const minutesLeft = expiresAt ? minutesBetween(now, expiresAt) : null;

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
        {FLOW_TITLE[attempt.category] ?? "Retry flow"}
      </div>
      <ol className="space-y-2.5">
        <Step
          tone="done"
          title="Original payment failed"
          detail={CATEGORY_LABEL[attempt.category] ?? "Payment did not complete"}
        />
        <Step
          tone="done"
          title="Fresh Payment Link generated"
          detail={
            expiryMinutes
              ? `Valid ${expiryMinutes} min — ${isExpired ? "expired" : `${minutesLeft} min left`}`
              : "No expiry window recorded"
          }
        />
        <Step tone="done" title="Recovery message sent" detail="Delivered via WhatsApp (mocked)" />

        {attempt.status === "sent" && !isExpired && (
          <Step tone="pending" title="Waiting for customer to retry" detail="Link is still live">
          </Step>
        )}
        {attempt.status === "sent" && isExpired && (
          <Step tone="warn" title="Link expired without a retry" detail="Customer never completed the retry" />
        )}
        {attempt.status === "recovered" && (
          <Step tone="done" title="Customer retried successfully" detail="Payment recovered" />
        )}
        {attempt.status === "failed" && (
          <Step tone="warn" title="Customer retried, payment failed again" />
        )}
        {attempt.status === "expired" && <Step tone="neutral" title="Retry link expired" />}
      </ol>

      <div className="mt-3 flex gap-2">
        <a
          href={attempt.payment_link_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open retry link ↗
        </a>
        {attempt.status === "sent" && isExpired && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetOutcome(attempt.id, "expired");
            }}
            className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            Mark expired
          </button>
        )}
      </div>
    </div>
  );
}
