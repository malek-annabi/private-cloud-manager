import { Client } from "ssh2";
import fs from "fs";

interface SSHOptions {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  command: string;
  timeoutMs?: number;
  stdinData?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
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

          if (options.stdinData) {
            stream.write(options.stdinData);
            stream.end();
          }

          stream
            .on("close", (code: number) => {
              clearTimeout(timeout);
              exitCode = code;
              conn.end();
              resolve({ stdout, stderr, code: exitCode });
            })
            .on("data", (data: Buffer) => {
              const chunk = data.toString();
              stdout += chunk;
              options.onStdout?.(chunk);
            });

          stream.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            options.onStderr?.(chunk);
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
        privateKey: options.privateKeyPath
          ? fs.readFileSync(options.privateKeyPath)
          : undefined,
        password: options.password,
      });
  });
}
