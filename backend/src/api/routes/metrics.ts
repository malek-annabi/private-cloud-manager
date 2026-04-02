import { Router } from "express";
import { z } from "zod";

import { getTrafficSeries } from "../../services/traffic-metrics.service";

const router = Router();

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24).optional(),
});

router.get("/traffic", (req, res) => {
  const query = querySchema.parse(req.query);
  const hours = query.hours ?? 12;

  res.json({
    hours,
    generatedAt: new Date().toISOString(),
    buckets: getTrafficSeries(hours),
  });
});

export default router;
