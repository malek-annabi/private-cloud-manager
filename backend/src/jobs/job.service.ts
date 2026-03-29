import { prisma } from "../core/prisma";
import { JobType, JobPayload } from "./job.types";
import { requiresApproval } from "../services/policy.service";

export async function createJob(type: JobType, payload: any) {
  const status = requiresApproval(type) ? "HELD" : "PENDING";

  return prisma.job.create({
    data: {
      type,
      status,
      payload: JSON.stringify(payload),
    },
  });
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  result?: any
) {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      result: result ? JSON.stringify(result) : undefined,
    },
  });
}

export async function logJob(jobId: string, message: string, level = "INFO") {
  return prisma.jobLog.create({
    data: {
      jobId,
      message,
      level,
    },
  });
}