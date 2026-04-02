import { Link, useLocation } from "react-router-dom";

const items = [
  { name: "VMs", path: "/" },
  { name: "Jobs", path: "/jobs" },
  { name: "Audit", path: "/audit" },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/10 bg-slate-950/80 p-4 backdrop-blur transition-[width] duration-300 xl:flex ${
        collapsed ? "w-24" : "w-72"
      }`}
    >
      <div className={`flex ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <div className={`rounded-3xl border border-teal-400/20 bg-teal-400/10 p-5 ${collapsed ? "mt-4 text-center" : "mt-4"}`}>
        <div className="text-xs uppercase tracking-[0.35em] text-teal-200">
          {collapsed ? "PCM" : "Private Cloud"}
        </div>
        <h1 className={`font-semibold text-white ${collapsed ? "mt-3 text-lg" : "mt-3 text-2xl"}`}>
          {collapsed ? "Mgr" : "Manager"}
        </h1>
        {!collapsed ? (
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Local VMware operations with live telemetry, job execution, and AI-ready controls.
          </p>
        ) : null}
      </div>

      <nav className="mt-8 space-y-2">
        {items.map((item) => {
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.name}
              className={`block rounded-2xl px-4 py-3 text-sm transition ${
                active
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-white/5"
              } ${collapsed ? "text-center" : ""}`}
            >
              {collapsed ? item.name.slice(0, 1) : item.name}
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
            Focus
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Track VM state in real time, manage tags, and keep the system ready for stronger auth and policy controls.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
