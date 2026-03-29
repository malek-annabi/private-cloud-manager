import { useJobs } from "../hooks/useJobs";
import { JobStatusBadge } from "../components/jobs/JobStatusBadge";
import { Button } from "../components/ui/Button";
import { releaseJob, cancelJob } from "../api/jobs";
import { Link } from "react-router-dom";

export default function Jobs() {
  const { data, isLoading, refetch } = useJobs();

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
    <div className="p-4">
      <h1 className="text-xl mb-4">Jobs</h1>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {data.map((job: any) => (
            <tr key={job.id} className="border-b border-gray-800">
              <td>
  <Link
    to={`/jobs/${job.id}`}
    className="text-blue-400 hover:underline"
  >
    {job.id.slice(0, 8)}
  </Link>
</td>
              <td>{job.type}</td>

              <td>
                <JobStatusBadge status={job.status} />
              </td>

              <td className="space-x-2">
                {job.status === "HELD" && (
                  <>
                    <Button onClick={() => handleRelease(job.id)}>
                      Release
                    </Button>

                    <Button onClick={() => handleCancel(job.id)}>
                      Cancel
                    </Button>
                  </>
                )}

                {job.status === "RUNNING" && (
                  <span className="text-yellow-400 text-xs">
                    Executing...
                  </span>
                )}

                {job.status === "FAILED" && (
                  <span className="text-red-400 text-xs">
                    Failed
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}