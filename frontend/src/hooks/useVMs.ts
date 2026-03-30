import { useQuery } from "@tanstack/react-query";
import { fetchVMs } from "../api/vms";

export function useVMs() {
  return useQuery({
    queryKey: ["vms"],
    queryFn: fetchVMs,
    refetchInterval: 3000,
  });
}
