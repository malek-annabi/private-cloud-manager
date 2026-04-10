const PLUGIN_ID = "private-cloud-manager";
const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_TIMEOUT_MS = 15000;
const CRITICAL_GATEWAY_VM_ID = "FG-VM";

function isAptManagedOs(osFamily: string | null | undefined) {
  const normalized = osFamily?.trim().toLowerCase();
  return normalized === "ubuntu" || normalized === "debian" || normalized === "kali";
}

function isManagedUpdateOs(osFamily: string | null | undefined) {
  return isAptManagedOs(osFamily) || osFamily?.trim().toLowerCase() === "windows";
}

function getPluginConfig(ctx: any) {
  const pluginConfig =
    ctx?.config?.plugins?.entries?.[PLUGIN_ID]?.config;

  return {
    baseUrl:
      pluginConfig?.baseUrl ??
      process.env.PCM_BASE_URL ??
      DEFAULT_BASE_URL,
    token:
      pluginConfig?.token ??
      process.env.PCM_TOKEN ??
      "",
    timeoutMs:
      pluginConfig?.timeoutMs ??
      (process.env.PCM_TIMEOUT_MS
        ? Number(process.env.PCM_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS),
  };
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function apiRequest(ctx: any, path: string, init?: RequestInit) {
  const config = getPluginConfig(ctx);

  if (!config.token) {
    throw new Error(
      "private-cloud-manager token is not configured. Set plugins.entries.private-cloud-manager.config.token or PCM_TOKEN."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `Backend request failed (${response.status} ${response.statusText}): ${body || "no response body"}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function formatVmList(vms: any[], includeSshDetails: boolean) {
  if (!Array.isArray(vms) || vms.length === 0) {
    return "No VMs were returned by the private cloud manager backend.";
  }

  return [
    `Found ${vms.length} VM(s):`,
    ...vms.map((vm) => {
      const state = vm.powerState ? ` state=${vm.powerState}` : "";
      const base = `- ${vm.id}: ${vm.name} [${vm.type}]${state}`;

      if (!includeSshDetails) {
        return base;
      }

      const ssh = vm.sshHost
        ? ` ssh=${vm.sshUser ?? "unknown"}@${vm.sshHost}:${vm.sshPort ?? 22}`
        : " ssh=not-configured";

      return `${base}${ssh}`;
    }),
  ].join("\n");
}

function formatJobSummary(job: any) {
  return [
    `Job ${job.id}`,
    `type=${job.type}`,
    `status=${job.status}`,
    job.createdAt ? `createdAt=${job.createdAt}` : null,
    job.updatedAt ? `updatedAt=${job.updatedAt}` : null,
    job.result ? `result=${job.result}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatJobDetail(payload: any) {
  const job = payload?.job;
  const logs = Array.isArray(payload?.logs) ? payload.logs : [];

  if (!job) {
    return "No job data returned by the backend.";
  }

  const logText =
    logs.length === 0
      ? "No job logs available."
      : logs
          .map((log: any) => `[${log.createdAt}] ${log.level}: ${log.message}`)
          .join("\n");

  return `${formatJobSummary(job)}\nlogs:\n${logText}`;
}

async function executeListVms(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const vms = await apiRequest(ctx, "/vms");
  return textResult(formatVmList(vms, Boolean(params?.includeSshDetails)));
}

async function executeStartVm(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const job = await apiRequest(ctx, "/jobs/start-vm", {
    method: "POST",
    body: JSON.stringify({ vmId: params.vmId }),
  });

  return textResult(
    `Start VM job queued.\nThis call only queued a VM start action.\n${formatJobSummary(job)}`
  );
}

async function executeCreateVm(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const vm = await apiRequest(ctx, "/vms", {
    method: "POST",
    body: JSON.stringify({
      id: params.id,
      name: params.name,
      vmxPath: params.vmxPath,
      type: params.type ?? "PERSISTENT",
      tags: Array.isArray(params.tags) ? params.tags : [],
      osFamily: params.osFamily ?? null,
      osVersion: params.osVersion ?? "",
      sshHost: params.sshHost ?? "",
      sshPort: params.sshPort ?? 22,
      sshUser: params.sshUser ?? "",
      sshKeyPath: params.sshKeyPath ?? "",
      sshPassword: params.sshPassword ?? "",
    }),
  });

      return textResult(
        [
          `VM registered in Private Cloud Manager.`,
          `This call added a VM record to the PCM database, which is the source of truth for VM inventory.`,
          `id=${vm.id}`,
      `name=${vm.name}`,
      vm.osFamily ? `osFamily=${vm.osFamily}` : null,
      vm.powerState ? `powerState=${vm.powerState}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function executeUpdateVmSettings(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const body: Record<string, unknown> = {
    name: params.name,
    vmxPath: params.vmxPath,
    type: params.type ?? "PERSISTENT",
    tags: Array.isArray(params.tags) ? params.tags : [],
    osFamily: params.osFamily ?? null,
    osVersion: params.osVersion ?? "",
    sshHost: params.sshHost ?? "",
    sshPort: params.sshPort ?? 22,
    sshUser: params.sshUser ?? "",
    sshKeyPath: params.sshKeyPath ?? "",
  };

  if (typeof params.sshPassword === "string" && params.sshPassword.length > 0) {
    body.sshPassword = params.sshPassword;
  }

  const vm = await apiRequest(ctx, `/vms/${encodeURIComponent(params.vmId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

      return textResult(
        [
          `VM settings updated in Private Cloud Manager.`,
          `This call updated the PCM database record, which is the source of truth for VM inventory.`,
          `id=${vm.id}`,
      `name=${vm.name}`,
      vm.osFamily ? `osFamily=${vm.osFamily}` : null,
      vm.powerState ? `powerState=${vm.powerState}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function executeStopVm(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const job = await apiRequest(ctx, "/jobs/stop-vm", {
    method: "POST",
    body: JSON.stringify({ vmId: params.vmId }),
  });

  return textResult(
    `Stop VM job queued.\nThis call only queued a VM stop action.\n${formatJobSummary(job)}`
  );
}

async function executeSshExec(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const job = await apiRequest(ctx, "/jobs/ssh", {
    method: "POST",
    body: JSON.stringify({
      vmId: params.vmId,
      command: params.command,
    }),
  });

  return textResult(
    `SSH execution job queued.\nThis call only queued an SSH command job.\n${formatJobSummary(job)}`
  );
}

async function executeGetJobStatus(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const payload = await apiRequest(ctx, `/jobs/${params.jobId}`);
  return textResult(formatJobDetail(payload));
}

async function executeUpdateVm(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const job = await apiRequest(ctx, "/jobs/update-vm", {
    method: "POST",
    body: JSON.stringify({
      vmId: params.vmId,
      mode: params.mode ?? "security",
      autoremove: params.autoremove ?? true,
    }),
  });

  return textResult(
    `Update server job queued.\nThis call only queued a managed VM update action.\n${formatJobSummary(job)}`
  );
}

async function executeGetUpdateFeed(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const mode = params.mode ?? "security";
  const payload = await apiRequest(
    ctx,
    `/vms/${encodeURIComponent(params.vmId)}/update-feed?mode=${encodeURIComponent(mode)}`
  );

  const highlights = Array.isArray(payload?.highlights) ? payload.highlights : [];
  const packages = Array.isArray(payload?.packages) ? payload.packages : [];
  const topPackages = packages.slice(0, 8).map((pkg: any) => {
    const tags = [
      pkg.securityCandidate ? "security" : null,
      pkg.critical ? "critical" : null,
      pkg.kernelRelated ? "kernel" : null,
    ].filter(Boolean);

    return `- ${pkg.name}: ${pkg.currentVersion ?? "unknown"} -> ${pkg.targetVersion ?? "unknown"}${tags.length ? ` [${tags.join(", ")}]` : ""}`;
  });

  return textResult(
    [
      `Update feed for ${payload.vmName ?? params.vmId}`,
      `mode=${payload.mode ?? mode}`,
      payload.osVersion ? `os=${payload.osVersion}` : null,
      payload.kernelVersion ? `kernel=${payload.kernelVersion}` : null,
      `totalUpgradable=${payload.totalUpgradable ?? 0}`,
      `securityCandidates=${payload.securityCandidateCount ?? 0}`,
      `rebootRequired=${payload.rebootRequired ? "yes" : "no"}`,
      highlights.length ? `highlights:\n${highlights.map((line: string) => `- ${line}`).join("\n")}` : "highlights:\n- none",
      topPackages.length ? `packages:\n${topPackages.join("\n")}` : "packages:\n- none",
      packages.length > topPackages.length ? `morePackages=${packages.length - topPackages.length}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function executeRefreshVmState(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const payload = await apiRequest(
    ctx,
    `/vms/${encodeURIComponent(params.vmId)}/refresh-state`,
    {
      method: "POST",
    }
  );

  return textResult(
    [
      `VM state refreshed for ${payload.vm?.name ?? params.vmId}.`,
      payload.vm?.powerState ? `powerState=${payload.vm.powerState}` : null,
      payload.vm?.osVersion ? `os=${payload.vm.osVersion}` : null,
      typeof payload.vm?.rebootRequired === "boolean"
        ? `rebootRequired=${payload.vm.rebootRequired ? "yes" : "no"}`
        : null,
      payload.vm?.lastSeenOnlineAt ? `lastSeenOnlineAt=${payload.vm.lastSeenOnlineAt}` : null,
      payload.vm?.lastSshLoginAt ? `lastSshLoginAt=${payload.vm.lastSshLoginAt}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function executeRebootVm(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const job = await apiRequest(ctx, "/jobs/reboot-vm", {
    method: "POST",
    body: JSON.stringify({
      vmId: params.vmId,
      rebootMode: params.rebootMode ?? "soft",
    }),
  });

  return textResult(
    `Reboot VM job queued.\nThis call only queued a VM reboot action.\n${formatJobSummary(job)}`
  );
}

async function executeGetTrafficMetrics(
  _toolCallId: string,
  params: any,
  ctx: any
) {
  const hours = params.hours ?? 12;
  const payload = await apiRequest(
    ctx,
    `/metrics/traffic?hours=${encodeURIComponent(String(hours))}`
  );

  const buckets = Array.isArray(payload?.buckets) ? payload.buckets : [];
  const lines = buckets.map(
    (bucket: any) =>
      `- ${bucket.label}: requests=${bucket.requests ?? 0}, inboundKB=${(((bucket.inboundBytes ?? 0) / 1024)).toFixed(2)}, outboundKB=${(((bucket.outboundBytes ?? 0) / 1024)).toFixed(2)}`
  );

  return textResult(
    [
      `Traffic telemetry for the last ${payload?.hours ?? hours} hour(s).`,
      `generatedAt=${payload?.generatedAt ?? "unknown"}`,
      lines.length ? `buckets:\n${lines.join("\n")}` : "buckets:\n- none",
    ].join("\n")
  );
}

async function executeRotateSecurityUpdates(
  _toolCallId: string,
  _params: any,
  ctx: any
) {
  const vms = await fetchVmsForRunbook(ctx);
  const candidates = vms.filter(
    (vm: any) =>
      vm.powerState === "ON" &&
      isManagedUpdateOs(vm.osFamily) &&
      vm.type !== "TEMPLATE" &&
      !vm.isCriticalInfrastructure
  );

  const queued: string[] = [];
  const blocked: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const vm of candidates) {
    try {
      const feed = await apiRequest(
        ctx,
        `/vms/${encodeURIComponent(vm.id)}/update-feed?mode=security`
      );
      const packages = Array.isArray(feed?.packages) ? feed.packages : [];
      const criticalSecurity = packages.filter(
        (item: any) => item?.securityCandidate && item?.critical
      );

      if (criticalSecurity.length > 0) {
        blocked.push(`${vm.id} (${criticalSecurity.map((item: any) => item.name).join(", ")})`);
        continue;
      }

      if ((feed?.securityCandidateCount ?? 0) <= 0) {
        skipped.push(`${vm.id} (no security candidates)`);
        continue;
      }

      await apiRequest(ctx, "/jobs/update-vm", {
        method: "POST",
        body: JSON.stringify({
          vmId: vm.id,
          mode: "security",
          autoremove: false,
        }),
      });
      queued.push(`${vm.id} (${feed.securityCandidateCount} candidates)`);
    } catch (error: any) {
      errors.push(`${vm.id} (${error?.message ?? "unknown error"})`);
    }
  }

  return textResult(
    [
      "Security rotation runbook completed.",
      `candidates=${candidates.length}`,
      `queued=${queued.length ? queued.join(", ") : "none"}`,
      `blocked=${blocked.length ? blocked.join(", ") : "none"}`,
      `skipped=${skipped.length ? skipped.join(", ") : "none"}`,
      errors.length ? `errors=${errors.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function fetchVmsForRunbook(ctx: any) {
  const vms = await apiRequest(ctx, "/vms");
  return Array.isArray(vms) ? vms : [];
}

async function queueStartVm(ctx: any, vmId: string) {
  return apiRequest(ctx, "/jobs/start-vm", {
    method: "POST",
    body: JSON.stringify({ vmId }),
  });
}

async function queueStopVm(
  ctx: any,
  vmId: string,
  overrideCriticalInfrastructure = false,
  stopMode: "soft" | "hard" = "soft",
  allowHardStopFallback = false
) {
  return apiRequest(ctx, "/jobs/stop-vm", {
    method: "POST",
    body: JSON.stringify({
      vmId,
      overrideCriticalInfrastructure,
      stopMode,
      allowHardStopFallback,
    }),
  });
}

async function executeFireLab(
  _toolCallId: string,
  params: any,
  ctx: any,
) {
  const lab = await findLabStack(ctx, params.lab);
  if (!lab) {
    throw new Error(`Unknown lab preset: ${params.lab}`);
  }

  const vms = await fetchVmsForRunbook(ctx);
  const queued: string[] = [];
  const skipped: string[] = [];

  const gatewayVmId = lab.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID;
  const gatewayVm = vms.find((vm: any) => vm.id === gatewayVmId);
  if (lab.includeGatewayOnStart && gatewayVm && gatewayVm.powerState !== "ON") {
    await queueStartVm(ctx, gatewayVmId);
    queued.push(gatewayVmId);
  } else if (gatewayVm) {
    skipped.push(`${gatewayVmId} (already running)`);
  }

  for (const vmId of lab.vmIds) {
    const vm = vms.find((candidate: any) => candidate.id === vmId);
    if (!vm) {
      skipped.push(`${vmId} (not found)`);
      continue;
    }

    if (vm.powerState === "ON") {
      skipped.push(`${vmId} (already running)`);
      continue;
    }

    await queueStartVm(ctx, vmId);
    queued.push(vmId);
  }

  return textResult(
    [
      `Fire lab action queued for ${lab.name}.`,
      queued.length ? `queued=${queued.join(", ")}` : "queued=none",
      skipped.length ? `skipped=${skipped.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function executeStopLab(
  _toolCallId: string,
  params: any,
  ctx: any,
) {
  const lab = await findLabStack(ctx, params.lab);
  if (!lab) {
    throw new Error(`Unknown lab preset: ${params.lab}`);
  }

  const vms = await fetchVmsForRunbook(ctx);
  const queued: string[] = [];
  const skipped: string[] = [];

  for (const vmId of [...lab.vmIds].reverse()) {
    const vm = vms.find((candidate: any) => candidate.id === vmId);
    if (!vm) {
      skipped.push(`${vmId} (not found)`);
      continue;
    }

    if (vm.powerState !== "ON") {
      skipped.push(`${vmId} (already stopped)`);
      continue;
    }

    await queueStopVm(ctx, vmId, false, "soft", false);
    queued.push(vmId);
  }

  if (params.includeGateway) {
    const gatewayVmId = lab.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID;
    const gatewayVm = vms.find((vm: any) => vm.id === gatewayVmId);
    if (gatewayVm?.powerState === "ON") {
      await queueStopVm(
        ctx,
        gatewayVmId,
        true,
        "soft",
        Boolean(params.allowGatewayHardStopFallback)
      );
      queued.push(
        `${gatewayVmId} (override, soft stop${
          params.allowGatewayHardStopFallback ? " with hard-stop fallback" : ""
        })`
      );
    } else {
      skipped.push(`${gatewayVmId} (already stopped)`);
    }
  }

  return textResult(
    [
      `Stop lab action queued for ${lab.name}.`,
      queued.length ? `queued=${queued.join(", ")}` : "queued=none",
      skipped.length ? `skipped=${skipped.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function findLabStack(ctx: any, labIdOrName: string) {
  const labs = await apiRequest(ctx, "/labs");
  if (!Array.isArray(labs)) {
    return null;
  }

  const normalized = String(labIdOrName).trim().toLowerCase();
  return (
    labs.find((lab: any) => String(lab.id).toLowerCase() === normalized) ??
    labs.find((lab: any) => String(lab.name).toLowerCase() === normalized) ??
    null
  );
}

const privateCloudManagerPlugin = {
  id: PLUGIN_ID,
  name: "Private Cloud Manager",
  description:
    "Operator tools for a VMware homelab control plane: inventory, power actions, SSH jobs, update feeds, security patching, rebooting, traffic telemetry, and lab runbooks.",
  register(api: any) {
    api.registerTool((ctx: any) => ({
      name: "pcm_list_vms",
      label: "PCM List VMs",
      description:
        "Use this for VM inventory or status questions such as which VMs exist, which VMs are online or offline, which machine is the firewall, or which VM has SSH configured. Returns the current PCM VM list with power state and optional SSH details.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          includeSshDetails: {
            type: "boolean",
            description:
              "Include SSH host, port, and user information in the response.",
          },
        },
      },
      execute(toolCallId: string, params: any) {
        return executeListVms(toolCallId, params, ctx);
      },
    }), { name: "pcm_list_vms" });

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_start_vm",
        label: "PCM Start VM",
        description:
          "Use this when the user wants to power on, boot, fire up, or bring online a specific VM by id. Queues a backend start job; it does not claim the VM is already fully booted.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to start, for example wireguard.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeStartVm(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_create_vm",
        label: "PCM Create VM",
        description:
          "Use this when the user wants to add, register, or onboard a VM into PCM. Stores the VM record, VMX path, OS family, and SSH fields in the PCM database so later workflows such as update feeds, reboot, refresh state, and SSH jobs know how to handle it.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: {
              type: "string",
              description: "Stable VM id, for example win-srv-2025.",
            },
            name: {
              type: "string",
              description: "Display name, for example Windows Server 2025.",
            },
            vmxPath: {
              type: "string",
              description: "Absolute path to the VMware .vmx file.",
            },
            type: {
              type: "string",
              enum: ["PERSISTENT", "TEMPLATE", "EPHEMERAL"],
              description: "VM lifecycle type. Defaults to PERSISTENT.",
            },
            osFamily: {
              type: "string",
              enum: ["ubuntu", "debian", "kali", "windows", "fortigate", "other"],
              description: "Generic OS family used by backend workflows.",
            },
            osVersion: {
              type: "string",
              description: "Optional OS version label.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags.",
            },
            sshHost: {
              type: "string",
              description: "Optional SSH host or IP.",
            },
            sshPort: {
              type: "number",
              description: "Optional SSH port.",
            },
            sshUser: {
              type: "string",
              description: "Optional SSH username.",
            },
            sshKeyPath: {
              type: "string",
              description: "Optional private key path.",
            },
            sshPassword: {
              type: "string",
              description: "Optional SSH password.",
            },
          },
          required: ["id", "name", "vmxPath"],
        },
        execute(toolCallId: string, params: any) {
          return executeCreateVm(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_update_vm_settings",
        label: "PCM Update VM Settings",
        description:
          "Use this when the user wants to edit or correct a VM record in PCM, including name, VMX path, lifecycle type, tags, OS family, OS version, and SSH workflow settings. This updates the database-backed source of truth for that VM.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "Existing VM id to update.",
            },
            name: {
              type: "string",
              description: "Display name.",
            },
            vmxPath: {
              type: "string",
              description: "Absolute path to the VMware .vmx file.",
            },
            type: {
              type: "string",
              enum: ["PERSISTENT", "TEMPLATE", "EPHEMERAL"],
              description: "VM lifecycle type. Defaults to PERSISTENT.",
            },
            osFamily: {
              type: "string",
              enum: ["ubuntu", "debian", "kali", "windows", "fortigate", "other"],
              description: "Generic OS family used by backend workflows.",
            },
            osVersion: {
              type: "string",
              description: "Optional OS version label.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags.",
            },
            sshHost: {
              type: "string",
              description: "Optional SSH host or IP.",
            },
            sshPort: {
              type: "number",
              description: "Optional SSH port.",
            },
            sshUser: {
              type: "string",
              description: "Optional SSH username.",
            },
            sshKeyPath: {
              type: "string",
              description: "Optional private key path.",
            },
            sshPassword: {
              type: "string",
              description:
                "Optional replacement SSH password. Omit it to keep the stored password unchanged.",
            },
          },
          required: ["vmId", "name", "vmxPath"],
        },
        execute(toolCallId: string, params: any) {
          return executeUpdateVmSettings(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_stop_vm",
        label: "PCM Stop VM",
        description:
          "Use this when the user wants to power off, shut down, or stop a specific VM by id. Queues a backend stop job and is suitable for routine VM shutdowns.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to stop, for example wireguard.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeStopVm(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_ssh_exec",
        label: "PCM SSH Exec",
        description:
          "Use this when the user explicitly wants a command executed inside a VM over SSH, such as checking services, collecting output, or running a one-off admin command. This goes through the backend SSH policy path and creates an auditable job.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to run the SSH command against.",
            },
            command: {
              type: "string",
              description: "The command to run on the VM.",
              maxLength: 500,
            },
          },
          required: ["vmId", "command"],
        },
        execute(toolCallId: string, params: any) {
          return executeSshExec(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool((ctx: any) => ({
      name: "pcm_get_job_status",
      label: "PCM Get Job Status",
      description:
        "Use this after any queued action when the user asks whether a job finished, failed, or what its logs say. Returns job status plus backend log lines.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          jobId: {
            type: "string",
            description: "The backend job id to inspect.",
          },
        },
        required: ["jobId"],
      },
      execute(toolCallId: string, params: any) {
        return executeGetJobStatus(toolCallId, params, ctx);
      },
    }), { name: "pcm_get_job_status" });

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_update_vm",
        label: "PCM Update VM",
        description:
          "Use this when the user wants to patch, update, or apply operating system updates to a VM. Supports Ubuntu, Debian, Kali, and Windows. Defaults to security-focused updates where supported and creates a managed backend job instead of free-form SSH patching.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to update, for example ubuntu-web, kali-01, or windows-dc.",
            },
            mode: {
              type: "string",
              enum: ["security", "full"],
              description: "Whether to run only security updates or a full package upgrade.",
            },
            autoremove: {
              type: "boolean",
              description: "Whether to run apt autoremove as part of the update flow.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeUpdateVm(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_get_update_feed",
        label: "PCM Get Update Feed",
        description:
          "Use this before patching when the user asks what updates are pending, whether there are security updates, whether a kernel or critical package will change, or whether a VM looks safe to patch. Supports Ubuntu, Debian, Kali, and Windows.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to inspect, for example ubuntu-web, kali-01, or windows-dc.",
            },
            mode: {
              type: "string",
              enum: ["security", "full"],
              description: "Whether to focus the feed on security-targeted updates or all pending package changes.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeGetUpdateFeed(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_refresh_vm_state",
        label: "PCM Refresh VM State",
        description:
          "Use this when the user wants the latest live state for a running VM, especially after a reboot, patch, or guest-side change. Refreshes guest metadata such as OS version, reboot-required flag, and last-seen timestamps through the backend state path.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to refresh.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeRefreshVmState(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_reboot_vm",
        label: "PCM Reboot VM",
        description:
          "Use this when the user wants to restart a VM. Choose soft for normal maintenance reboots and hard only when the guest is stuck or unresponsive.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to reboot.",
            },
            rebootMode: {
              type: "string",
              enum: ["soft", "hard"],
              description: "The reboot style to queue.",
            },
          },
          required: ["vmId"],
        },
        execute(toolCallId: string, params: any) {
          return executeRebootVm(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_get_traffic_metrics",
        label: "PCM Get Traffic Metrics",
        description:
          "Use this for dashboard/API traffic questions such as recent request volume, inbound and outbound traffic over time, or how busy the PCM backend has been recently.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            hours: {
              type: "number",
              description: "How many recent hours to inspect, between 1 and 24.",
            },
          },
        },
        execute(toolCallId: string, params: any) {
          return executeGetTrafficMetrics(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_fire_lab",
        label: "PCM Fire Lab",
        description:
          "Use this when the user wants to bring up a whole lab stack such as blue team, red team, purple team, or WG-VPN. Reads the current lab definition from PCM and queues the required VM start actions, including the gateway first when that lab depends on it.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            lab: {
              type: "string",
              description:
                "The lab stack id or name to start, for example blue-team, Red Team, purple-team, or wg-vpn.",
            },
          },
          required: ["lab"],
        },
        execute(toolCallId: string, params: any) {
          return executeFireLab(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_rotate_security_updates",
        label: "PCM Rotate Security Updates",
        description:
          "Use this for a safer batch security-patching run across the fleet. It checks running supported VMs with the security feed first, blocks risky targets with critical or kernel-class changes, and queues only the safer security-mode update jobs.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        execute(toolCallId: string, params: any) {
          return executeRotateSecurityUpdates(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );

    api.registerTool(
      (ctx: any) => ({
        name: "pcm_stop_lab",
        label: "PCM Stop Lab",
        description:
          "Use this when the user wants to shut down a whole lab stack such as blue team, red team, purple team, or WG-VPN. Reads the current lab definition from PCM and queues the matching stop actions. It can also include that lab's gateway VM if the user explicitly asks for it.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            lab: {
              type: "string",
              description:
                "The lab stack id or name to stop, for example blue-team, Red Team, purple-team, or wg-vpn.",
            },
            includeGateway: {
              type: "boolean",
              description: "If true, also stop FG-VM after the lab VMs stop.",
            },
            allowGatewayHardStopFallback: {
              type: "boolean",
              description:
                "If true, try a soft stop first and fall back to a hard stop only if FG-VM refuses to shut down gracefully.",
            },
          },
          required: ["lab"],
        },
        execute(toolCallId: string, params: any) {
          return executeStopLab(toolCallId, params, ctx);
        },
      }),
      { optional: true }
    );
  },
};

export default privateCloudManagerPlugin;
