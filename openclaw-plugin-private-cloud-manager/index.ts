const PLUGIN_ID = "private-cloud-manager";
const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_TIMEOUT_MS = 15000;

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
      const base = `- ${vm.id}: ${vm.name} [${vm.type}]`;

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

  return textResult(`Start VM job queued.\n${formatJobSummary(job)}`);
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

  return textResult(`Stop VM job queued.\n${formatJobSummary(job)}`);
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

  return textResult(`SSH execution job queued.\n${formatJobSummary(job)}`);
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
      mode: params.mode ?? "full",
      autoremove: params.autoremove ?? true,
    }),
  });

  return textResult(`Update server job queued.\n${formatJobSummary(job)}`);
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
          "Queue a managed Ubuntu server update job for a VM by id.",
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
  },
};

export default privateCloudManagerPlugin;
