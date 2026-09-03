"use client";

import { useCallback, useEffect, useState } from "react";
import StatTile from "../components/StatTile";
import EventsTable from "../components/EventsTable";
import { fetchEvents, fetchStats, fetchSimulateStatus, simulateNext, simulateAll, setOutcome } from "../lib/api";

function formatGmv(paise) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState({ attempts: 0, recovered: 0, gmvRecoveredPaise: 0, successRate: 0 });
  const [simStatus, setSimStatus] = useState({ totalEvents: 0, remaining: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [events, statsData, sim] = await Promise.all([fetchEvents(), fetchStats(), fetchSimulateStatus()]);
      setAttempts(events);
      setStats(statsData);
      setSimStatus(sim);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function runAction(fn) {
    setLoading(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Recovery Agent</h1>
          <p className="mt-1 text-sm text-slate-500">
            Autonomous recovery for failed &amp; abandoned Razorpay payments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={loading || simStatus.remaining === 0}
            onClick={() => runAction(simulateNext)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Run next event ({simStatus.remaining} left)
          </button>
          <button
            disabled={loading || simStatus.remaining === 0}
            onClick={() => runAction(simulateAll)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Run all
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error} — is the backend running on the configured NEXT_PUBLIC_API_URL?
        </div>
      )}

      <div className="mb-8 flex gap-4">
        <StatTile label="Recovery attempts" value={stats.attempts} />
        <StatTile label="Recovered" value={stats.recovered} accent="text-emerald-600" />
        <StatTile
          label="Success rate"
          value={`${(stats.successRate * 100).toFixed(1)}%`}
          accent="text-sky-600"
        />
        <StatTile label="GMV recovered" value={formatGmv(stats.gmvRecoveredPaise)} accent="text-emerald-600" />
      </div>

      <EventsTable
        attempts={attempts}
        expandedId={expandedId}
        onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
        onSetOutcome={(id, status) => runAction(() => setOutcome(id, status))}
      />
    </main>
  );
}
