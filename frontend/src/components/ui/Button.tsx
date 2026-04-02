export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const classes = {
    primary:
      "bg-teal-400 text-slate-950 hover:bg-teal-300",
    secondary:
      "bg-slate-800 text-slate-100 hover:bg-slate-700",
    ghost:
      "bg-transparent text-slate-200 ring-1 ring-white/10 hover:bg-white/5",
    danger:
      "bg-rose-500/90 text-white hover:bg-rose-400",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${classes[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
