import { api } from "./client";

export type TrafficBucket = {
  bucketStart: string;
  label: string;
  requests: number;
  inboundBytes: number;
  outboundBytes: number;
};

export type TrafficMetricsResponse = {
  hours: number;
  generatedAt: string;
  buckets: TrafficBucket[];
};

export async function fetchTrafficMetrics(hours = 12) {
  const response = await api.get<TrafficMetricsResponse>("/metrics/traffic", {
    params: { hours },
  });

  return response.data;
}
