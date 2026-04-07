import { useQuery } from "@tanstack/react-query";
import { fetchLabStacks } from "../api/labs";

export function useLabStacks() {
  return useQuery({
    queryKey: ["lab-stacks"],
    queryFn: fetchLabStacks,
    refetchInterval: 10_000,
  });
}
