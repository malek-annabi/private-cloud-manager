import crypto from "crypto";
import { prisma } from "../core/prisma";
import { config } from "../core/config";
import { logger } from "../core/logger";

function deriveKey() {
  return crypto.createHash("sha256").update(config.secretKey).digest();
}

function encryptValue(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
}

function decryptValue(payload: string) {
  const parsed = JSON.parse(payload);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function setVmSshPassword(vmId: string, password: string) {
  await prisma.vMSecret.upsert({
    where: { vmId },
    update: {
      encryptedSshPassword: encryptValue(password),
    },
    create: {
      vmId,
      encryptedSshPassword: encryptValue(password),
    },
  });
}

export async function clearVmSshPassword(vmId: string) {
  await prisma.vMSecret.upsert({
    where: { vmId },
    update: {
      encryptedSshPassword: null,
    },
    create: {
      vmId,
      encryptedSshPassword: null,
    },
  });
}

export async function getVmSshPassword(vmId: string) {
  const secret = await prisma.vMSecret.findUnique({
    where: { vmId },
  });

  if (!secret?.encryptedSshPassword) {
    return null;
  }

  return decryptValue(secret.encryptedSshPassword);
}

export async function hasVmSshPassword(vmId: string) {
  const secret = await prisma.vMSecret.findUnique({
    where: { vmId },
    select: {
      encryptedSshPassword: true,
    },
  });

  return Boolean(secret?.encryptedSshPassword);
}

export async function migrateLegacyVmSecrets() {
  const legacyVms = await prisma.vM.findMany({
    where: {
      sshPassword: {
        not: null,
      },
    },
    select: {
      id: true,
      sshPassword: true,
    },
  });

  if (legacyVms.length === 0) {
    return;
  }

  for (const vm of legacyVms) {
    if (!vm.sshPassword) {
      continue;
    }

    await setVmSshPassword(vm.id, vm.sshPassword);
    await prisma.vM.update({
      where: { id: vm.id },
      data: {
        sshPassword: null,
      },
    });
  }

  logger.warn(
    { vmCount: legacyVms.length },
    "Migrated legacy plaintext VM SSH passwords into encrypted secret storage and scrubbed the VM table.",
  );
}
