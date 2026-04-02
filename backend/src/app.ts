import express from "express";
import cors from "cors";

import healthRoutes from "./api/routes/health";
import vmRoutes from "./api/routes/vm";
import jobRoutes from "./api/routes/job";
import auditRoutes from "./api/routes/audit";
import newsRoutes from "./api/routes/news";
import metricsRoutes from "./api/routes/metrics";

import { authMiddleware } from "./api/middleware/auth";
import { errorHandler } from "./api/middleware/error.middleware";
import { recordTrafficSample } from "./services/traffic-metrics.service";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    })
  );
  app.use(express.json());

  app.use("/api", (req, res, next) => {
    const inboundHeader = req.headers["content-length"];
    const inboundBytes =
      typeof inboundHeader === "string" ? Number.parseInt(inboundHeader, 10) || 0 : 0;

    res.on("finish", () => {
      const outboundHeader = res.getHeader("content-length");
      const outboundBytes =
        typeof outboundHeader === "string"
          ? Number.parseInt(outboundHeader, 10) || 0
          : typeof outboundHeader === "number"
            ? outboundHeader
            : 0;

      recordTrafficSample({
        inboundBytes,
        outboundBytes,
      });
    });

    next();
  });

  // 🔐 Auth applied to all /api routes
  app.use("/api", authMiddleware);

  // ✅ Routes
  app.use("/api", healthRoutes);      // /api/health
  app.use("/api/vms", vmRoutes);      // /api/vms
  app.use("/api/jobs", jobRoutes);    // /api/jobs
  app.use("/api/audit", auditRoutes); // /api/audit
  app.use("/api/news", newsRoutes);   // /api/news
  app.use("/api/metrics", metricsRoutes); // /api/metrics

  // ❗ JSON parsing error handler (must be before global handler)
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({
        error: "Invalid JSON payload",
      });
    }
    next(err);
  });

  // ❗ Global error handler
  app.use(errorHandler);

  return app;
};
