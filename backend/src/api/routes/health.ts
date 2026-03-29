import { Router } from "express";
import { config } from "../../core/config";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: config.appName,
  });
});

export default router;