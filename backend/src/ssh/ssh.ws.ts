import fs from "fs";
import { WebSocketServer } from "ws";
import { Client, type ConnectConfig } from "ssh2";
import { prisma } from "../core/prisma";
import { logger } from "../core/logger";
import { getVmSshPassword } from "../services/vm-secret.service";

export function startSSHServer(server: any) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/ssh",
  });

  logger.info("SSH WS server initialized");

  wss.on("connection", (ws) => {
    logger.info("New SSH WebSocket connection");

    let conn: Client | null = null;
    let shellStream: any = null;
    let initialized = false;

    const safeSend = (message: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    };

    const cleanup = () => {
      shellStream?.end?.();
      shellStream = null;
      conn?.end();
      conn = null;
      initialized = false;
    };

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg.toString());

        if (data.type === "input") {
          if (!shellStream) {
            safeSend("\r\nSSH shell is not ready yet.\r\n");
            return;
          }

          shellStream.write(data.data);
          return;
        }

        if (data.type !== "init") {
          safeSend("\r\nUnsupported SSH message type.\r\n");
          return;
        }

        if (initialized) {
          safeSend("\r\nSSH session is already initialized.\r\n");
          return;
        }

        const vm = await prisma.vM.findUnique({
          where: { id: data.vmId },
        });

        if (!vm || !vm.sshHost || !vm.sshUser) {
          safeSend("\r\nVM is not fully configured for SSH.\r\n");
          return;
        }

        const sshPassword = await getVmSshPassword(vm.id);

        const connectConfig: ConnectConfig = {
          host: vm.sshHost,
          port: vm.sshPort || 22,
          username: vm.sshUser,
          readyTimeout: 30000,
          keepaliveInterval: 10000,
        };

        if (sshPassword) {
          connectConfig.password = sshPassword;
        }

        if (vm.sshKeyPath) {
          try {
            connectConfig.privateKey = fs.readFileSync(vm.sshKeyPath);
          } catch (err) {
            logger.error({ err, vmId: vm.id, sshKeyPath: vm.sshKeyPath }, "Failed to read SSH private key");
            safeSend(`\r\nFailed to read SSH private key: ${vm.sshKeyPath}\r\n`);
            return;
          }
        }

        if (!connectConfig.password && !connectConfig.privateKey) {
          safeSend("\r\nVM has no SSH password or private key configured.\r\n");
          return;
        }

        initialized = true;
        conn = new Client();

        logger.info(
          {
            vmId: vm.id,
            host: connectConfig.host,
            port: connectConfig.port,
            username: connectConfig.username,
          },
          "Opening SSH connection"
        );

        safeSend(`\r\nConnecting to ${vm.name} (${connectConfig.host}:${connectConfig.port})...\r\n`);

        conn.on("ready", () => {
          logger.info({ vmId: vm.id }, "SSH connected");
          safeSend("\r\nSSH connection established.\r\n");
          void refreshVmSshMetadata(conn!, vm.id).finally(() => {
            conn!.shell((err, stream) => {
              if (err) {
                logger.error({ err, vmId: vm.id }, "Failed to open SSH shell");
                safeSend(`\r\nSSH shell error: ${err.message}\r\n`);
                cleanup();
                return;
              }

              shellStream = stream;

              stream.on("data", (chunk: Buffer) => {
                safeSend(chunk.toString());
              });

              stream.stderr.on("data", (chunk: Buffer) => {
                safeSend(chunk.toString());
              });

              stream.on("close", () => {
                safeSend("\r\nSSH shell closed.\r\n");
                cleanup();
              });
            });
          });
        });

        conn.on("error", (err: Error) => {
          logger.error(
            {
              err,
              vmId: vm.id,
              host: connectConfig.host,
              port: connectConfig.port,
            },
            "SSH connection error"
          );
          safeSend(`\r\nSSH connection error: ${err.message}\r\n`);
        });

        conn.on("close", () => {
          logger.info({ vmId: vm.id }, "SSH connection closed");
          if (shellStream) {
            safeSend("\r\nSSH connection closed.\r\n");
          }
          cleanup();
        });

        conn.connect(connectConfig);
      } catch (err) {
        logger.error({ err }, "SSH WebSocket message handling failed");
        safeSend("\r\nSSH initialization error.\r\n");
      }
    });

    ws.on("close", () => {
      cleanup();
      logger.info("WebSocket closed");
    });
  });
}

async function refreshVmSshMetadata(conn: Client, vmId: string) {
  const inspected = await inspectRemoteOs(conn).catch((err) => {
    logger.warn({ err, vmId }, "Failed to inspect remote OS metadata during SSH connect");
    return null;
  });

  try {
    await prisma.vM.update({
      where: { id: vmId },
      data: {
        lastSshLoginAt: new Date(),
        osFamily: inspected?.osFamily ?? undefined,
        osVersion: inspected?.osVersion ?? undefined,
        rebootRequired: inspected?.rebootRequired ?? undefined,
      } as never,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.name === "PrismaClientValidationError" &&
      (err.message.includes("Unknown argument `lastSshLoginAt`") ||
        err.message.includes("Unknown argument `osFamily`") ||
        err.message.includes("Unknown argument `osVersion`") ||
        err.message.includes("Unknown argument `rebootRequired`"))
    ) {
      logger.warn({ vmId }, "Skipping SSH metadata update because the running Prisma client is stale");
      return;
    }

    logger.error({ err, vmId }, "Failed to update SSH metadata");
  }
}

async function inspectRemoteOs(conn: Client) {
  const stdout = await execInspectCommand(
    conn,
    "sh -lc 'if [ -f /etc/os-release ]; then . /etc/os-release; echo OS_FAMILY=\"$ID\"; echo OS_VERSION=\"$PRETTY_NAME\"; fi; if [ -f /var/run/reboot-required ]; then echo REBOOT_REQUIRED=yes; else echo REBOOT_REQUIRED=no; fi'",
  );

  const osFamily = stdout.match(/OS_FAMILY="?([^\r\n"]+)"?/)?.[1]?.trim();
  const osVersion = stdout.match(/OS_VERSION="?([^\r\n"]+)"?/)?.[1]?.trim();
  const rebootRequired = stdout.includes("REBOOT_REQUIRED=yes");

  return {
    osFamily: osFamily || undefined,
    osVersion: osVersion || undefined,
    rebootRequired,
  };
}

function execInspectCommand(conn: Client, command: string) {
  return new Promise<string>((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("close", (code: number | null) => {
        if (code && code !== 0 && !stdout) {
          reject(new Error(stderr || `Remote inspection failed with exit code ${code}`));
          return;
        }

        resolve(stdout);
      });

      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    });
  });
}
