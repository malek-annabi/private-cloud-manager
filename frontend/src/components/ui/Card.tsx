import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_25px_80px_rgba(2,8,23,0.35)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
