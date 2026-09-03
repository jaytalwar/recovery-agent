const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

export const fetchEvents = () => request("/api/events");
export const fetchStats = () => request("/api/stats");
export const fetchSimulateStatus = () => request("/api/simulate/status");

export const simulateNext = () => request("/api/simulate/next", { method: "POST" });
export const simulateAll = () => request("/api/simulate/all", { method: "POST" });

export const setOutcome = (id, status) =>
  request(`/api/events/${id}/outcome`, { method: "POST", body: JSON.stringify({ status }) });
