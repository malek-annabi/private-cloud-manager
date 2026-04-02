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

export async function vmReboot(vmxPath: string, mode: "soft" | "hard" = "soft") {
  return execFileAsync(VMRUN_PATH, ["reset", vmxPath, mode]);
}

export async function vmSnapshot(vmxPath: string, name: string) {
  return execFileAsync(VMRUN_PATH, ["snapshot", vmxPath, name]);
}

export async function listRunningVMs() {
  const { stdout } = await execFileAsync(VMRUN_PATH, ["list"]);

  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getVmPowerState(vmxPath: string) {
  try {
    const runningVms = await listRunningVMs();
    return runningVms.includes(vmxPath) ? "ON" : "OFF";
  } catch {
    return "UNKNOWN";
  }
}
