import { useAudit } from "../hooks/useAudit";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

export default function Audit() {
  const { data = [], isLoading } = useAudit();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <Card className="border-white/10 bg-white/5">
        <div className="space-y-3">
          <Badge label="Traceability" tone="info" />
          <h1 className="text-3xl font-semibold text-white">Audit trail</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Review operator actions and API activity with timestamps, actors,
            resources, and execution metadata from the control plane.
          </p>
        </div>
      </Card>

      <div className="grid gap-4">
        {data.map((event) => (
          <Card key={event.id} className="border-white/10 bg-slate-950/85">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge label={event.action} tone="info" />
                  <span className="text-sm text-slate-400">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>

                <div className="text-sm text-slate-300">
                  <span className="text-slate-500">Actor:</span> {event.actor}
                </div>
                <div className="text-sm text-slate-300">
                  <span className="text-slate-500">Resource:</span> {event.resource}
                </div>
              </div>

              <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                  Metadata
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-300">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </Card>
        ))}

        {data.length === 0 ? (
          <Card className="border-white/10 bg-slate-950/80">
            <p className="text-sm text-slate-400">
              No audit activity yet. Actions taken through the dashboard will
              start appearing here automatically.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
