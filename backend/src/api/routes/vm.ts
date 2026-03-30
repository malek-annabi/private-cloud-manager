import { Router } from "express";
import { prisma } from "../../core/prisma";
import { vmIdSchema } from "../../validators/vm.validator";
import { auditMiddleware } from "../middleware/audit";
import { z } from "zod";
import { getVmPowerState, listRunningVMs } from "../../adapters/vmware.adapter";
import { logger } from "../../core/logger";
import net from "net";

const router = Router();
type VmWithTags = Awaited<ReturnType<typeof prisma.vM.findMany>>[number] & {
  tags?: string | null;
};

const updateTagsSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(12),
});

const updateConnectionSchema = z.object({
  sshHost: z.string().trim().max(255).optional().or(z.literal("")),
  sshPort: z.number().int().min(1).max(65535).nullable().optional(),
  sshUser: z.string().trim().max(100).optional().or(z.literal("")),
});

function parseTags(rawTags: string | null | undefined): string[] {
  if (!rawTags) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function serializeVm(vm: VmWithTags, powerState: "ON" | "OFF" | "UNKNOWN") {
  return {
    ...vm,
    tags: parseTags(vm.tags),
    powerState,
  };
}

async function syncLastSeenOnline(vms: VmWithTags[], runningVms: string[]) {
  const now = new Date();
  const runningPaths = new Set(runningVms);

  await Promise.all(
    vms
      .filter((vm) => runningPaths.has(vm.vmxPath))
      .map((vm) => updateVmLastSeenOnline(vm.id, now)),
  );

  return vms.map((vm) =>
    runningPaths.has(vm.vmxPath)
      ? {
          ...vm,
          lastSeenOnlineAt: now,
        }
      : vm,
  );
}

async function updateVmLastSeenOnline(vmId: string, timestamp: Date) {
  try {
    await prisma.vM.update({
      where: { id: vmId },
      data: { lastSeenOnlineAt: timestamp } as never,
    });
  } catch (error) {
    if (isUnknownFieldError(error, "lastSeenOnlineAt")) {
      logger.warn({ vmId }, "Skipping lastSeenOnlineAt update because the running Prisma client is stale");
      return;
    }

    throw error;
  }
}

function isUnknownFieldError(error: unknown, fieldName: string) {
  return (
    error instanceof Error &&
    error.name === "PrismaClientValidationError" &&
    error.message.includes(`Unknown argument \`${fieldName}\``)
  );
}

function checkTcpConnection(host: string, port: number, timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * GET /api/vms
 */
router.get("/", auditMiddleware("LIST_VMS"), async (req, res) => {
  const vms = await prisma.vM.findMany({
    orderBy: { createdAt: "desc" },
  });

  const runningVms: string[] = await listRunningVMs().catch(() => []);
  const syncedVms = await syncLastSeenOnline(vms as VmWithTags[], runningVms);
  const data = syncedVms.map((vm) =>
    serializeVm(vm, runningVms.includes(vm.vmxPath) ? "ON" : "OFF"),
  );

  res.json(data);
});

/**
 * GET /api/vms/:id
 */
router.get("/:id", auditMiddleware("GET_VM"), async (req, res) => {
  const parsed = vmIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsed.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const vmWithTags = vm as VmWithTags;

  res.json(serializeVm(vmWithTags, await getVmPowerState(vm.vmxPath)));
});

router.get("/:id/ssh-ready", auditMiddleware("CHECK_VM_SSH_READY"), async (req, res) => {
  const parsed = vmIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsed.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  if (!vm.sshHost || !vm.sshUser) {
    return res.json({ ready: false, reason: "SSH not configured" });
  }

  const ready = await checkTcpConnection(vm.sshHost, vm.sshPort || 22);
  return res.json({ ready });
});

router.patch("/:id/tags", auditMiddleware("UPDATE_VM_TAGS"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedBody = updateTagsSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid tags payload" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const tags = normalizeTags(parsedBody.data.tags);

  const updatedVm = await prisma.vM.update({
    where: { id: vm.id },
    data: {
      tags: JSON.stringify(tags),
    },
  });

  res.json({
    ...updatedVm,
    tags,
    powerState: await getVmPowerState(updatedVm.vmxPath),
  });
});

router.patch("/:id/connection", auditMiddleware("UPDATE_VM_CONNECTION"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedBody = updateConnectionSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid connection payload" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const sshHost = parsedBody.data.sshHost?.trim() || null;
  const sshUser = parsedBody.data.sshUser?.trim() || null;
  const sshPort = parsedBody.data.sshPort ?? null;

  const updatedVm = (await prisma.vM.update({
    where: { id: vm.id },
    data: {
      sshHost,
      sshUser,
      sshPort,
    },
  })) as VmWithTags;

  res.json(serializeVm(updatedVm, await getVmPowerState(updatedVm.vmxPath)));
});

export default router;
