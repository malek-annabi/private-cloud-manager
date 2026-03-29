import { api } from "./client";

export const fetchJobs = async () => {
  const res = await api.get("/jobs");
  return res.data;
};

export const startVM = (vmId: string) =>
  api.post("/jobs/start-vm", { vmId });

export const stopVM = (vmId: string) =>
  api.post("/jobs/stop-vm", { vmId });

export const sshExec = (vmId: string, command: string) =>
  api.post("/jobs/ssh", { vmId, command });

export const releaseJob = (jobId: string) =>
  api.post(`/jobs/${jobId}/release`);

export const cancelJob = (jobId: string) =>
  api.post(`/jobs/${jobId}/cancel`);

export const fetchJobDetail = async (jobId: string) => {
  const res = await api.get(`/jobs/${jobId}`);
  return res.data;
};