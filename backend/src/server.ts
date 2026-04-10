import http from "http";

import { createApp } from "./app";
import { config } from "./core/config";
import { logger } from "./core/logger";
import { prisma } from "./core/prisma";
import { startWorker } from "./jobs/job.worker";
import { startSSHServer } from "./ssh/ssh.ws";
import { migrateLegacyVmSecrets } from "./services/vm-secret.service";

const app = createApp();

// 🔥 ONE unified server
const server = http.createServer(app);

async function start() {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    await migrateLegacyVmSecrets();
    logger.info("VM secrets ready");

    startWorker();
    logger.info("Job worker started");

    // 🔥 attach WebSocket BEFORE listen
    startSSHServer(server);

    server.listen(config.port, config.host, () => {
      logger.info(
        `HTTP + WS running on http://${config.host}:${config.port}`
      );
    });
  } catch (err) {
    logger.error({ err }, "Startup failed");
    process.exit(1);
  }
}

start();
