import { Router } from "express";
import { createJob } from "../../jobs/job.service";
import { auditMiddleware } from "../middleware/audit";
import { prisma } from "../../core/prisma";
import { z } from "zod";
import {
  canStartVM,
  canStopVM,
  canDeleteVM,
  canUpdateServer,
} from "../../services/policy.service";

const router = Router();

/**
 * Schemas
 */
const startStopSchema = z.object({
  vmId: z.string().min(1),
  overrideCriticalInfrastructure: z.boolean().optional(),
});

const snapshotSchema = z.object({
  vmId: z.string().min(1),
  snapshotName: z.string().min(1),
});

const updateVmSchema = z.object({
  vmId: z.string().min(1),
  mode: z.enum(["security", "full"]).optional(),
  autoremove: z.boolean().optional(),
});


/**
 * GET /api/jobs
 */
router.get("/", async (req, res) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(jobs);
});

/**
 * GET /api/jobs/:id
 */
router.get("/:id", async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
  });

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const logs = await prisma.jobLog.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "asc" },
  });

  res.json({ job, logs });
});

/**
 * POST /api/jobs/start-vm
 */
router.post(
  "/start-vm",
  auditMiddleware("START_VM"),
  async (req, res) => {
    try {
      const parsed = startStopSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const vm = await prisma.vM.findUnique({
        where: { id: parsed.data.vmId },
      });

      if (!vm) {
        return res.status(404).json({ error: "VM not found" });
      }

      if (!canStartVM(vm)) {
        return res.status(403).json({ error: "Policy denied" });
      }

      const job = await createJob("VM_START", parsed.data);

      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/jobs/stop-vm
 */
router.post(
  "/stop-vm",
  auditMiddleware("STOP_VM"),
  async (req, res) => {
    try {
      const parsed = startStopSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const vm = await prisma.vM.findUnique({
        where: { id: parsed.data.vmId },
      });

      if (!vm) {
        return res.status(404).json({ error: "VM not found" });
      }

      if (
        !canStopVM(vm) &&
        !parsed.data.overrideCriticalInfrastructure
      ) {
        return res.status(403).json({ error: "Policy denied" });
      }

      const job = await createJob("VM_STOP", parsed.data);

      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/jobs/snapshot
 */
router.post(
  "/snapshot",
  auditMiddleware("SNAPSHOT_VM"),
  async (req, res) => {
    try {
      const parsed = snapshotSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const vm = await prisma.vM.findUnique({
        where: { id: parsed.data.vmId },
      });

      if (!vm) {
        return res.status(404).json({ error: "VM not found" });
      }

      const job = await createJob("VM_SNAPSHOT", parsed.data);

      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  "/update-vm",
  auditMiddleware("UPDATE_VM_OS"),
  async (req, res) => {
    try {
      const parsed = updateVmSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const vm = await prisma.vM.findUnique({
        where: { id: parsed.data.vmId },
      });

      if (!vm) {
        return res.status(404).json({ error: "VM not found" });
      }

      if (!canUpdateServer(vm)) {
        return res.status(403).json({ error: "Policy denied" });
      }

      const job = await createJob("VM_OS_UPDATE", parsed.data);
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

const sshSchema = z.object({
  vmId: z.string(),
  command: z.string().min(1).max(500),
});

router.post(
  "/ssh",
  auditMiddleware("SSH_EXEC"),
  async (req, res) => {
    const parsed = sshSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const job = await createJob("VM_SSH_EXEC", parsed.data);

    res.json(job);
  }
);

router.post("/:id/release", async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: "PENDING" },
  });

  res.json(job);
});

router.post("/:id/cancel", async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: "CANCELLED" },
  });

  res.json(job);
});

router.post("/:id/retry", async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: "PENDING" },
  });

  res.json(job);
});

export default router;
