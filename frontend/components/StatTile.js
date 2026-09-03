export default function StatTile({ label, value, accent }) {
  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}
