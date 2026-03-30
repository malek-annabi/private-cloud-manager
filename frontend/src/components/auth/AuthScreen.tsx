import { useState, type FormEvent } from "react";
import { validateToken } from "../../api/auth";

type AuthScreenProps = {
  onAuthenticated: (token: string) => void;
};

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!token.trim()) {
      setError("Please enter your API token.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await validateToken(token.trim());
      onAuthenticated(token.trim());
    } catch {
      setError("Authentication failed. Check the token and backend status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.28),_transparent_35%),linear-gradient(160deg,_#07111f_0%,_#08131a_48%,_#04070c_100%)] text-slate-100">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:36px_36px] opacity-30" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-teal-200">
              Private Cloud Manager
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-white">
                Local VMware operations with a real control plane.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Operate your lab through a dedicated dashboard, monitor job history,
                open SSH sessions from the browser, and prepare the platform for
                safe AI-assisted operations.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Realtime polling", value: "VM + job refresh" },
                { label: "Secure entry", value: "Token-gated API access" },
                { label: "AI-ready", value: "OpenClaw tool layer" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_rgba(8,15,23,0.25)] backdrop-blur"
                >
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-100">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 shadow-[0_35px_90px_rgba(2,8,23,0.5)] backdrop-blur-xl"
          >
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.25em] text-teal-200">
                Web Access
              </div>
              <h2 className="text-3xl font-semibold text-white">
                Authenticate the interface
              </h2>
              <p className="text-sm leading-7 text-slate-400">
                Enter the backend API token. You can rotate it later without
                changing the UI flow.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              <label className="text-sm text-slate-300" htmlFor="token">
                API token
              </label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Enter bearer token"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-slate-100 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/20"
              />
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Validating..." : "Unlock dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
