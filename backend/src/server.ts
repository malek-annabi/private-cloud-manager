import http from "http";

import { createApp } from "./app";
import { config } from "./core/config";
import { logger } from "./core/logger";
import { prisma } from "./core/prisma";

import { loadInventory } from "./services/inventory.service";
import { startWorker } from "./jobs/job.worker";
import { startSSHServer } from "./ssh/ssh.ws";

const app = createApp();

// 🔥 ONE unified server
const server = http.createServer(app);

async function start() {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    await loadInventory();
    logger.info("Inventory loaded");

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