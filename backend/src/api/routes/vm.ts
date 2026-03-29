import { Router } from "express";
import { prisma } from "../../core/prisma";
import { vmIdSchema } from "../../validators/vm.validator";
import { auditMiddleware } from "../middleware/audit";

const router = Router();

/**
 * GET /api/vms
 */
router.get("/", auditMiddleware("LIST_VMS"), async (req, res) => {
  const vms = await prisma.vM.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.json(vms);
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

  res.json(vm);
});

export default router;