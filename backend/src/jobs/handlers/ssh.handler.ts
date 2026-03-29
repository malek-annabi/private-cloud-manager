import { prisma } from "../../core/prisma";
import { executeSSH } from "../../adapters/ssh.adapter";
import { logJob } from "../job.service";
import { isCommandAllowed } from "../../services/policy.service";

export async function handleSSHJob(job: any) {
  const payload = JSON.parse(job.payload);

  const vm = await prisma.vM.findUnique({
    where: { id: payload.vmId },
  });

  if (!vm || !vm.sshHost) {
    throw new Error("VM SSH not configured");
  }


  await logJob(job.id, `Executing SSH on ${vm.name}`);

  const result = await executeSSH({
    host: vm.sshHost,
    port: vm.sshPort || 22,
    username: vm.sshUser!,
    privateKeyPath: vm.sshKeyPath!,
    command: payload.command,
    timeoutMs: 15000,
  });
    if (!isCommandAllowed(payload.command)) {
  throw new Error("Command not allowed by policy");
}

  await logJob(job.id, `Exit code: ${result.code}`);
  await logJob(job.id, `STDOUT:\n${result.stdout}`);
  await logJob(job.id, `STDERR:\n${result.stderr}`);

  return result;
}