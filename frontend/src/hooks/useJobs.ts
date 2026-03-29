import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "../api/jobs";
import { fetchJobDetail } from "../api/jobs";

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
    refetchInterval: 2000,
  });
}

export function useJobDetail(jobId: string) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJobDetail(jobId),
    refetchInterval: 2000,
  });
}