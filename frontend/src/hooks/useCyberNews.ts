import { useQuery } from "@tanstack/react-query";
import { fetchCyberNews } from "../api/news";

export function useCyberNews(limit = 6) {
  return useQuery({
    queryKey: ["cyber-news", limit],
    queryFn: () => fetchCyberNews(limit),
    refetchInterval: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
  });
}
