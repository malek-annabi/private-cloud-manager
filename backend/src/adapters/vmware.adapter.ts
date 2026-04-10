import { execFile } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Adjust this path to your VMware installation
const VMRUN_PATH =
  "C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmrun.exe";
const VDISKMANAGER_PATH =
  "C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmware-vdiskmanager.exe";

export type VmwareNetworkMode = "nat" | "bridged" | "hostonly" | "custom";

export type VmwareProvisionSpec = {
  name: string;
  vmFolderPath: string;
  osFamily?: string | null;
  guestId?: string | null;
  cpuCount?: number | null;
  memoryMb?: number | null;
  diskGb?: number | null;
  isoPath?: string | null;
  networkMode?: VmwareNetworkMode | null;
  networkLabel?: string | null;
};

export type VmwareProfilePatch = {
  name?: string;
  guestId?: string | null;
  cpuCount?: number | null;
  memoryMb?: number | null;
  isoPath?: string | null;
  networkMode?: VmwareNetworkMode | null;
  networkLabel?: string | null;
};

export type VmwareProfileSnapshot = {
  guestId: string | null;
  cpuCount: number | null;
  memoryMb: number | null;
  isoPath: string | null;
  networkMode: VmwareNetworkMode | null;
  networkLabel: string | null;
  disks: VmwareDiskSnapshot[];
  networkInterfaces: VmwareNetworkInterfaceSnapshot[];
};

export type VmwareDiskSnapshot = {
  key: string;
  controller: string;
  unit: string;
  fileName: string | null;
  deviceType: string | null;
  mode: string | null;
  sizeGb: number | null;
};

export type VmwareNetworkInterfaceSnapshot = {
  key: string;
  index: number;
  mode: VmwareNetworkMode | null;
  connectionType: string | null;
  label: string | null;
  virtualDev: string | null;
  macAddress: string | null;
  present: boolean;
  startConnected: boolean | null;
};

export async function vmStart(vmxPath: string) {
  return execFileAsync(VMRUN_PATH, ["start", vmxPath, "nogui"]);
}

export async function vmStop(vmxPath: string, mode: "soft" | "hard" = "soft") {
  return execFileAsync(VMRUN_PATH, ["stop", vmxPath, mode]);
}

export async function vmReboot(vmxPath: string, mode: "soft" | "hard" = "soft") {
  return execFileAsync(VMRUN_PATH, ["reset", vmxPath, mode]);
}

export async function vmSnapshot(vmxPath: string, name: string) {
  return execFileAsync(VMRUN_PATH, ["snapshot", vmxPath, name]);
}

export async function vmDelete(vmxPath: string) {
  return execFileAsync(VMRUN_PATH, ["deleteVM", vmxPath]);
}

export async function createVirtualDisk(vmdkPath: string, diskGb: number) {
  return execFileAsync(VDISKMANAGER_PATH, ["-c", "-s", `${diskGb}GB`, "-a", "lsilogic", "-t", "0", vmdkPath]);
}

export async function listRunningVMs() {
  const { stdout } = await execFileAsync(VMRUN_PATH, ["list"]);

  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getVmPowerState(vmxPath: string) {
  try {
    const runningVms = await listRunningVMs();
    return runningVms.includes(vmxPath) ? "ON" : "OFF";
  } catch {
    return "UNKNOWN";
  }
}

export async function provisionVmFromIso(spec: VmwareProvisionSpec) {
  const vmFolderPath = path.resolve(spec.vmFolderPath);
  await mkdir(vmFolderPath, { recursive: true });

  const baseName = sanitizeVmFileName(spec.name);
  const vmxPath = path.join(vmFolderPath, `${baseName}.vmx`);
  const vmdkPath = path.join(vmFolderPath, `${baseName}.vmdk`);

  try {
    await stat(vmxPath);
    throw new Error(`A VMX file already exists at ${vmxPath}`);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await createVirtualDisk(vmdkPath, spec.diskGb ?? 60);
  await writeFile(vmxPath, buildVmxDocument(spec, baseName), "utf8");

  return {
    vmxPath,
    vmFolderPath,
    diskPath: vmdkPath,
  };
}

export async function applyVmwareProfile(vmxPath: string, patch: VmwareProfilePatch) {
  const document = await readFile(vmxPath, "utf8");
  const entries = parseVmxDocument(document);
  const baseName = path.basename(vmxPath, ".vmx");

  if (patch.name) {
    entries.displayName = patch.name;
  }

  if (patch.guestId !== undefined) {
    entries.guestOS = patch.guestId || inferGuestIdFromName(entries.displayName ?? baseName);
  }

  if (patch.cpuCount !== undefined && patch.cpuCount !== null) {
    entries.numvcpus = String(patch.cpuCount);
  }

  if (patch.memoryMb !== undefined && patch.memoryMb !== null) {
    entries.memsize = String(patch.memoryMb);
  }

  if (patch.isoPath !== undefined) {
    if (patch.isoPath) {
      entries["sata0:0.present"] = "TRUE";
      entries["sata0:0.deviceType"] = "cdrom-image";
      entries["sata0:0.fileName"] = patch.isoPath;
      entries["sata0:0.startConnected"] = "TRUE";
    } else {
      delete entries["sata0:0.present"];
      delete entries["sata0:0.deviceType"];
      delete entries["sata0:0.fileName"];
      delete entries["sata0:0.startConnected"];
    }
  }

  if (patch.networkMode !== undefined) {
    entries["ethernet0.present"] = "TRUE";
    entries["ethernet0.virtualDev"] = "vmxnet3";
    entries["ethernet0.connectionType"] = toVmxConnectionType(patch.networkMode ?? "nat");
    if ((patch.networkMode ?? "nat") === "custom") {
      entries["ethernet0.vnet"] = patch.networkLabel || "vmnet2";
    } else {
      delete entries["ethernet0.vnet"];
    }
  }

  await writeFile(vmxPath, serializeVmxDocument(entries), "utf8");
}

export async function inspectVmwareProfile(vmxPath: string): Promise<VmwareProfileSnapshot> {
  const document = await readFile(vmxPath, "utf8");
  const entries = parseVmxDocument(document);
  const vmDirectory = path.dirname(vmxPath);
  const networkInterfaces = collectNetworkInterfaces(entries);
  const disks = await collectDiskDevices(entries, vmDirectory);

  return {
    guestId: entries.guestOS || null,
    cpuCount: parseInteger(entries.numvcpus),
    memoryMb: parseInteger(entries.memsize),
    isoPath:
      entries["sata0:0.deviceType"] === "cdrom-image"
        ? entries["sata0:0.fileName"] || null
        : null,
    networkMode: networkInterfaces[0]?.mode ?? null,
    networkLabel: networkInterfaces[0]?.label ?? null,
    disks,
    networkInterfaces,
  };
}

function sanitizeVmFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim() || "virtual-machine";
}

function inferGuestIdFromOsFamily(osFamily?: string | null) {
  const normalized = osFamily?.trim().toLowerCase();
  switch (normalized) {
    case "ubuntu":
      return "ubuntu-64";
    case "debian":
      return "debian12-64";
    case "kali":
      return "otherlinux-64";
    case "windows":
      return "windows2022srv-64";
    case "fortigate":
      return "otherlinux-64";
    default:
      return "otherlinux-64";
  }
}

function inferGuestIdFromName(name: string) {
  const haystack = name.toLowerCase();
  if (haystack.includes("windows")) {
    return "windows2022srv-64";
  }
  if (haystack.includes("ubuntu")) {
    return "ubuntu-64";
  }
  if (haystack.includes("debian")) {
    return "debian12-64";
  }
  return "otherlinux-64";
}

function toVmxConnectionType(mode: VmwareNetworkMode) {
  switch (mode) {
    case "bridged":
      return "bridged";
    case "hostonly":
      return "hostonly";
    case "custom":
      return "custom";
    case "nat":
    default:
      return "nat";
  }
}

function fromVmxConnectionType(mode?: string): VmwareNetworkMode | null {
  switch ((mode || "").trim().toLowerCase()) {
    case "bridged":
      return "bridged";
    case "hostonly":
      return "hostonly";
    case "custom":
      return "custom";
    case "nat":
      return "nat";
    default:
      return null;
  }
}

function buildVmxDocument(spec: VmwareProvisionSpec, baseName: string) {
  const entries: Record<string, string> = {
    ".encoding": "UTF-8",
    "config.version": "8",
    "virtualHW.version": "20",
    displayName: spec.name,
    guestOS: spec.guestId || inferGuestIdFromOsFamily(spec.osFamily),
    firmware: "efi",
    "nvram": `${baseName}.nvram`,
    "extendedConfigFile": `${baseName}.vmxf`,
    "uuid.action": "create",
    "memsize": String(spec.memoryMb ?? 4096),
    "numvcpus": String(spec.cpuCount ?? 2),
    "scsi0.present": "TRUE",
    "scsi0.virtualDev": "lsisas1068",
    "scsi0:0.present": "TRUE",
    "scsi0:0.fileName": `${baseName}.vmdk`,
    "scsi0:0.redo": "",
    "ethernet0.present": "TRUE",
    "ethernet0.virtualDev": "vmxnet3",
    "ethernet0.connectionType": toVmxConnectionType(spec.networkMode ?? "nat"),
  };

  if ((spec.networkMode ?? "nat") === "custom") {
    entries["ethernet0.vnet"] = spec.networkLabel || "vmnet2";
  }

  if (spec.isoPath) {
    entries["sata0.present"] = "TRUE";
    entries["sata0:0.present"] = "TRUE";
    entries["sata0:0.deviceType"] = "cdrom-image";
    entries["sata0:0.fileName"] = spec.isoPath;
    entries["sata0:0.startConnected"] = "TRUE";
  }

  return serializeVmxDocument(entries);
}

function parseVmxDocument(document: string) {
  const entries: Record<string, string> = {};

  for (const line of document.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+?)\s*=\s*"?(.*?)"?\s*$/);
    if (!match) {
      continue;
    }
    entries[match[1].trim()] = match[2];
  }

  return entries;
}

function serializeVmxDocument(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([key, value]) => `${key} = "${value}"`)
    .join("\n");
}

function parseInteger(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBoolean(value?: string) {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "true":
    case "yes":
    case "1":
      return true;
    case "false":
    case "no":
    case "0":
      return false;
    default:
      return null;
  }
}

function collectNetworkInterfaces(entries: Record<string, string>): VmwareNetworkInterfaceSnapshot[] {
  const interfaceIndexes = Array.from(
    new Set(
      Object.keys(entries)
        .map((key) => key.match(/^ethernet(\d+)\./)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);

  return interfaceIndexes
    .map((index): VmwareNetworkInterfaceSnapshot | null => {
      const prefix = `ethernet${index}`;
      const present = parseBoolean(entries[`${prefix}.present`]);
      if (present === false) {
        return null;
      }

      const nic: VmwareNetworkInterfaceSnapshot = {
        key: prefix,
        index,
        mode: fromVmxConnectionType(entries[`${prefix}.connectionType`]),
        connectionType: entries[`${prefix}.connectionType`] || null,
        label: entries[`${prefix}.vnet`] || null,
        virtualDev: entries[`${prefix}.virtualDev`] || null,
        macAddress:
          entries[`${prefix}.generatedAddress`] ||
          entries[`${prefix}.address`] ||
          null,
        present: true,
        startConnected: parseBoolean(entries[`${prefix}.startConnected`]),
      };

      return nic;
    })
    .filter((value): value is VmwareNetworkInterfaceSnapshot => value !== null);
}

async function collectDiskDevices(
  entries: Record<string, string>,
  vmDirectory: string,
): Promise<VmwareDiskSnapshot[]> {
  const deviceKeys = Array.from(
    new Set(
      Object.keys(entries)
        .map((key) => key.match(/^((?:scsi|sata|ide|nvme)\d+:\d+)\./)?.[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const disks = await Promise.all(
    deviceKeys.map(async (deviceKey) => {
      const present = parseBoolean(entries[`${deviceKey}.present`]);
      if (present === false) {
        return null;
      }

      const fileName = entries[`${deviceKey}.fileName`] || null;
      const deviceType = entries[`${deviceKey}.deviceType`] || inferDiskDeviceType(fileName);
      if (deviceType === "cdrom-image" || deviceType === "atapi-cdrom") {
        return null;
      }

      const [controller, unit] = deviceKey.split(":");

      return {
        key: deviceKey,
        controller,
        unit,
        fileName,
        deviceType,
        mode: entries[`${deviceKey}.mode`] || null,
        sizeGb: fileName ? await readVirtualDiskSizeGb(path.resolve(vmDirectory, fileName)) : null,
      } satisfies VmwareDiskSnapshot;
    }),
  );

  return disks.filter((value): value is VmwareDiskSnapshot => value !== null);
}

function inferDiskDeviceType(fileName: string | null) {
  if (!fileName) {
    return null;
  }

  if (fileName.toLowerCase().endsWith(".vmdk")) {
    return "disk";
  }

  return null;
}

async function readVirtualDiskSizeGb(vmdkPath: string): Promise<number | null> {
  try {
    const descriptor = await readFile(vmdkPath, "utf8");
    const match = descriptor.match(/^RW\s+(\d+)\s+/m);
    if (!match) {
      return null;
    }

    const sectors = Number(match[1]);
    if (!Number.isFinite(sectors) || sectors <= 0) {
      return null;
    }

    const bytes = sectors * 512;
    return Math.round((bytes / (1024 ** 3)) * 100) / 100;
  } catch {
    return null;
  }
}
