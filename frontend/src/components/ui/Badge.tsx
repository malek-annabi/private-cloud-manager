export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
}) {
  const tones = {
    neutral: "bg-slate-800 text-slate-200 ring-1 ring-white/10",
    success: "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/20",
    danger: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/20",
    warning: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/20",
    info: "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/20",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {label}
    </span>
  );
}
