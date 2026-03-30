import { Link, useLocation } from "react-router-dom";

const items = [
  { name: "VMs", path: "/" },
  { name: "Jobs", path: "/jobs" },
  { name: "Audit", path: "/audit" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950/80 p-6 backdrop-blur xl:flex">
      <div className="rounded-3xl border border-teal-400/20 bg-teal-400/10 p-5">
        <div className="text-xs uppercase tracking-[0.35em] text-teal-200">
          Private Cloud
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Manager
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Local VMware operations with live telemetry, job execution, and AI-ready controls.
        </p>
      </div>

      <nav className="mt-8 space-y-2">
        {items.map((item) => {
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`block rounded-2xl px-4 py-3 text-sm transition ${
                active
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
          Focus
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Track VM state in real time, manage tags, and keep the system ready for stronger auth and policy controls.
        </p>
      </div>
    </aside>
  );
}
