export function Badge({
  label,
  tone = "neutral",
  onClick,
}: {
  label: string;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  onClick?: () => void;
}) {
  const tones = {
    neutral: "bg-slate-800 text-slate-200 ring-1 ring-white/10 hover:ring-white/20 hover:bg-slate-700",
    success: "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/20 hover:ring-emerald-400/40 hover:bg-emerald-400/25",
    danger: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/20 hover:ring-rose-400/40 hover:bg-rose-400/25",
    warning: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/20 hover:ring-amber-400/40 hover:bg-amber-400/25",
    info: "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/20 hover:ring-cyan-400/40 hover:bg-cyan-400/25",
  };

  const className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-smooth ${tones[tone]} ${
    onClick ? "cursor-pointer hover:scale-105 active:scale-95" : ""
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}
