import { Router } from "express";
import { config } from "../../core/config";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: config.appName,
    authRequired: true,
    user: (req as any).user ?? null,
  });
});

export default router;
