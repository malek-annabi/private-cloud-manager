import { Client } from "ssh2";
import fs from "fs";

interface SSHOptions {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  command: string;
  timeoutMs?: number;
}

export function executeSSH(options: SSHOptions): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timeout"));
    }, options.timeoutMs || 15000);

    conn
      .on("ready", () => {
        conn.exec(options.command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            return reject(err);
          }

          stream
            .on("close", (code: number) => {
              clearTimeout(timeout);
              exitCode = code;
              conn.end();
              resolve({ stdout, stderr, code: exitCode });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        privateKey: fs.readFileSync(options.privateKeyPath),
      });
  });
}