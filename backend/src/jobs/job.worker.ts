import { prisma } from "../core/prisma";
import { updateJobStatus, logJob } from "./job.service";
import { handleVMJob } from "./handlers/vm.handler";
import { logger } from "../core/logger";
import { handleSSHJob } from "./handlers/ssh.handler";

let running = false;

export async function startWorker() {
  if (running) return;

  running = true;
  logger.info("Job worker started");

  setInterval(processJobs, 2000);
}

const handlers: Record<string, (job: any) => Promise<any>> = {
  VM_SSH_EXEC: handleSSHJob,
};

async function processJobs() {
  const job = await prisma.job.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  if (!job) return;

  try {
    await updateJobStatus(job.id, "RUNNING");

    const handler = handlers[job.type] || handleVMJob;

    await handler(job);

    await updateJobStatus(job.id, "SUCCEEDED");
  } catch (err: any) {
    await logJob(job.id, err.message, "ERROR");
    await updateJobStatus(job.id, "FAILED", {
      error: err.message,
    });
  }
}