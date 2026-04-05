const PLUGIN_ID = "private-cloud-manager";
const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_TIMEOUT_MS = 15000;
const CRITICAL_GATEWAY_VM_ID = "FG-VM";

const LAB_PRESETS = {
  blue_team: ["wazuh", "iris", "misp"],
  red_team: ["kali-01", "ubuntu-server-victim"],
  purple_team: ["wazuh", "iris", "kali-01", "ubuntu-server-victim"],
  wg_vpn: ["wireguard"],
} as const;

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
      `VM state refreshed for ${payload.name ?? params.vmId}.`,
      payload.powerState ? `powerState=${payload.powerState}` : null,
      payload.osVersion ? `os=${payload.osVersion}` : null,
      typeof payload.rebootRequired === "boolean"
        ? `rebootRequired=${payload.rebootRequired ? "yes" : "no"}`
        : null,
      payload.lastSeenOnlineAt ? `lastSeenOnlineAt=${payload.lastSeenOnlineAt}` : null,
      payload.lastSshLoginAt ? `lastSshLoginAt=${payload.lastSshLoginAt}` : null,
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
      vm.osFamily?.toLowerCase?.() === "ubuntu" &&
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
  const presetVmIds = LAB_PRESETS[params.lab as keyof typeof LAB_PRESETS];
  if (!presetVmIds) {
    throw new Error(`Unknown lab preset: ${params.lab}`);
  }

  const vms = await fetchVmsForRunbook(ctx);
  const queued: string[] = [];
  const skipped: string[] = [];

  const gatewayVm = vms.find((vm: any) => vm.id === CRITICAL_GATEWAY_VM_ID);
  if (gatewayVm && gatewayVm.powerState !== "ON") {
    await queueStartVm(ctx, CRITICAL_GATEWAY_VM_ID);
    queued.push(CRITICAL_GATEWAY_VM_ID);
  } else if (gatewayVm) {
    skipped.push(`${CRITICAL_GATEWAY_VM_ID} (already running)`);
  }

  for (const vmId of presetVmIds) {
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
      `Fire lab action queued for ${params.lab}.`,
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
  const presetVmIds = LAB_PRESETS[params.lab as keyof typeof LAB_PRESETS];
  if (!presetVmIds) {
    throw new Error(`Unknown lab preset: ${params.lab}`);
  }

  const vms = await fetchVmsForRunbook(ctx);
  const queued: string[] = [];
  const skipped: string[] = [];

  for (const vmId of [...presetVmIds].reverse()) {
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
    const gatewayVm = vms.find((vm: any) => vm.id === CRITICAL_GATEWAY_VM_ID);
    if (gatewayVm?.powerState === "ON") {
      await queueStopVm(
        ctx,
        CRITICAL_GATEWAY_VM_ID,
        true,
        "soft",
        Boolean(params.allowGatewayHardStopFallback)
      );
      queued.push(
        `${CRITICAL_GATEWAY_VM_ID} (override, soft stop${
          params.allowGatewayHardStopFallback ? " with hard-stop fallback" : ""
        })`
      );
    } else {
      skipped.push(`${CRITICAL_GATEWAY_VM_ID} (already stopped)`);
    }
  }

  return textResult(
    [
      `Stop lab action queued for ${params.lab}.`,
      queued.length ? `queued=${queued.join(", ")}` : "queued=none",
      skipped.length ? `skipped=${skipped.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const privateCloudManagerPlugin = {
  id: PLUGIN_ID,
  name: "Private Cloud Manager",
  description:
    "VM inventory and job tools for a local VMware private cloud manager backend.",
  register(api: any) {
    api.registerTool((ctx: any) => ({
      name: "pcm_list_vms",
      label: "PCM List VMs",
      description:
        "List VMware VMs known to the private cloud manager backend.",
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
        description: "Queue a start job for a VM by id.",
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
        name: "pcm_stop_vm",
        label: "PCM Stop VM",
        description: "Queue a stop job for a VM by id.",
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
          "Queue an SSH execution job for a VM by id using the backend policy controls.",
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
      description: "Fetch the status and logs for a previously created job.",
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
          "Queue a managed Ubuntu server update job for a VM by id. Defaults to security mode.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to update, for example ubuntu-web.",
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
          "Fetch an on-demand Ubuntu package change feed for a VM, highlighting security candidates, kernel changes, and other critical packages.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            vmId: {
              type: "string",
              description: "The VM id to inspect, for example ubuntu-web.",
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
          "Refresh the current live state and guest metadata for a VM through the backend SSH path.",
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
          "Queue a reboot job for a VM. Use soft for normal maintenance and hard when the guest is stuck.",
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
          "Fetch frontend-to-backend API traffic telemetry buckets from the dashboard backend.",
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
          "Queue start actions for a named lab preset. Starts FG-VM first if the gateway is down.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            lab: {
              type: "string",
              enum: ["blue_team", "red_team", "purple_team", "wg_vpn"],
              description: "The lab preset to start.",
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
          "Inspect running Ubuntu VMs with the security feed, hold anything with critical or kernel-class security changes, and queue only safer security-only update jobs.",
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
          "Queue stop actions for a named lab preset. Can optionally also stop FG-VM with an explicit critical-infrastructure override.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            lab: {
              type: "string",
              enum: ["blue_team", "red_team", "purple_team", "wg_vpn"],
              description: "The lab preset to stop.",
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
