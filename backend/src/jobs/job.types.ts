export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "HELD"
  | "FAILED"
  | "SUCCEEDED"
  | "CANCELLED";

export type JobType =
  | "VM_START"
  | "VM_STOP"
  | "VM_REBOOT"
  | "VM_SNAPSHOT"
  | "VM_SSH_EXEC"
  | "VM_OS_UPDATE";


export interface JobPayload {
  vmId: string;
  snapshotName?: string;
  mode?: "security" | "full";
  autoremove?: boolean;
  rebootMode?: "soft" | "hard";
}

