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
  isCriticalInfrastructure?: boolean;
  vmxPath: string;
  vmFolderPath?: string | null;
  sshHost?: string | null;
  sshPort?: number | null;
  sshUser?: string | null;
  workstationGuestId?: string | null;
  workstationCpuCount?: number | null;
  workstationMemoryMb?: number | null;
  workstationDiskGb?: number | null;
  workstationIsoPath?: string | null;
  workstationNetworkMode?: "nat" | "bridged" | "hostonly" | "custom" | null;
  workstationNetworkLabel?: string | null;
  workstationDisks?: Array<{
    key: string;
    controller: string;
    unit: string;
    fileName?: string | null;
    deviceType?: string | null;
    mode?: string | null;
    sizeGb?: number | null;
  }>;
  workstationNetworkInterfaces?: Array<{
    key: string;
    index: number;
    mode?: "nat" | "bridged" | "hostonly" | "custom" | null;
    connectionType?: string | null;
    label?: string | null;
    virtualDev?: string | null;
    macAddress?: string | null;
    present: boolean;
    startConnected?: boolean | null;
  }>;
  workstationProfileScannedAt?: string | null;
};

export type CreateVmPayload = {
  creationMode?: "register" | "provision";
  id: string;
  name: string;
  vmxPath?: string;
  vmFolderPath?: string;
  type: "PERSISTENT" | "TEMPLATE" | "EPHEMERAL";
  tags?: string[];
  osFamily?: "ubuntu" | "debian" | "kali" | "windows" | "fortigate" | "other" | null;
  osVersion?: string;
  sshHost?: string;
  sshPort?: number | null;
  sshUser?: string;
  sshKeyPath?: string;
  sshPassword?: string;
  workstationGuestId?: string;
  workstationCpuCount?: number | null;
  workstationMemoryMb?: number | null;
  workstationDiskGb?: number | null;
  workstationIsoPath?: string;
  workstationNetworkMode?: "nat" | "bridged" | "hostonly" | "custom" | null;
  workstationNetworkLabel?: string;
};

export type UpdateVmSettingsPayload = Omit<CreateVmPayload, "id">;

export type UpdateVmwareProfilePayload = {
  name: string;
  vmxPath: string;
  vmFolderPath?: string;
  workstationGuestId?: string;
  workstationCpuCount?: number | null;
  workstationMemoryMb?: number | null;
  workstationDiskGb?: number | null;
  workstationIsoPath?: string;
  workstationNetworkMode?: "nat" | "bridged" | "hostonly" | "custom" | null;
  workstationNetworkLabel?: string;
};

export type VmUpdateFeedRecord = {
  vmId: string;
  vmName: string;
  mode: "security" | "full";
  generatedAt: string;
  osVersion?: string | null;
  kernelVersion?: string | null;
  rebootRequired: boolean;
  totalUpgradable: number;
  securityCandidateCount: number;
  highlights: string[];
  sourceNotes: string[];
  stderr?: string | null;
  packages: Array<{
    name: string;
    targetVersion?: string | null;
    currentVersion?: string | null;
    repository?: string | null;
    securityCandidate: boolean;
    critical: boolean;
    kernelRelated: boolean;
  }>;
};

export const fetchVMs = async (): Promise<VmRecord[]> => {
  const res = await api.get("/vms");
  return res.data;
};

export const createVm = async (payload: CreateVmPayload): Promise<VmRecord> => {
  const res = await api.post("/vms", payload);
  return res.data;
};

export const updateVmSettings = async (
  vmId: string,
  payload: UpdateVmSettingsPayload,
): Promise<VmRecord> => {
  const res = await api.patch(`/vms/${vmId}/settings`, payload);
  return res.data;
};

export const updateVmwareProfile = async (
  vmId: string,
  payload: UpdateVmwareProfilePayload,
): Promise<VmRecord> => {
  const res = await api.patch(`/vms/${vmId}/workstation-profile`, payload);
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

export const fetchVmUpdateFeed = async (
  vmId: string,
  mode: "security" | "full" = "security",
): Promise<VmUpdateFeedRecord> => {
  const res = await api.get(`/vms/${vmId}/update-feed`, {
    params: { mode },
  });
  return res.data;
};

export const refreshVmState = async (vmId: string) => {
  const res = await api.post(`/vms/${vmId}/refresh-state`);
  return res.data;
};
