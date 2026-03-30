import { useQuery } from "@tanstack/react-query";
import { fetchAuditEvents } from "../api/audit";

export function useAudit() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: fetchAuditEvents,
    refetchInterval: 3000,
  });
}
