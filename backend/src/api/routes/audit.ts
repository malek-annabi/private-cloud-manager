import { Router } from "express";
import { prisma } from "../../core/prisma";

const router = Router();

router.get("/", async (req, res) => {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(
    events.map((event) => ({
      ...event,
      metadata: parseMetadata(event.metadata),
    })),
  );
});

function parseMetadata(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default router;
