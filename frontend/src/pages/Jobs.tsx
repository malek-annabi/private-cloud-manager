import { useJobs } from "../hooks/useJobs";
import { JobStatusBadge } from "../components/jobs/JobStatusBadge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { releaseJob, cancelJob } from "../api/jobs";
import { Link } from "react-router-dom";

export default function Jobs() {
  const { data = [], isLoading, refetch } = useJobs();

  if (isLoading) return <div>Loading...</div>;

  const handleRelease = async (id: string) => {
    await releaseJob(id);
    refetch();
  };

  const handleCancel = async (id: string) => {
    await cancelJob(id);
    refetch();
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="border-white/10 bg-white/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Badge label="Execution stream" tone="info" />
            <h1 className="text-3xl font-semibold text-white">Job activity</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Track queued, running, held, and completed operations with time
              context and direct links into each execution record.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            Showing <span className="text-white">{data.length}</span> recent jobs
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {data.map((job) => (
          <Card key={job.id} className="border-white/10 bg-slate-950/80">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <JobStatusBadge status={job.status} />
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    {job.type}
                  </span>
                </div>

                <div>
                  <Link
                    to={`/jobs/${job.id}`}
                    className="text-xl font-semibold text-white transition hover:text-teal-300"
                  >
                    {job.id}
                  </Link>
                </div>

                <div className="grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                  <div>
                    Created:{" "}
                    <span className="text-slate-200">
                      {formatDateTime(job.createdAt)}
                    </span>
                  </div>
                  <div>
                    Updated:{" "}
                    <span className="text-slate-200">
                      {formatDateTime(job.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {job.status === "HELD" ? (
                  <>
                    <Button onClick={() => handleRelease(job.id)}>Release</Button>
                    <Button variant="danger" onClick={() => handleCancel(job.id)}>
                      Cancel
                    </Button>
                  </>
                ) : null}

                {job.status === "RUNNING" ? (
                  <Badge label="Executing..." tone="warning" />
                ) : null}

                {job.status === "FAILED" ? (
                  <Badge label="Needs attention" tone="danger" />
                ) : null}
              </div>
            </div>
          </Card>
        ))}
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
