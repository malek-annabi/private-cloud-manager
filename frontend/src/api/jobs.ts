import { api } from "./client";

export type JobRecord = {
  id: string;
  type: string;
  status: string;
  payload: string;
  result?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobLogRecord = {
  id: string;
  jobId: string;
  message: string;
  level: string;
  createdAt: string;
};

export const fetchJobs = async (): Promise<JobRecord[]> => {
  const res = await api.get("/jobs");
  return res.data;
};

export const startVM = (vmId: string) =>
  api.post("/jobs/start-vm", { vmId });

export const stopVM = (
  vmId: string,
  options?: { overrideCriticalInfrastructure?: boolean },
) => api.post("/jobs/stop-vm", { vmId, ...options });

export const updateVM = (
  vmId: string,
  options?: { mode?: "security" | "full"; autoremove?: boolean },
) => api.post("/jobs/update-vm", { vmId, ...options });

export const sshExec = (vmId: string, command: string) =>
  api.post("/jobs/ssh", { vmId, command });

export const releaseJob = (jobId: string) =>
  api.post(`/jobs/${jobId}/release`);

export const cancelJob = (jobId: string) =>
  api.post(`/jobs/${jobId}/cancel`);

export const fetchJobDetail = async (
  jobId: string,
): Promise<{ job: JobRecord; logs: JobLogRecord[] }> => {
  const res = await api.get(`/jobs/${jobId}`);
  return res.data;
};
