import { Request, Response, NextFunction } from "express";
import { auditLog } from "../../services/audit.service";

export function auditMiddleware(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", async () => {
      await auditLog(
        action,
        (req as any).user?.id || "anonymous",
        req.originalUrl,
        {
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }
      );
    });

    next();
  };
}