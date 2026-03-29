import { prisma } from "../core/prisma";
import { logger } from "../core/logger";

export async function auditLog(
  action: string,
  actor: string,
  resource: string,
  metadata: Record<string, any> = {}
) {
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        actor,
        resource,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to write audit log");
  }
}