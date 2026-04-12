import { prisma } from "../../core/prisma";
import { vmStart, vmStop, vmSnapshot, vmReboot, vmDelete, getVmPowerState } from "../../adapters/vmware.adapter";
import { logJob } from "../job.service";
import { executeSSH } from "../../adapters/ssh.adapter";
import { getVmSshPassword } from "../../services/vm-secret.service";
import { Buffer } from "buffer";

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

export async function handleVMJob(job: any) {
  const payload = JSON.parse(job.payload);

  const vm = await prisma.vM.findUnique({
    where: { id: payload.vmId },
  });

  if (!vm) {
    throw new Error("VM not found");
  }

  await logJob(job.id, `Executing ${job.type} on ${vm.name}`);

  switch (job.type) {
    case "VM_START":
      await vmStart(vm.vmxPath);
      break;

    case "VM_STOP":
      if (payload.stopMode === "hard") {
        await vmStop(vm.vmxPath, "hard");
        break;
      }

      try {
        await vmStop(vm.vmxPath, "soft");
      } catch (error) {
        if (!payload.allowHardStopFallback) {
          throw error;
        }

        await logJob(
          job.id,
          "Soft stop failed. Falling back to VMware hard stop because allowHardStopFallback was explicitly enabled.",
        );
        await vmStop(vm.vmxPath, "hard");
      }
      break;

    case "VM_REBOOT":
      await vmReboot(vm.vmxPath, payload.rebootMode === "hard" ? "hard" : "soft");
      break;

    case "VM_DELETE":
      await handleVmDelete(job.id, vm, payload);
      break;

    case "VM_SNAPSHOT":
      if (!payload.snapshotName) {
        throw new Error("Missing snapshot name");
      }
      await vmSnapshot(vm.vmxPath, payload.snapshotName);
      break;

    case "VM_OS_UPDATE":
      await handleVmOsUpdate(job.id, vm, payload);
      break;

    default:
      throw new Error("Unsupported job type");
  }

  await logJob(job.id, JSON.stringify({
  event: "VM_OPERATION",
  action: job.type,
  status: "done"
}));
}

async function handleVmDelete(jobId: string, vm: any, payload: any) {
  const deleteFromDisk = Boolean(payload.deleteFromDisk);

  await logJob(
    jobId,
    deleteFromDisk
      ? `Deleting ${vm.name} from VMware Workstation and removing its PCM record.`
      : `Removing ${vm.name} from the PCM database only.`,
  );

  if (deleteFromDisk) {
    const powerState = await getVmPowerState(vm.vmxPath);
    if (powerState === "ON") {
      throw new Error("VM must be powered off before deleting it from disk.");
    }

    await vmDelete(vm.vmxPath);
    await logJob(jobId, `VMware deleteVM completed for ${vm.vmxPath}`);
  }

  await prisma.vM.delete({
    where: { id: vm.id },
  });

  await logJob(
    jobId,
    deleteFromDisk
      ? `VM deleted from disk and removed from PCM: ${vm.id}`
      : `VM removed from PCM only: ${vm.id}`,
  );
}

async function handleVmOsUpdate(jobId: string, vm: any, payload: any) {
  if (!vm.sshHost || !vm.sshUser) {
    throw new Error("VM SSH not configured");
  }

  const sshPassword = await getVmSshPassword(vm.id);

  const osFamily = inferOsFamilyFromVm(vm);
  if (!isAptManagedOs(osFamily) && !isWindowsManagedOs(osFamily)) {
    throw new Error("VM OS update is currently supported only for apt-managed Linux VMs and Windows VMs");
  }

  const mode = payload.mode === "security" ? "security" : "full";

  if (isWindowsManagedOs(osFamily)) {
    await handleWindowsUpdate(jobId, vm, mode);
    return;
  }

  if (!sshPassword) {
    throw new Error("VM update requires an SSH password because sudo -S is used for homelab patching");
  }

  const autoremove = payload.autoremove !== false;
  const useUnattendedSecurityFlow = mode === "security" && osFamily === "ubuntu";

  await logJob(jobId, `Running ${osFamily || "apt-managed Linux"} update on ${vm.name}`);
  await logJob(jobId, `Update mode: ${mode}${autoremove ? " with autoremove" : ""}`);
  if (mode === "security" && !useUnattendedSecurityFlow) {
    await logJob(
      jobId,
      "Security mode on Kali/Debian uses the apt upgrade path because this guest does not expose Ubuntu-style unattended-upgrade security pocket behavior.",
    );
  }
  await logJob(jobId, "Privilege escalation mode: sudo -S using the VM SSH password");

  const updateCommand =
    useUnattendedSecurityFlow
      ? [
          "sudo -S -p '' bash -lc '",
          "apt update && ",
          "DEBIAN_FRONTEND=noninteractive unattended-upgrade -d && ",
          "if [ -f /var/run/reboot-required ]; then echo REBOOT_REQUIRED=yes; else echo REBOOT_REQUIRED=no; fi && ",
          ". /etc/os-release && echo OS_VERSION=\"$PRETTY_NAME\"",
          "'",
        ].join("")
      : [
          "sudo -S -p '' bash -lc '",
          "apt update && ",
          "DEBIAN_FRONTEND=noninteractive apt upgrade -y && ",
          autoremove ? "DEBIAN_FRONTEND=noninteractive apt autoremove -y && " : "true && ",
          "apt autoclean && ",
          "if [ -f /var/run/reboot-required ]; then echo REBOOT_REQUIRED=yes; else echo REBOOT_REQUIRED=no; fi && ",
          ". /etc/os-release && echo OS_VERSION=\"$PRETTY_NAME\"",
          "'",
        ].join("");

  const startedAt = Date.now();
  let pendingStdout = "";
  let pendingStderr = "";

  const progressTimer = setInterval(async () => {
    const elapsedMs = Date.now() - startedAt;
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    const elapsedSeconds = Math.floor((elapsedMs % 60_000) / 1000);
    const recentStdout = formatProgressTail(pendingStdout);
    const recentStderr = formatProgressTail(pendingStderr);

    pendingStdout = "";
    pendingStderr = "";

    await logJob(
      jobId,
      recentStdout || recentStderr
        ? [
            `Update still running (${elapsedMinutes}m ${elapsedSeconds}s elapsed).`,
            recentStdout ? `Recent STDOUT:\n${recentStdout}` : null,
            recentStderr ? `Recent STDERR:\n${recentStderr}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : `Update still running (${elapsedMinutes}m ${elapsedSeconds}s elapsed).`,
    );
  }, 15_000);

  let result;
  try {
    result = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: sshPassword ?? undefined,
      command: updateCommand,
      timeoutMs: 10 * 60 * 1000,
      stdinData: `${sshPassword}\n`,
      onStdout: (chunk) => {
        pendingStdout += chunk;
      },
      onStderr: (chunk) => {
        pendingStderr += chunk;
      },
    });
  } finally {
    clearInterval(progressTimer);
  }

  await logJob(jobId, `Exit code: ${result.code}`);
  await logJob(jobId, `STDOUT:\n${result.stdout}`);
  await logJob(jobId, `STDERR:\n${result.stderr}`);

  if (result.code !== 0) {
    throw new Error(
      `Apt-managed Linux update failed with exit code ${result.code}: ${result.stderr || "no stderr output"}`,
    );
  }

  const rebootRequired = result.stdout.includes("REBOOT_REQUIRED=yes");
  const osVersionMatch = result.stdout.match(/OS_VERSION="([^"]+)"/);
  const osVersion = osVersionMatch?.[1] ?? vm.osVersion ?? null;

  await prisma.vM.update({
    where: { id: vm.id },
    data: {
      osVersion,
      lastUpdatedAt: new Date(),
      rebootRequired,
    } as never,
  });

  await logJob(
    jobId,
    `Update complete. OS version: ${osVersion ?? "unknown"}. Reboot required: ${rebootRequired ? "yes" : "no"}`,
  );
}

async function handleWindowsUpdate(jobId: string, vm: any, mode: "security" | "full") {
  await logJob(jobId, `Running Windows update on ${vm.name}`);
  await logJob(jobId, "Update provider: Windows Update Agent through a temporary SYSTEM scheduled task");
  await logJob(jobId, `Update mode: ${mode}`);

  const sshPassword = await getVmSshPassword(vm.id);
  const taskId = `PCM-WindowsUpdate-${jobId.slice(0, 8)}`;
  const taskName = `\\${taskId}`;
  const scriptPath = `C:\\Windows\\Temp\\${taskId}.ps1`;
  const logPath = `C:\\Windows\\Temp\\${taskId}.log`;

  await logJob(jobId, "Privilege escalation mode: scheduled task running as NT AUTHORITY\\SYSTEM");

  const setupResult = await executeSSH({
    host: vm.sshHost,
    port: vm.sshPort || 22,
    username: vm.sshUser,
    privateKeyPath: vm.sshKeyPath ?? undefined,
    password: sshPassword ?? undefined,
    command: buildWindowsScheduledTaskSetupCommand(taskName, scriptPath),
    timeoutMs: 90_000,
    stdinData: buildWindowsUpdateTaskScript(logPath, mode),
  });

  await logJob(jobId, `Setup exit code: ${setupResult.code}`);
  if (setupResult.stdout.trim()) {
    await logJob(jobId, `SETUP STDOUT:\n${setupResult.stdout}`);
  }
  if (setupResult.stderr.trim()) {
    await logJob(jobId, `SETUP STDERR:\n${setupResult.stderr}`);
  }

  if (setupResult.code !== 0) {
    throw new Error(
      `Windows update task setup failed with exit code ${setupResult.code}: ${setupResult.stderr || "no stderr output"}`,
    );
  }

  const startedAt = Date.now();
  let completionLog = "";
  let lastTaskResult: string | null = null;
  let taskSucceeded = false;

  try {
    while (Date.now() - startedAt < 30 * 60 * 1000) {
      await wait(15_000);

      const pollResult = await executeSSH({
        host: vm.sshHost,
        port: vm.sshPort || 22,
        username: vm.sshUser,
        privateKeyPath: vm.sshKeyPath ?? undefined,
        password: sshPassword ?? undefined,
        command: buildWindowsScheduledTaskPollCommand(taskName, logPath),
        timeoutMs: 60_000,
      });

      const elapsedMs = Date.now() - startedAt;
      const elapsedMinutes = Math.floor(elapsedMs / 60_000);
      const elapsedSeconds = Math.floor((elapsedMs % 60_000) / 1000);
      const taskState = pollResult.stdout.match(/TASK_STATE=([^\r\n]+)/)?.[1]?.trim() ?? "Unknown";
      lastTaskResult = pollResult.stdout.match(/TASK_LAST_RESULT=([^\r\n]+)/)?.[1]?.trim() ?? null;
      completionLog = extractTaskLog(pollResult.stdout);
      const recentLog = formatProgressTail(completionLog);

      await logJob(
        jobId,
        [
          `Windows update still running (${elapsedMinutes}m ${elapsedSeconds}s elapsed). Task state: ${taskState}${lastTaskResult ? `, last result: ${lastTaskResult}` : ""}.`,
          recentLog ? `Recent task log:\n${recentLog}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );

      if (/TASK_SUCCESS=True/i.test(completionLog)) {
        taskSucceeded = true;
        break;
      }

      if (/TASK_ERROR=/i.test(completionLog) || (/^Ready$/i.test(taskState) && lastTaskResult && lastTaskResult !== "0")) {
        break;
      }
    }

    const finalLogResult = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: sshPassword ?? undefined,
      command: buildWindowsScheduledTaskReadLogCommand(logPath),
      timeoutMs: 60_000,
    });

    if (finalLogResult.stdout.trim()) {
      completionLog = finalLogResult.stdout;
    }
  } finally {
    const cleanupResult = await executeSSH({
      host: vm.sshHost,
      port: vm.sshPort || 22,
      username: vm.sshUser,
      privateKeyPath: vm.sshKeyPath ?? undefined,
      password: sshPassword ?? undefined,
      command: buildWindowsScheduledTaskCleanupCommand(taskName, scriptPath, logPath),
      timeoutMs: 60_000,
    }).catch(() => null);

    if (cleanupResult?.stdout?.trim()) {
      await logJob(jobId, `CLEANUP STDOUT:\n${cleanupResult.stdout}`);
    }
    if (cleanupResult?.stderr?.trim()) {
      await logJob(jobId, `CLEANUP STDERR:\n${cleanupResult.stderr}`);
    }
  }

  await logJob(jobId, `TASK LAST RESULT: ${lastTaskResult ?? "unknown"}`);
  await logJob(jobId, `TASK LOG:\n${completionLog || "(empty)"}`);

  if (!taskSucceeded) {
    const taskError =
      completionLog.match(/TASK_ERROR=([^\r\n]+)/)?.[1]?.trim() ??
      completionLog.match(/TASK_ERROR_DETAIL=([^\r\n]+)/)?.[1]?.trim() ??
      (lastTaskResult ? `Scheduled task failed with result ${lastTaskResult}` : null) ??
      "Windows update task did not complete successfully";

    throw new Error(taskError);
  }

  const rebootRequired = /REBOOT_REQUIRED=True/i.test(completionLog);
  const osVersionMatch = completionLog.match(/OS_VERSION=([^\r\n]+)/);
  const osVersion = osVersionMatch?.[1]?.trim() ?? vm.osVersion ?? null;

  await prisma.vM.update({
    where: { id: vm.id },
    data: {
      osVersion,
      lastUpdatedAt: new Date(),
      rebootRequired,
    } as never,
  });

  await logJob(
    jobId,
    `Windows update complete. OS version: ${osVersion ?? "unknown"}. Reboot required: ${rebootRequired ? "yes" : "no"}`,
  );
}

function formatProgressTail(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return lines.slice(-6).join("\n");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPowershellEncodedCommand(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildWindowsScheduledTaskSetupCommand(
  taskName: string,
  scriptPath: string,
) {
  const ps = [
    `$taskName = '${taskName}';`,
    `$scriptPath = '${scriptPath}';`,
    "$scriptBody = [Console]::In.ReadToEnd();",
    "[System.IO.File]::WriteAllText($scriptPath, $scriptBody, [System.Text.Encoding]::UTF8);",
    `schtasks /Create /TN "${taskName}" /SC ONCE /ST 23:59 /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""${scriptPath}""" /F | Out-Null;`,
    `schtasks /Run /TN "${taskName}" | Out-Null;`,
    "Write-Output 'WINDOWS_TASK_SETUP=True';",
  ].join(" ");

  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${toPowershellEncodedCommand(ps)}`;
}

function buildWindowsScheduledTaskPollCommand(taskName: string, logPath: string) {
  const ps = [
    `$task = Get-ScheduledTask -TaskName '${taskName.replace(/^\\/, "")}' -ErrorAction SilentlyContinue;`,
    `if (-not $task) { Write-Output 'TASK_STATE=Missing'; Write-Output 'TASK_LAST_RESULT=-1'; Write-Output 'LOG_BEGIN'; Write-Output 'LOG_END'; exit 0 }`,
    `$info = Get-ScheduledTaskInfo -TaskName '${taskName.replace(/^\\/, "")}';`,
    "Write-Output ('TASK_STATE=' + $task.State);",
    "Write-Output ('TASK_LAST_RESULT=' + $info.LastTaskResult);",
    "Write-Output 'LOG_BEGIN';",
    `if (Test-Path '${logPath}') { Get-Content '${logPath}' -Tail 20 }`,
    "Write-Output 'LOG_END';",
  ].join(" ");

  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${toPowershellEncodedCommand(ps)}`;
}

function buildWindowsScheduledTaskReadLogCommand(logPath: string) {
  const ps = [
    `if (Test-Path '${logPath}') { Get-Content '${logPath}' }`,
  ].join(" ");

  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${toPowershellEncodedCommand(ps)}`;
}

function buildWindowsScheduledTaskCleanupCommand(taskName: string, scriptPath: string, logPath: string) {
  const ps = [
    `schtasks /Delete /TN "${taskName}" /F 2>$null | Out-Null;`,
    `Remove-Item -Path '${scriptPath}' -Force -ErrorAction SilentlyContinue;`,
    `Remove-Item -Path '${logPath}' -Force -ErrorAction SilentlyContinue;`,
    `Write-Output 'WINDOWS_TASK_CLEANUP=True';`,
  ].join(" ");

  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${toPowershellEncodedCommand(ps)}`;
}

function extractTaskLog(stdout: string) {
  const match = stdout.match(/LOG_BEGIN\r?\n([\s\S]*?)\r?\nLOG_END/);
  return match?.[1]?.trim() ?? "";
}

function buildWindowsUpdateTaskScript(logPath: string, mode: "security" | "full") {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$LogPath = '${logPath}'`,
    "Remove-Item -Path $LogPath -Force -ErrorAction SilentlyContinue",
    "function Write-Log([string]$Message) { Add-Content -Path $LogPath -Value $Message }",
    "try {",
    "Write-Log ('WINDOWS_UPDATE_TASK_STARTED=' + (Get-Date).ToString('o'))",
    "$session = New-Object -ComObject Microsoft.Update.Session",
    "$searcher = $session.CreateUpdateSearcher()",
    "$result = $searcher.Search(\"IsInstalled=0 and Type='Software'\")",
    "Write-Log ('WINDOWS_UPDATES_FOUND=' + $result.Updates.Count)",
    `$securityOnly = ${mode === "security" ? "$true" : "$false"}`,
    "if ($result.Updates.Count -gt 0) {",
    "$updates = New-Object -ComObject Microsoft.Update.UpdateColl",
    "for ($i = 0; $i -lt $result.Updates.Count; $i++) {",
    "$update = $result.Updates.Item($i)",
    "$categoryNames = @($update.Categories | ForEach-Object { $_.Name })",
    "$isSecurityUpdate = -not [string]::IsNullOrWhiteSpace($update.MsrcSeverity) -or (($categoryNames -join ',') -match 'Security') -or ($update.Title -match 'Security')",
    "if ($securityOnly -and -not $isSecurityUpdate) { Write-Log ('WINDOWS_UPDATE_SKIPPED_NON_SECURITY=' + $update.Title); continue }",
    "if (-not $update.EulaAccepted) { $update.AcceptEula() }",
    "[void]$updates.Add($update)",
    "Write-Log ('WINDOWS_UPDATE_SELECTED=' + $update.Title)",
    "}",
    "Write-Log ('WINDOWS_UPDATES_SELECTED=' + $updates.Count)",
    "if ($updates.Count -eq 0) {",
    "Write-Log 'WINDOWS_UPDATE_NOOP=True'",
    "Write-Log 'REBOOT_REQUIRED=False'",
    "} else {",
    "$downloader = $session.CreateUpdateDownloader()",
    "$downloader.Updates = $updates",
    "$downloadResult = $downloader.Download()",
    "Write-Log ('WINDOWS_DOWNLOAD_RESULT=' + $downloadResult.ResultCode)",
    "$installer = $session.CreateUpdateInstaller()",
    "$installer.Updates = $updates",
    "$installResult = $installer.Install()",
    "Write-Log ('WINDOWS_INSTALL_RESULT=' + $installResult.ResultCode)",
    "Write-Log ('REBOOT_REQUIRED=' + $installResult.RebootRequired)",
    "}",
    "} else {",
    "Write-Log 'REBOOT_REQUIRED=False'",
    "}",
    "$os = Get-CimInstance Win32_OperatingSystem",
    "Write-Log ('OS_VERSION=' + $os.Caption + ' ' + $os.Version)",
    "Write-Log 'TASK_SUCCESS=True'",
    "exit 0",
    "} catch {",
    "Write-Log ('TASK_ERROR=' + $_.Exception.Message)",
    "Write-Log ('TASK_ERROR_DETAIL=' + (($_ | Out-String).Trim() -replace \"`r?`n\", ' | '))",
    "exit 1",
    "}",
  ].join("\r\n");
}
