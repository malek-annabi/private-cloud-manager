import { api } from "./client";

export type CyberNewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  description?: string | null;
};

export type CyberNewsResponse = {
  fetchedAt: string;
  sources: string[];
  items: CyberNewsItem[];
};

export const fetchCyberNews = async (limit = 6): Promise<CyberNewsResponse> => {
  const response = await api.get("/news/cyber", {
    params: { limit },
  });

  return response.data;
};
