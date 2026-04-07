import { api } from "./client";

export type LabStackTone = "info" | "danger" | "neutral" | "success";

export type LabStack = {
  id: string;
  name: string;
  fireLabel: string;
  stopLabel: string;
  description: string;
  vmIds: string[];
  tone: LabStackTone;
  gatewayVmId?: string | null;
  includeGatewayOnStart: boolean;
};

export type LabStackPayload = {
  id: string;
  name: string;
  fireLabel?: string;
  stopLabel?: string;
  description?: string;
  vmIds: string[];
  tone: LabStackTone;
  gatewayVmId?: string | null;
  includeGatewayOnStart: boolean;
};

export const fetchLabStacks = async (): Promise<LabStack[]> => {
  const res = await api.get("/labs");
  return res.data;
};

export const createLabStack = async (payload: LabStackPayload): Promise<LabStack> => {
  const res = await api.post("/labs", payload);
  return res.data;
};

export const updateLabStack = async (
  labId: string,
  payload: Omit<LabStackPayload, "id">,
): Promise<LabStack> => {
  const res = await api.patch(`/labs/${labId}`, payload);
  return res.data;
};

export const deleteLabStack = async (labId: string) => {
  await api.delete(`/labs/${labId}`);
};
