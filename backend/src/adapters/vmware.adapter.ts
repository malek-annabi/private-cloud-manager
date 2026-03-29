import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Adjust this path to your VMware installation
const VMRUN_PATH =
  "C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmrun.exe";

export async function vmStart(vmxPath: string) {
  return execFileAsync(VMRUN_PATH, ["start", vmxPath, "nogui"]);
}

export async function vmStop(vmxPath: string) {
  return execFileAsync(VMRUN_PATH, ["stop", vmxPath, "soft"]);
}

export async function vmSnapshot(vmxPath: string, name: string) {
  return execFileAsync(VMRUN_PATH, ["snapshot", vmxPath, name]);
}