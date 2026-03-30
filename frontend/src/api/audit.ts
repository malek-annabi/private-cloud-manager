import { api } from "./client";

export type AuditEventRecord = {
  id: string;
  action: string;
  actor: string;
  resource: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function fetchAuditEvents(): Promise<AuditEventRecord[]> {
  const response = await api.get("/audit");
  return response.data;
}
