const CRITICAL_VM_IDS = new Set(["FG-VM"]);

export function isCriticalInfrastructureVm(vm: any) {
  return CRITICAL_VM_IDS.has(vm.id);
}

export function canDeleteVM(vm: any) {
  return !isCriticalInfrastructureVm(vm);
}

export function canExecuteSSH(vm: any) {
  return vm.type !== "TEMPLATE";
}

export function canStartVM(vm: any) {
  return true; // extend later
}

export function canStopVM(vm: any) {
  return !isCriticalInfrastructureVm(vm);
}

export function canRebootVM(vm: any) {
  return vm.type !== "TEMPLATE";
}

export function requiresApproval(jobType: string): boolean {
  return [
    "VM_DELETE",
    "VM_SNAPSHOT_REVERT",
    "VM_SSH_EXEC",
  ].includes(jobType);
}

export function canUpdateServer(vm: any) {
  return vm.type !== "TEMPLATE";
}

const ALLOWED_COMMANDS = [
  "whoami",
  "hostname",
  "uptime",
  "ls",
  "cat",
];

export function isCommandAllowed(command: string): boolean {
  return ALLOWED_COMMANDS.some((cmd) =>
    command.trim().startsWith(cmd)
  );
}
