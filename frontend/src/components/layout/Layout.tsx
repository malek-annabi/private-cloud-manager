import type { ReactNode } from "react";
import Sidebar from "./Sidebar";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.18),_transparent_32%),linear-gradient(180deg,_#08131a_0%,_#030712_100%)] text-slate-100">
      <Sidebar />

      <main className="relative flex-1 overflow-y-auto">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:36px_36px] opacity-30" />
        <div className="relative">
          {children}
        </div>
      </main>
    </div>
  );
}
