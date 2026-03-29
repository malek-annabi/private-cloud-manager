import { useParams } from "react-router-dom";
import { useJobDetail } from "../hooks/useJobs";
import { JobStatusBadge } from "../components/jobs/JobStatusBadge";

export default function JobDetail() {
  const { id } = useParams();
  const { data, isLoading } = useJobDetail(id!);

  if (isLoading) return <div>Loading...</div>;

  const { job, logs } = data;

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Job Detail</h1>

      <div className="mb-4">
        <div>ID: {job.id}</div>
        <div>Type: {job.type}</div>
        <div>
          Status: <JobStatusBadge status={job.status} />
        </div>
      </div>

      <div className="bg-black p-4 rounded border border-gray-800 text-sm font-mono h-[400px] overflow-y-auto">
        {logs.map((log: any) => (
          <div key={log.id} className="mb-1">
            <span className="text-gray-500">
              [{new Date(log.createdAt).toLocaleTimeString()}]
            </span>{" "}
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}