"use client";

import { Fragment } from "react";
import RetryFlow from "./RetryFlow";

const CATEGORY_STYLES = {
  CARD_ISSUE: "bg-rose-100 text-rose-700",
  INSUFFICIENT_FUNDS: "bg-amber-100 text-amber-700",
  OTP_TIMEOUT: "bg-violet-100 text-violet-700",
  NETWORK_ISSUE: "bg-sky-100 text-sky-700",
  ABANDONED: "bg-slate-200 text-slate-700",
  UNKNOWN: "bg-slate-200 text-slate-700",
};

const PROVIDER_LABEL = {
  claude: "(Claude)",
  groq: "(Groq — Claude fallback)",
  template: "(template — no LLM key set)",
};

const STATUS_STYLES = {
  sent: "bg-slate-100 text-slate-600",
  recovered: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  expired: "bg-slate-200 text-slate-500",
};

function formatAmount(amountPaise, currency) {
  return `${currency} ${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function Badge({ className, children }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

export default function EventsTable({ attempts, expandedId, onToggleExpand, onSetOutcome }) {
  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        No events yet — click "Run next event" to feed a mock webhook through the agent.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Failure</th>
            <th className="px-4 py-3">Action taken</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const isExpanded = expandedId === a.id;
            return (
              <Fragment key={a.id}>
                <tr
                  onClick={() => onToggleExpand(a.id)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{a.customer_name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.product}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAmount(a.amount, a.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge className={CATEGORY_STYLES[a.category] ?? CATEGORY_STYLES.UNKNOWN}>{a.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.action}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLES[a.status] ?? STATUS_STYLES.sent}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === "sent" ? (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSetOutcome(a.id, "recovered")}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Recovered
                        </button>
                        <button
                          onClick={() => onSetOutcome(a.id, "failed")}
                          className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                        >
                          Failed
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {a.resolved_at ? new Date(a.resolved_at).toLocaleString() : "—"}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold uppercase text-slate-500">Why this category</div>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
                            {a.classificationReasoning.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase text-slate-500">Why this action</div>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
                            {a.decisionReasoning.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                        {(a.category === "OTP_TIMEOUT" || a.category === "NETWORK_ISSUE") &&
                          a.action === "INSTANT_RETRY_LINK" && (
                          <div className="md:col-span-2" onClick={(e) => e.stopPropagation()}>
                            <RetryFlow attempt={a} onSetOutcome={onSetOutcome} />
                          </div>
                        )}
                        <div className="md:col-span-2">
                          <div className="text-xs font-semibold uppercase text-slate-500">
                            Recovery message {PROVIDER_LABEL[a.message_provider] ?? "(template)"}
                          </div>
                          <p className="mt-1 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                            {a.message}
                          </p>
                          {a.message_reasoning && (
                            <p className="mt-1 text-xs italic text-slate-500">Reasoning: {a.message_reasoning}</p>
                          )}
                        </div>
                        <div className="md:col-span-2 text-xs text-slate-500">
                          Payment Link:{" "}
                          <a
                            href={a.payment_link_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {a.payment_link_url}
                          </a>{" "}
                          {a.paymentLinkMock && (
                            <span className="text-slate-400">(mock — no Razorpay test keys set, or Razorpay call failed)</span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
