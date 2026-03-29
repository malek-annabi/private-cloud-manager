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
  | "VM_SNAPSHOT"
  | "VM_SSH_EXEC";


export interface JobPayload {
  vmId: string;
  snapshotName?: string;
}

