import { useQuery } from "@tanstack/react-query";

import { fetchTrafficMetrics } from "../api/metrics";

export function useTrafficMetrics(hours = 12) {
  return useQuery({
    queryKey: ["traffic-metrics", hours],
    queryFn: () => fetchTrafficMetrics(hours),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
