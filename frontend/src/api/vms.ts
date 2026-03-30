import { api } from "./client";

export type VmRecord = {
  id: string;
  name: string;
  type: "PERSISTENT" | "TEMPLATE" | "EPHEMERAL";
  powerState: "ON" | "OFF" | "UNKNOWN";
  tags: string[];
  lastSeenOnlineAt?: string | null;
  lastSshLoginAt?: string | null;
  osFamily?: string | null;
  osVersion?: string | null;
  lastUpdatedAt?: string | null;
  rebootRequired?: boolean;
  vmxPath: string;
  sshHost?: string | null;
  sshPort?: number | null;
  sshUser?: string | null;
};

export const fetchVMs = async (): Promise<VmRecord[]> => {
  const res = await api.get("/vms");
  return res.data;
};

export const updateVmTags = async (vmId: string, tags: string[]) => {
  const res = await api.patch(`/vms/${vmId}/tags`, { tags });
  return res.data;
};

export const updateVmConnection = async (
  vmId: string,
  connection: {
    sshHost: string;
    sshPort: number | null;
    sshUser: string;
  },
) => {
  const res = await api.patch(`/vms/${vmId}/connection`, connection);
  return res.data;
};

export const checkVmSshReady = async (vmId: string): Promise<boolean> => {
  const res = await api.get(`/vms/${vmId}/ssh-ready`);
  return Boolean(res.data?.ready);
};
