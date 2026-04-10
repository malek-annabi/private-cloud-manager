import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={`rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_25px_80px_rgba(2,8,23,0.35)] backdrop-blur transition-all duration-300 ease-smooth hover:border-white/20 hover:shadow-[0_25px_100px_rgba(20,184,166,0.15)] hover:-translate-y-1 ${className}`}
    >
      {children}
    </div>
  );
}
