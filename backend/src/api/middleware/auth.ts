import { Request, Response, NextFunction } from "express";
import { config } from "../../core/config";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Invalid Authorization format" });
  }

  if (token !== config.apiToken) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // attach identity
  (req as any).user = {
    id: "local-admin",
    role: "admin",
  };

  next();
}