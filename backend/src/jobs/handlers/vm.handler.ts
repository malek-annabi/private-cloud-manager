import { prisma } from "../../core/prisma";
import { vmStart, vmStop, vmSnapshot } from "../../adapters/vmware.adapter";
import { logJob } from "../job.service";

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

    case "VM_SNAPSHOT":
      if (!payload.snapshotName) {
        throw new Error("Missing snapshot name");
      }
      await vmSnapshot(vm.vmxPath, payload.snapshotName);
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