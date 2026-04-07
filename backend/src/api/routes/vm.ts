import { Router } from "express";
import { prisma } from "../../core/prisma";
import { vmIdSchema } from "../../validators/vm.validator";
import { auditMiddleware } from "../middleware/audit";
import { z } from "zod";
import { getVmPowerState, listRunningVMs } from "../../adapters/vmware.adapter";
import { logger } from "../../core/logger";
import net from "net";
import { isCriticalInfrastructureVm } from "../../services/policy.service";
import { executeSSH } from "../../adapters/ssh.adapter";

const router = Router();
type VmWithTags = Awaited<ReturnType<typeof prisma.vM.findMany>>[number] & {
  tags?: string | null;
};

const updateTagsSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(12),
});

const updateConnectionSchema = z.object({
  sshHost: z.string().trim().max(255).optional().or(z.literal("")),
  sshPort: z.number().int().min(1).max(65535).nullable().optional(),
  sshUser: z.string().trim().max(100).optional().or(z.literal("")),
});

const osFamilySchema = z
  .enum(["ubuntu", "debian", "kali", "windows", "fortigate", "other"])
  .nullable()
  .optional();

const createVmSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  vmxPath: z.string().trim().min(1).max(1024),
  type: z.enum(["PERSISTENT", "TEMPLATE", "EPHEMERAL"]).default("PERSISTENT"),
  tags: z.array(z.string().trim().min(1).max(24)).max(12).optional(),
  osFamily: osFamilySchema,
  osVersion: z.string().trim().max(160).optional().or(z.literal("")),
  sshHost: z.string().trim().max(255).optional().or(z.literal("")),
  sshPort: z.number().int().min(1).max(65535).nullable().optional(),
  sshUser: z.string().trim().max(100).optional().or(z.literal("")),
  sshKeyPath: z.string().trim().max(1024).optional().or(z.literal("")),
  sshPassword: z.string().max(512).optional().or(z.literal("")),
});

const updateVmSettingsSchema = createVmSchema.omit({ id: true }).extend({
  sshPassword: z.string().max(512).optional(),
});

const updateFeedQuerySchema = z.object({
  mode: z.enum(["security", "full"]).optional(),
});

const CRITICAL_UPDATE_PACKAGES = [
  "linux-generic",
  "linux-image-generic",
  "linux-headers-generic",
  "linux-modules-extra",
  "linux-image",
  "linux-headers",
  "linux-modules",
  "openssl",
  "openssh-server",
  "openssh-client",
  "systemd",
  "systemd-sysv",
  "libc6",
  "libc-bin",
  "sudo",
  "cloud-init",
  "initramfs-tools",
  "grub",
  "grub2",
  "netplan.io",
  "network-manager",
] as const;

function getOsFamilyName(osFamily: string | null | undefined) {
  return osFamily?.trim().toLowerCase() ?? "";
}

function inferOsFamilyFromVm(vm: {
  id?: string | null;
  name?: string | null;
  vmxPath?: string | null;
  osFamily?: string | null;
  osVersion?: string | null;
}) {
  const explicitFamily = getOsFamilyName(vm.osFamily);
  if (explicitFamily) {
    return explicitFamily;
  }

  const haystack = [vm.osVersion, vm.name, vm.id, vm.vmxPath]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bwindows\b|\bwin-srv\b|\bwin-server\b/.test(haystack)) {
    return "windows";
  }

  if (/\bubuntu\b/.test(haystack)) {
    return "ubuntu";
  }

  if (/\bkali\b/.test(haystack)) {
    return "kali";
  }

  if (/\bdebian\b/.test(haystack)) {
    return "debian";
  }

  return "";
}

function isAptManagedOs(osFamily: string | null | undefined) {
  return ["ubuntu", "debian", "kali"].includes(getOsFamilyName(osFamily));
}

function isWindowsManagedOs(osFamily: string | null | undefined) {
  return getOsFamilyName(osFamily) === "windows";
}

function isSupportedUpdateOs(osFamily: string | null | undefined) {
  return isAptManagedOs(osFamily) || isWindowsManagedOs(osFamily);
}

function parseTags(rawTags: string | null | undefined): string[] {
  if (!rawTags) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function serializeVm(vm: VmWithTags, powerState: "ON" | "OFF" | "UNKNOWN") {
  const inferredOsFamily = inferOsFamilyFromVm(vm);

  return {
    ...vm,
    osFamily: vm.osFamily?.trim() ? vm.osFamily : inferredOsFamily || null,
    tags: parseTags(vm.tags),
    powerState,
    isCriticalInfrastructure: isCriticalInfrastructureVm(vm),
  };
}

async function syncLastSeenOnline(vms: VmWithTags[], runningVms: string[]) {
  const now = new Date();
  const runningPaths = new Set(runningVms);

  await Promise.all(
    vms
      .filter((vm) => runningPaths.has(vm.vmxPath))
      .map((vm) => updateVmLastSeenOnline(vm.id, now)),
  );

  return vms.map((vm) =>
    runningPaths.has(vm.vmxPath)
      ? {
          ...vm,
          lastSeenOnlineAt: now,
        }
      : vm,
  );
}

async function updateVmLastSeenOnline(vmId: string, timestamp: Date) {
  try {
    await prisma.vM.update({
      where: { id: vmId },
      data: { lastSeenOnlineAt: timestamp } as never,
    });
  } catch (error) {
    if (isUnknownFieldError(error, "lastSeenOnlineAt")) {
      logger.warn({ vmId }, "Skipping lastSeenOnlineAt update because the running Prisma client is stale");
      return;
    }

    throw error;
  }
}

function isUnknownFieldError(error: unknown, fieldName: string) {
  return (
    error instanceof Error &&
    error.name === "PrismaClientValidationError" &&
    error.message.includes(`Unknown argument \`${fieldName}\``)
  );
}

function checkTcpConnection(host: string, port: number, timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function buildUpdateFeedCommand() {
  return [
    'printf "__PCM_SECTION__ os_version %s\\n" "$( . /etc/os-release && printf "%s" "$PRETTY_NAME" )"',
    'printf "__PCM_SECTION__ kernel %s\\n" "$(uname -r)"',
    'printf "__PCM_SECTION__ reboot_required %s\\n" "$(if [ -f /var/run/reboot-required ]; then printf yes; else printf no; fi)"',
    'printf "__PCM_SECTION__ apt_update %s\\n" "$(if sudo -n apt update >/dev/null 2>&1; then printf ok; else printf failed; fi)"',
    'echo "__PCM_SECTION__ upgradable_start"',
    "apt list --upgradable 2>/dev/null | sed '1d' || true",
    'echo "__PCM_SECTION__ upgradable_end"',
    'echo "__PCM_SECTION__ security_start"',
    'if command -v unattended-upgrade >/dev/null 2>&1; then if sudo -n unattended-upgrade --dry-run --debug 2>/dev/null | sed -n \'s/^Inst /Inst /p\'; then true; else echo "__PCM_SECURITY_DRY_RUN_FAILED__"; fi; else echo "__PCM_UNATTENDED_UPGRADE_MISSING__"; fi',
    'echo "__PCM_SECTION__ security_end"',
  ].join("; ");
}

function buildWindowsUpdateFeedCommand() {
  return [
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy Bypass",
    "-Command",
    "\"$ErrorActionPreference = 'Stop';",
    "$session = New-Object -ComObject Microsoft.Update.Session;",
    "$searcher = $session.CreateUpdateSearcher();",
    "$result = $searcher.Search('IsInstalled=0 and Type=''Software''');",
    "$items = @();",
    "for ($i = 0; $i -lt $result.Updates.Count; $i++) {",
    "$u = $result.Updates.Item($i);",
    "$items += [pscustomobject]@{",
    "title = $u.Title;",
    "kb = ($u.KBArticleIDs -join ',');",
    "severity = $u.MsrcSeverity;",
    "rebootRequired = $u.RebootRequired;",
    "categories = (($u.Categories | ForEach-Object { $_.Name }) -join ',')",
    "};",
    "}",
    "$os = Get-CimInstance Win32_OperatingSystem;",
    "$pendingReboot = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired');",
    "[pscustomobject]@{",
    "osVersion = ($os.Caption + ' ' + $os.Version);",
    "kernelVersion = $os.BuildNumber;",
    "rebootRequired = $pendingReboot;",
    "updates = $items",
    "} | ConvertTo-Json -Depth 5 -Compress\"",
  ].join(" ");
}

function buildMetadataRefreshCommand() {
  return [
    "if [ -f /etc/os-release ]; then . /etc/os-release; printf '__PCM_META__ os_family %s\\n' \"$ID\"; printf '__PCM_META__ os_version %s\\n' \"$PRETTY_NAME\"; fi",
    "printf '__PCM_META__ reboot_required %s\\n' \"$(if [ -f /var/run/reboot-required ]; then printf yes; else printf no; fi)\"",
  ].join("; ");
}

function buildWindowsMetadataRefreshCommand() {
  return [
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy Bypass",
    "-Command",
    "\"$os = Get-CimInstance Win32_OperatingSystem;",
    "$pendingReboot = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired');",
    "Write-Output '__PCM_META__ os_family windows';",
    "Write-Output ('__PCM_META__ os_version ' + $os.Caption + ' ' + $os.Version);",
    "Write-Output ('__PCM_META__ reboot_required ' + $(if ($pendingReboot) { 'yes' } else { 'no' }))\"",
  ].join(" ");
}

function parseMetadataRefreshOutput(stdout: string) {
  const osFamily = stdout.match(/__PCM_META__ os_family ([^\r\n]+)/)?.[1]?.trim() || null;
  const osVersion = stdout.match(/__PCM_META__ os_version ([^\r\n]+)/)?.[1]?.trim() || null;
  const rebootRequired =
    stdout.match(/__PCM_META__ reboot_required ([^\r\n]+)/)?.[1]?.trim() === "yes";

  return {
    osFamily,
    osVersion,
    rebootRequired,
  };
}

type UpdateFeedPackage = {
  name: string;
  targetVersion: string | null;
  currentVersion: string | null;
  repository: string | null;
  securityCandidate: boolean;
  critical: boolean;
  kernelRelated: boolean;
};

function parseUpdateFeedOutput(stdout: string, mode: "security" | "full") {
  const lines = stdout.split(/\r?\n/);
  const sections = {
    upgradable: [] as string[],
    security: [] as string[],
  };
  let currentSection: "upgradable" | "security" | null = null;
  let osVersion: string | null = null;
  let kernelVersion: string | null = null;
  let rebootRequired = false;
  let aptUpdateStatus: "ok" | "failed" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("__PCM_SECTION__ os_version ")) {
      osVersion = line.replace("__PCM_SECTION__ os_version ", "").trim() || null;
      continue;
    }

    if (line.startsWith("__PCM_SECTION__ kernel ")) {
      kernelVersion = line.replace("__PCM_SECTION__ kernel ", "").trim() || null;
      continue;
    }

    if (line.startsWith("__PCM_SECTION__ reboot_required ")) {
      rebootRequired = line.replace("__PCM_SECTION__ reboot_required ", "").trim() === "yes";
      continue;
    }

    if (line.startsWith("__PCM_SECTION__ apt_update ")) {
      const value = line.replace("__PCM_SECTION__ apt_update ", "").trim();
      aptUpdateStatus = value === "ok" || value === "failed" ? value : null;
      continue;
    }

    if (line === "__PCM_SECTION__ upgradable_start") {
      currentSection = "upgradable";
      continue;
    }

    if (line === "__PCM_SECTION__ upgradable_end") {
      currentSection = null;
      continue;
    }

    if (line === "__PCM_SECTION__ security_start") {
      currentSection = "security";
      continue;
    }

    if (line === "__PCM_SECTION__ security_end") {
      currentSection = null;
      continue;
    }

    if (currentSection && line) {
      sections[currentSection].push(line);
    }
  }

  const securityPackages = new Map<string, { currentVersion: string | null; targetVersion: string | null }>();
  for (const line of sections.security) {
    if (line === "__PCM_UNATTENDED_UPGRADE_MISSING__") {
      continue;
    }

    const match = line.match(/^Inst\s+(\S+)(?:\s+\[([^\]]+)\])?\s+\(([^ )]+)/);
    if (!match) {
      continue;
    }

    securityPackages.set(match[1], {
      currentVersion: match[2] ?? null,
      targetVersion: match[3] ?? null,
    });
  }

  const packages = sections.upgradable
    .map((line) => {
      const match = line.match(/^([^/]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from: ([^\]]+)\]/);
      if (!match) {
        return null;
      }

      const name = match[1];
      const repository = match[2];
      const targetVersion = match[3];
      const currentVersion = match[4];
      const securityCandidate = securityPackages.has(name);
      const loweredName = name.toLowerCase();
      const kernelRelated = loweredName.startsWith("linux-");
      const critical =
        kernelRelated ||
        CRITICAL_UPDATE_PACKAGES.some((packageName) => loweredName === packageName || loweredName.startsWith(`${packageName}-`));

      return {
        name,
        repository,
        targetVersion,
        currentVersion,
        securityCandidate,
        critical,
        kernelRelated,
      } satisfies UpdateFeedPackage;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const sourceNotes: string[] = [];
  if (aptUpdateStatus === "failed") {
    sourceNotes.push(
      "apt update could not be refreshed with sudo -n, so package data may reflect cached indexes or restricted sudo privileges.",
    );
  }
  if (sections.security.includes("__PCM_UNATTENDED_UPGRADE_MISSING__")) {
    sourceNotes.push(
      "unattended-upgrade is not installed, so the security-targeted preview is inferred from the normal package view.",
    );
  }
  if (sections.security.includes("__PCM_SECURITY_DRY_RUN_FAILED__")) {
    sourceNotes.push(
      "The unattended-upgrade dry run could not be executed with sudo -n, so security-only classification may be incomplete.",
    );
  }

  const hasDirectSecurityClassification =
    securityPackages.size > 0 &&
    !sections.security.includes("__PCM_SECURITY_DRY_RUN_FAILED__");

  const normalizedPackages = packages.map((item) => {
    const inferredSecurityCandidate =
      item.securityCandidate ||
      (!hasDirectSecurityClassification &&
        typeof item.repository === "string" &&
        item.repository.toLowerCase().includes("security"));

    return {
      ...item,
      securityCandidate: inferredSecurityCandidate,
    };
  });

  const relevantPackages =
    mode === "security"
      ? normalizedPackages.filter((item) => item.securityCandidate)
      : normalizedPackages;
  const criticalPackages = relevantPackages.filter((item) => item.critical);
  const kernelPackages = relevantPackages.filter((item) => item.kernelRelated);
  const highlights: string[] = [];

  if (relevantPackages.length === 0) {
    highlights.push(
      mode === "security"
        ? "No security-targeted package changes are currently queued by unattended-upgrade."
        : "No pending package upgrades were detected after apt refresh.",
    );
  }

  if (kernelPackages.length > 0) {
    highlights.push(
      `Kernel-related changes detected: ${kernelPackages.map((item) => item.name).join(", ")}.`,
    );
  }

  const corePackages = criticalPackages.filter((item) => !item.kernelRelated);
  if (corePackages.length > 0) {
    highlights.push(
      `Core platform packages pending: ${corePackages.map((item) => item.name).join(", ")}.`,
    );
  }

  if (rebootRequired) {
    highlights.push("The VM already reports that a reboot is required.");
  }

  return {
    mode,
    generatedAt: new Date().toISOString(),
    osVersion,
    kernelVersion,
    rebootRequired,
    aptUpdateStatus,
    totalUpgradable: normalizedPackages.length,
    securityCandidateCount: normalizedPackages.filter((item) => item.securityCandidate).length,
    highlights,
    sourceNotes,
    packages: normalizedPackages,
  };
}

function parseWindowsUpdateFeedOutput(stdout: string, mode: "security" | "full") {
  const parsed = JSON.parse(stdout.trim() || "{}");
  const updates = Array.isArray(parsed.updates)
    ? parsed.updates
    : parsed.updates
      ? [parsed.updates]
      : [];

  const packages: UpdateFeedPackage[] = updates.map((item: any) => {
    const title = String(item.title ?? "Windows update");
    const severity = String(item.severity ?? "");
    const categories = String(item.categories ?? "");
    const kb = String(item.kb ?? "");
    const securityCandidate =
      Boolean(severity) ||
      categories.toLowerCase().includes("security") ||
      title.toLowerCase().includes("security");
    const critical =
      ["critical", "important"].includes(severity.toLowerCase()) ||
      title.toLowerCase().includes("cumulative update");
    const kernelRelated =
      title.toLowerCase().includes("cumulative update") ||
      title.toLowerCase().includes("servicing stack");

    return {
      name: title,
      repository: categories || "Windows Update",
      targetVersion: kb ? `KB${kb}` : null,
      currentVersion: null,
      securityCandidate,
      critical,
      kernelRelated,
    } satisfies UpdateFeedPackage;
  });

  const relevantPackages =
    mode === "security"
      ? packages.filter((item) => item.securityCandidate)
      : packages;
  const highlights: string[] = [];
  const kernelPackages = relevantPackages.filter((item) => item.kernelRelated);
  const criticalPackages = relevantPackages.filter((item) => item.critical);

  if (relevantPackages.length === 0) {
    highlights.push(
      mode === "security"
        ? "No Windows security-classified updates were detected."
        : "No pending Windows software updates were detected.",
    );
  }

  if (kernelPackages.length > 0) {
    highlights.push(
      `Windows cumulative or servicing-stack updates detected: ${kernelPackages
        .map((item) => item.targetVersion ?? item.name)
        .join(", ")}.`,
    );
  }

  if (criticalPackages.length > 0) {
    highlights.push(
      `Critical or important Windows updates detected: ${criticalPackages
        .map((item) => item.targetVersion ?? item.name)
        .join(", ")}.`,
    );
  }

  return {
    mode,
    generatedAt: new Date().toISOString(),
    osVersion: parsed.osVersion ?? null,
    kernelVersion: parsed.kernelVersion ?? null,
    rebootRequired: Boolean(parsed.rebootRequired),
    aptUpdateStatus: null,
    totalUpgradable: packages.length,
    securityCandidateCount: packages.filter((item) => item.securityCandidate).length,
    highlights,
    sourceNotes: [
      "Windows update feed is generated through Windows Update Agent over SSH; security classification depends on Microsoft metadata exposed to the guest.",
    ],
    packages,
  };
}

/**
 * GET /api/vms
 */
router.get("/", auditMiddleware("LIST_VMS"), async (req, res) => {
  const vms = await prisma.vM.findMany({
    orderBy: { createdAt: "desc" },
  });

  const runningVms: string[] = await listRunningVMs().catch(() => []);
  const syncedVms = await syncLastSeenOnline(vms as VmWithTags[], runningVms);
  const data = syncedVms.map((vm) =>
    serializeVm(vm, runningVms.includes(vm.vmxPath) ? "ON" : "OFF"),
  );

  res.json(data);
});

router.post("/", auditMiddleware("CREATE_VM"), async (req, res) => {
  const parsed = createVmSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM payload", details: parsed.error.flatten() });
  }

  const payload = parsed.data;
  const existing = await prisma.vM.findUnique({
    where: { id: payload.id },
  });

  if (existing) {
    return res.status(409).json({ error: "A VM with this id already exists" });
  }

  const createdVm = (await prisma.vM.create({
    data: {
      id: payload.id,
      name: payload.name,
      vmxPath: payload.vmxPath,
      type: payload.type,
      tags: JSON.stringify(normalizeTags(payload.tags ?? [])),
      osFamily: payload.osFamily || inferOsFamilyFromVm(payload) || null,
      osVersion: payload.osVersion?.trim() || null,
      sshHost: payload.sshHost?.trim() || null,
      sshPort: payload.sshPort ?? null,
      sshUser: payload.sshUser?.trim() || null,
      sshKeyPath: payload.sshKeyPath?.trim() || null,
      sshPassword: payload.sshPassword || null,
    },
  })) as VmWithTags;

  res.status(201).json(serializeVm(createdVm, await getVmPowerState(createdVm.vmxPath)));
});

router.patch("/:id/settings", auditMiddleware("UPDATE_VM_SETTINGS"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedBody = updateVmSettingsSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid VM settings payload", details: parsedBody.error.flatten() });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const payload = parsedBody.data;
  const updateData: Record<string, unknown> = {
    name: payload.name,
    vmxPath: payload.vmxPath,
    type: payload.type,
    tags: JSON.stringify(normalizeTags(payload.tags ?? [])),
    osFamily: payload.osFamily || inferOsFamilyFromVm(payload) || null,
    osVersion: payload.osVersion?.trim() || null,
    sshHost: payload.sshHost?.trim() || null,
    sshPort: payload.sshPort ?? null,
    sshUser: payload.sshUser?.trim() || null,
    sshKeyPath: payload.sshKeyPath?.trim() || null,
  };

  if (payload.sshPassword !== undefined) {
    updateData.sshPassword = payload.sshPassword || null;
  }

  const updatedVm = (await prisma.vM.update({
    where: { id: vm.id },
    data: updateData as never,
  })) as VmWithTags;

  res.json(serializeVm(updatedVm, await getVmPowerState(updatedVm.vmxPath)));
});

/**
 * GET /api/vms/:id
 */
router.get("/:id", auditMiddleware("GET_VM"), async (req, res) => {
  const parsed = vmIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsed.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const vmWithTags = vm as VmWithTags;

  res.json(serializeVm(vmWithTags, await getVmPowerState(vm.vmxPath)));
});

router.get("/:id/ssh-ready", auditMiddleware("CHECK_VM_SSH_READY"), async (req, res) => {
  const parsed = vmIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsed.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  if (!vm.sshHost || !vm.sshUser) {
    return res.json({ ready: false, reason: "SSH not configured" });
  }

  const ready = await checkTcpConnection(vm.sshHost, vm.sshPort || 22);
  return res.json({ ready });
});

router.get("/:id/update-feed", auditMiddleware("GET_VM_UPDATE_FEED"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);
  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedQuery = updateFeedQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: "Invalid update feed query" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  if (!vm.sshHost || !vm.sshUser) {
    return res.status(400).json({ error: "VM SSH not configured" });
  }

  const powerState = await getVmPowerState(vm.vmxPath);
  if (powerState !== "ON") {
    return res.status(409).json({ error: "VM must be running to inspect update feed" });
  }

  const osFamily = inferOsFamilyFromVm(vm);

  if (osFamily && !isSupportedUpdateOs(osFamily)) {
    return res.status(400).json({
      error: "Update feed is currently supported only for apt-managed Linux VMs and Windows VMs",
    });
  }

  const mode = parsedQuery.data.mode ?? "security";

  try {
    const result = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: vm.sshPassword ?? undefined,
      command: isWindowsManagedOs(osFamily)
        ? buildWindowsUpdateFeedCommand()
        : buildUpdateFeedCommand(),
      timeoutMs: 90_000,
    });

    const feed = isWindowsManagedOs(osFamily)
      ? parseWindowsUpdateFeedOutput(result.stdout, mode)
      : parseUpdateFeedOutput(result.stdout, mode);

    return res.json({
      vmId: vm.id,
      vmName: vm.name,
      ...feed,
      stderr: result.stderr || null,
    });
  } catch (error: any) {
    logger.error({ err: error, vmId: vm.id }, "Failed to generate VM update feed");
    return res.status(500).json({ error: error?.message ?? "Failed to generate VM update feed" });
  }
});

router.post("/:id/refresh-state", auditMiddleware("REFRESH_VM_STATE"), async (req, res) => {
  const parsed = vmIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsed.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const powerState = await getVmPowerState(vm.vmxPath);
  if (powerState !== "ON") {
    return res.status(409).json({ error: "VM must be running to refresh live state" });
  }

  if (!vm.sshHost || !vm.sshUser) {
    return res.status(400).json({ error: "VM SSH not configured" });
  }

  try {
    const result = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: vm.sshPassword ?? undefined,
      command: isWindowsManagedOs(inferOsFamilyFromVm(vm))
        ? buildWindowsMetadataRefreshCommand()
        : buildMetadataRefreshCommand(),
      timeoutMs: 20_000,
    });

    const metadata = parseMetadataRefreshOutput(result.stdout);
    const now = new Date();
    const updatedVm = (await prisma.vM.update({
      where: { id: vm.id },
      data: {
        lastSeenOnlineAt: now,
        osFamily: metadata.osFamily ?? undefined,
        osVersion: metadata.osVersion ?? undefined,
        rebootRequired: metadata.rebootRequired,
      } as never,
    })) as VmWithTags;

    return res.json({
      vm: serializeVm(
        {
          ...updatedVm,
          lastSeenOnlineAt: now,
        },
        "ON",
      ),
      refreshedAt: now.toISOString(),
    });
  } catch (error: any) {
    logger.error({ err: error, vmId: vm.id }, "Failed to refresh VM live state");
    return res.status(500).json({ error: error?.message ?? "Failed to refresh VM live state" });
  }
});

router.patch("/:id/tags", auditMiddleware("UPDATE_VM_TAGS"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedBody = updateTagsSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid tags payload" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const tags = normalizeTags(parsedBody.data.tags);

  const updatedVm = await prisma.vM.update({
    where: { id: vm.id },
    data: {
      tags: JSON.stringify(tags),
    },
  });

  res.json({
    ...updatedVm,
    tags,
    powerState: await getVmPowerState(updatedVm.vmxPath),
  });
});

router.patch("/:id/connection", auditMiddleware("UPDATE_VM_CONNECTION"), async (req, res) => {
  const parsedId = vmIdSchema.safeParse(req.params);

  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid VM ID" });
  }

  const parsedBody = updateConnectionSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid connection payload" });
  }

  const vm = await prisma.vM.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!vm) {
    return res.status(404).json({ error: "VM not found" });
  }

  const sshHost = parsedBody.data.sshHost?.trim() || null;
  const sshUser = parsedBody.data.sshUser?.trim() || null;
  const sshPort = parsedBody.data.sshPort ?? null;

  const updatedVm = (await prisma.vM.update({
    where: { id: vm.id },
    data: {
      sshHost,
      sshUser,
      sshPort,
    },
  })) as VmWithTags;

  res.json(serializeVm(updatedVm, await getVmPowerState(updatedVm.vmxPath)));
});

export default router;
