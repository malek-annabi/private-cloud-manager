import fs from "fs";
import path from "path";
import { prisma } from "../core/prisma";
import { logger } from "../core/logger";

const INVENTORY_PATH = path.resolve(__dirname, "../data/inventory.json");

export async function loadInventory() {
  const raw = fs.readFileSync(INVENTORY_PATH, "utf-8");
  const data = JSON.parse(raw);

  logger.info("Loading inventory...");

for (const vm of data.vms) {
  await prisma.vM.upsert({
    where: { id: vm.id },
    update: {
      id: vm.id,
      name: vm.name,
      vmxPath: vm.vmxPath,
      type: vm.type,
      tags: JSON.stringify(vm.tags ?? []),
      osFamily: vm.os?.family,
      osVersion: vm.os?.version,

      sshHost: vm.ssh?.host,
      sshPort: vm.ssh?.port,
      sshUser: vm.ssh?.user,
      sshKeyPath: vm.ssh?.privateKeyPath,
      sshPassword: vm.ssh?.password,
    },
    create: {
      id: vm.id,
      name: vm.name,
      vmxPath: vm.vmxPath,
      type: vm.type,
      tags: JSON.stringify(vm.tags ?? []),
      osFamily: vm.os?.family,
      osVersion: vm.os?.version,

      sshHost: vm.ssh?.host,
      sshPort: vm.ssh?.port,
      sshUser: vm.ssh?.user,
      sshKeyPath: vm.ssh?.privateKeyPath,
      sshPassword: vm.ssh?.password,
    },
  });
}

  logger.info("Inventory loaded successfully");
}
