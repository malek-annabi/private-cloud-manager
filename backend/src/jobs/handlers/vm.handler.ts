import { prisma } from "../../core/prisma";
import { vmStart, vmStop, vmSnapshot, vmReboot } from "../../adapters/vmware.adapter";
import { logJob } from "../job.service";
import { executeSSH } from "../../adapters/ssh.adapter";

export async function handleVMJob(job: any) {
  const payload = JSON.parse(job.payload);

  const vm = await prisma.vM.findUnique({
    where: { id: payload.vmId },
  });

  if (!vm) {
    throw new Error("VM not found");
  }

  await logJob(job.id, `Executing ${job.type} on ${vm.name}`);

  switch (job.type) {
    case "VM_START":
      await vmStart(vm.vmxPath);
      break;

    case "VM_STOP":
      await vmStop(vm.vmxPath);
      break;

    case "VM_REBOOT":
      await vmReboot(vm.vmxPath, payload.rebootMode === "hard" ? "hard" : "soft");
      break;

    case "VM_SNAPSHOT":
      if (!payload.snapshotName) {
        throw new Error("Missing snapshot name");
      }
      await vmSnapshot(vm.vmxPath, payload.snapshotName);
      break;

    case "VM_OS_UPDATE":
      await handleVmOsUpdate(job.id, vm, payload);
      break;

    default:
      throw new Error("Unsupported job type");
  }

  await logJob(job.id, JSON.stringify({
  event: "VM_OPERATION",
  action: job.type,
  status: "done"
}));
}

async function handleVmOsUpdate(jobId: string, vm: any, payload: any) {
  if (!vm.sshHost || !vm.sshUser) {
    throw new Error("VM SSH not configured");
  }

  if (!vm.sshPassword) {
    throw new Error("VM update requires an SSH password because sudo -S is used for homelab patching");
  }

  if (!vm.osFamily || vm.osFamily.toLowerCase() !== "ubuntu") {
    throw new Error("VM OS update is currently supported only for Ubuntu VMs");
  }

  const mode = payload.mode === "security" ? "security" : "full";
  const autoremove = payload.autoremove !== false;

  await logJob(jobId, `Running Ubuntu update on ${vm.name}`);
  await logJob(jobId, `Update mode: ${mode}${autoremove ? " with autoremove" : ""}`);
  await logJob(jobId, "Privilege escalation mode: sudo -S using the VM SSH password");

  const updateCommand =
    mode === "security"
      ? [
          "sudo -S -p '' bash -lc '",
          "apt update && ",
          "DEBIAN_FRONTEND=noninteractive unattended-upgrade -d && ",
          "if [ -f /var/run/reboot-required ]; then echo REBOOT_REQUIRED=yes; else echo REBOOT_REQUIRED=no; fi && ",
          ". /etc/os-release && echo OS_VERSION=\"$PRETTY_NAME\"",
          "'",
        ].join("")
      : [
          "sudo -S -p '' bash -lc '",
          "apt update && ",
          "DEBIAN_FRONTEND=noninteractive apt upgrade -y && ",
          autoremove ? "DEBIAN_FRONTEND=noninteractive apt autoremove -y && " : "true && ",
          "apt autoclean && ",
          "if [ -f /var/run/reboot-required ]; then echo REBOOT_REQUIRED=yes; else echo REBOOT_REQUIRED=no; fi && ",
          ". /etc/os-release && echo OS_VERSION=\"$PRETTY_NAME\"",
          "'",
        ].join("");

  const startedAt = Date.now();
  let pendingStdout = "";
  let pendingStderr = "";

  const progressTimer = setInterval(async () => {
    const elapsedMs = Date.now() - startedAt;
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    const elapsedSeconds = Math.floor((elapsedMs % 60_000) / 1000);
    const recentStdout = formatProgressTail(pendingStdout);
    const recentStderr = formatProgressTail(pendingStderr);

    pendingStdout = "";
    pendingStderr = "";

    await logJob(
      jobId,
      recentStdout || recentStderr
        ? [
            `Update still running (${elapsedMinutes}m ${elapsedSeconds}s elapsed).`,
            recentStdout ? `Recent STDOUT:\n${recentStdout}` : null,
            recentStderr ? `Recent STDERR:\n${recentStderr}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : `Update still running (${elapsedMinutes}m ${elapsedSeconds}s elapsed).`,
    );
  }, 15_000);

  let result;
  try {
    result = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: vm.sshPassword ?? undefined,
      command: updateCommand,
      timeoutMs: 10 * 60 * 1000,
      stdinData: `${vm.sshPassword}\n`,
      onStdout: (chunk) => {
        pendingStdout += chunk;
      },
      onStderr: (chunk) => {
        pendingStderr += chunk;
      },
    });
  } finally {
    clearInterval(progressTimer);
  }

  await logJob(jobId, `Exit code: ${result.code}`);
  await logJob(jobId, `STDOUT:\n${result.stdout}`);
  await logJob(jobId, `STDERR:\n${result.stderr}`);

  if (result.code !== 0) {
    throw new Error(
      `Ubuntu update failed with exit code ${result.code}: ${result.stderr || "no stderr output"}`,
    );
  }

  const rebootRequired = result.stdout.includes("REBOOT_REQUIRED=yes");
  const osVersionMatch = result.stdout.match(/OS_VERSION="([^"]+)"/);
  const osVersion = osVersionMatch?.[1] ?? vm.osVersion ?? null;

  await prisma.vM.update({
    where: { id: vm.id },
    data: {
      osVersion,
      lastUpdatedAt: new Date(),
      rebootRequired,
    } as never,
  });

  await logJob(
    jobId,
    `Update complete. OS version: ${osVersion ?? "unknown"}. Reboot required: ${rebootRequired ? "yes" : "no"}`,
  );
}

function formatProgressTail(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return lines.slice(-6).join("\n");
}
