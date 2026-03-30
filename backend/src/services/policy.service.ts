export function canDeleteVM(vm: any) {
  return vm.type === "EPHEMERAL";
}

export function canExecuteSSH(vm: any) {
  return vm.type !== "TEMPLATE";
}

export function canStartVM(vm: any) {
  return true; // extend later
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
