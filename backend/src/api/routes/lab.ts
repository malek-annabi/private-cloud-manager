import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { auditMiddleware } from "../middleware/audit";

const router = Router();

const labStackSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  fireLabel: z.string().trim().max(160).optional().or(z.literal("")),
  stopLabel: z.string().trim().max(160).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  vmIds: z.array(z.string().trim().min(1).max(100)).max(40),
  tone: z.enum(["info", "danger", "neutral", "success"]).default("info"),
  gatewayVmId: z.string().trim().max(100).optional().nullable().or(z.literal("")),
  includeGatewayOnStart: z.boolean().default(true),
});

const labStackUpdateSchema = labStackSchema.omit({ id: true });

const DEFAULT_LAB_STACKS: Array<z.infer<typeof labStackSchema>> = [
  {
    id: "blue-team",
    name: "Blue Team",
    fireLabel: "Fire Blue Team Lab",
    stopLabel: "Stop Blue Team Lab",
    description: "Starts FG-VM if needed, then Wazuh, IRIS, and MISP.",
    vmIds: ["wazuh", "iris", "misp"],
    tone: "info",
    gatewayVmId: "FG-VM",
    includeGatewayOnStart: true,
  },
  {
    id: "red-team",
    name: "Red Team",
    fireLabel: "Fire Red Team Lab",
    stopLabel: "Stop Red Team Lab",
    description: "Starts FG-VM if needed, then Kali and the victim node.",
    vmIds: ["kali-01", "ubuntu-server-victim"],
    tone: "danger",
    gatewayVmId: "FG-VM",
    includeGatewayOnStart: true,
  },
  {
    id: "purple-team",
    name: "Purple Team",
    fireLabel: "Fire Purple Team Lab",
    stopLabel: "Stop Purple Team Lab",
    description: "Starts FG-VM if needed, then Wazuh, IRIS, Kali, and the victim node.",
    vmIds: ["wazuh", "iris", "kali-01", "ubuntu-server-victim"],
    tone: "neutral",
    gatewayVmId: "FG-VM",
    includeGatewayOnStart: true,
  },
  {
    id: "wg-vpn",
    name: "WG-VPN",
    fireLabel: "Fire WG-VPN",
    stopLabel: "Stop WG-VPN",
    description: "Starts FG-VM if needed, then WireGuard.",
    vmIds: ["wireguard"],
    tone: "success",
    gatewayVmId: "FG-VM",
    includeGatewayOnStart: true,
  },
];

router.get("/", auditMiddleware("LIST_LAB_STACKS"), async (_req, res) => {
  await seedDefaultLabStacks();
  const labs = await prisma.labStack.findMany({ orderBy: { createdAt: "asc" } });
  res.json(labs.map(serializeLabStack));
});

router.post("/", auditMiddleware("CREATE_LAB_STACK"), async (req, res) => {
  const parsed = labStackSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid lab stack payload", details: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const existing = await prisma.labStack.findUnique({ where: { id: payload.id } });

  if (existing) {
    return res.status(409).json({ error: "A lab stack with this id already exists" });
  }

  const created = await prisma.labStack.create({
    data: toLabStackData(payload),
  });

  res.status(201).json(serializeLabStack(created));
});

router.patch("/:id", auditMiddleware("UPDATE_LAB_STACK"), async (req, res) => {
  const id = z.string().trim().min(1).max(80).safeParse(req.params.id);

  if (!id.success) {
    return res.status(400).json({ error: "Invalid lab stack id" });
  }

  const parsed = labStackUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid lab stack payload", details: parsed.error.flatten() });
  }

  const existing = await prisma.labStack.findUnique({ where: { id: id.data } });

  if (!existing) {
    return res.status(404).json({ error: "Lab stack not found" });
  }

  const updated = await prisma.labStack.update({
    where: { id: id.data },
    data: toLabStackData({ ...parsed.data, id: id.data }),
  });

  res.json(serializeLabStack(updated));
});

router.delete("/:id", auditMiddleware("DELETE_LAB_STACK"), async (req, res) => {
  const id = z.string().trim().min(1).max(80).safeParse(req.params.id);

  if (!id.success) {
    return res.status(400).json({ error: "Invalid lab stack id" });
  }

  await prisma.labStack.delete({ where: { id: id.data } });
  res.status(204).send();
});

async function seedDefaultLabStacks() {
  const count = await prisma.labStack.count();
  if (count > 0) {
    return;
  }

  await prisma.labStack.createMany({
    data: DEFAULT_LAB_STACKS.map(toLabStackData),
  });
}

function toLabStackData(payload: z.infer<typeof labStackSchema>) {
  const name = payload.name.trim();
  const gatewayVmId = payload.gatewayVmId?.trim() || null;

  return {
    id: payload.id,
    name,
    fireLabel: payload.fireLabel?.trim() || `Fire ${name}`,
    stopLabel: payload.stopLabel?.trim() || `Stop ${name}`,
    description: payload.description?.trim() || `Starts ${name} lab stack.`,
    vmIds: JSON.stringify(normalizeVmIds(payload.vmIds)),
    tone: payload.tone,
    gatewayVmId,
    includeGatewayOnStart: Boolean(payload.includeGatewayOnStart),
  };
}

function serializeLabStack(lab: {
  id: string;
  name: string;
  fireLabel: string;
  stopLabel: string;
  description: string;
  vmIds: string;
  tone: string;
  gatewayVmId: string | null;
  includeGatewayOnStart: boolean;
}) {
  return {
    ...lab,
    vmIds: parseVmIds(lab.vmIds),
  };
}

function normalizeVmIds(vmIds: readonly string[]) {
  return Array.from(new Set(vmIds.map((vmId) => vmId.trim()).filter(Boolean)));
}

function parseVmIds(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default router;
