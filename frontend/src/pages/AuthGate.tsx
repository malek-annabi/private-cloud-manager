import { useEffect, useState, type ReactNode } from "react";
import AuthScreen from "../components/auth/AuthScreen";
import { getApiToken, setApiToken } from "../api/client";
import { validateToken } from "../api/auth";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "ready">("checking");

  useEffect(() => {
    const existingToken = getApiToken();

    if (!existingToken) {
      setStatus("locked");
      return;
    }

    validateToken(existingToken)
      .then(() => setStatus("ready"))
      .catch(() => {
        setApiToken("");
        setStatus("locked");
      });
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Validating session...
      </div>
    );
  }

  if (status === "locked") {
    return <AuthScreen onAuthenticated={() => setStatus("ready")} />;
  }

  return <>{children}</>;
}
