import { useParams } from "react-router-dom";
import { useJobDetail } from "../hooks/useJobs";
import { JobStatusBadge } from "../components/jobs/JobStatusBadge";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

export default function JobDetail() {
  const { id } = useParams();
  const { data, isLoading, refetch, isFetching } = useJobDetail(id!);

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>Job detail unavailable.</div>;

  const { job, logs } = data;

  return (
    <div className="space-y-6 p-6">
      <Card className="border-white/10 bg-white/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge label="Execution detail" tone="info" />
            <h1 className="text-3xl font-semibold text-white">Job detail</h1>
            <p className="text-sm text-slate-300">{job.id}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
      </Card>

      <Card className="border-white/10 bg-slate-950/80">
        <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Type" value={job.type} />
          <Metric label="Created" value={formatDateTime(job.createdAt)} />
          <Metric label="Updated" value={formatDateTime(job.updatedAt)} />
          <Metric label="Status" value={job.status} />
        </div>
      </Card>

      <Card className="border-white/10 bg-slate-950/90">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Job logs
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Execution timeline
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge label={`${logs.length} log entries`} tone="neutral" />
            <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing..." : "Refresh logs"}
            </Button>
          </div>
        </div>

        <div className="h-[460px] overflow-y-auto rounded-2xl border border-white/10 bg-black/80 p-4 text-sm font-mono">
          {logs.map((log) => (
            <div key={log.id} className="mb-3 border-b border-white/5 pb-3 last:border-b-0">
              <div className="text-slate-500">
                [{new Date(log.createdAt).toLocaleTimeString()}] {log.level}
              </div>
              <div className="mt-1 text-slate-100">{log.message}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm text-white">{value}</div>
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
