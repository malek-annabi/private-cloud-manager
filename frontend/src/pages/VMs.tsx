import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVMs } from "../hooks/useVMs";
import {
  checkVmSshReady,
  type VmRecord,
  updateVmConnection,
  updateVmTags,
} from "../api/vms";
import { startVM, stopVM } from "../api/jobs";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import SSHTerminal from "../components/ssh/Terminal";

export default function VMs() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useVMs();
  const [sshSessions, setSshSessions] = useState<Array<{ id: string; vmId: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isOpeningSessionFor, setIsOpeningSessionFor] = useState<string | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [savingTagsFor, setSavingTagsFor] = useState<string | null>(null);
  const [runningActionFor, setRunningActionFor] = useState<string | null>(null);
  const [editingConnectionVmId, setEditingConnectionVmId] = useState<string | null>(null);
  const [openSshAfterSave, setOpenSshAfterSave] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState({
    sshHost: "",
    sshPort: "22",
    sshUser: "",
  });
  const [savingConnectionFor, setSavingConnectionFor] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");

  const stats = {
    total: data.length,
    running: data.filter((vm) => vm.powerState === "ON").length,
    stopped: data.filter((vm) => vm.powerState === "OFF").length,
  };
  const activeSession =
    activeSessionId != null
      ? sshSessions.find((session) => session.id === activeSessionId) ?? null
      : null;
  const activeSessionVm =
    activeSession != null ? data.find((vm) => vm.id === activeSession.vmId) ?? null : null;
  const sessionCandidateVms = useMemo(
    () => [...data].sort((left, right) => left.name.localeCompare(right.name)),
    [data],
  );
  const latestSshLogin = useMemo(() => {
    const timestamps = data
      .map((vm) => vm.lastSshLoginAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

    return timestamps[0] ?? null;
  }, [data]);
  const visibleVms = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const powerRank = {
      ON: 0,
      UNKNOWN: 1,
      OFF: 2,
    };

    return [...data]
      .filter((vm) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchHaystack = [
          vm.name,
          vm.id,
          vm.type,
          vm.sshHost ?? "",
          vm.sshUser ?? "",
          ...vm.tags,
        ]
          .join(" ")
          .toLowerCase();

        return searchHaystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const powerDiff = powerRank[left.powerState] - powerRank[right.powerState];
        if (powerDiff !== 0) {
          return powerDiff;
        }

        return left.name.localeCompare(right.name);
      });
  }, [data, searchTerm]);

  useEffect(() => {
    setSshSessions((current) =>
      current.filter((session) => {
        const vm = data.find((candidate) => candidate.id === session.vmId);
        return vm?.powerState === "ON";
      }),
    );
  }, [data]);

  useEffect(() => {
    if (activeSessionVm && activeSessionVm.powerState !== "ON") {
      setActiveSessionId(null);
    }
  }, [activeSessionVm]);

  useEffect(() => {
    if (activeSessionId && !sshSessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sshSessions[0]?.id ?? null);
    }
  }, [activeSessionId, sshSessions]);

  if (isLoading) return <div>Loading...</div>;

  const saveTags = async (vm: VmRecord) => {
    const draft = tagDrafts[vm.id] ?? "";
    const tags = draft
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSavingTagsFor(vm.id);

    try {
      await updateVmTags(vm.id, tags);
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setTagDrafts((current) => ({
        ...current,
        [vm.id]: tags.join(", "),
      }));
    } finally {
      setSavingTagsFor(null);
    }
  };

  const runVmAction = async (vmId: string, action: "start" | "stop") => {
    setRunningActionFor(`${action}:${vmId}`);

    try {
      if (action === "start") {
        await startVM(vmId);
      } else {
        await stopVM(vmId);
      }

      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setRunningActionFor(null);
    }
  };

  const openConnectionModal = (vm: VmRecord, autoOpenSsh = false) => {
    setEditingConnectionVmId(vm.id);
    setOpenSshAfterSave(autoOpenSsh);
    setConnectionError("");
    setConnectionDraft({
      sshHost: vm.sshHost ?? "",
      sshPort: String(vm.sshPort ?? 22),
      sshUser: vm.sshUser ?? "",
    });
  };

  const openSshSession = (vmId: string) => {
    const sessionId = crypto.randomUUID();
    setSshSessions((current) => [...current, { id: sessionId, vmId }]);
    setActiveSessionId(sessionId);
    setIsAddSessionOpen(false);
  };

  const waitForVmSshReady = async (vmId: string, timeoutMs = 120000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      const currentVm = (queryClient.getQueryData(["vms"]) as VmRecord[] | undefined)?.find(
        (candidate) => candidate.id === vmId,
      );

      if (currentVm?.powerState === "ON") {
        const ready = await checkVmSshReady(vmId);
        if (ready) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    return false;
  };

  const handleSshClick = async (vm: VmRecord) => {
    if (!vm.sshHost || !vm.sshUser) {
      openConnectionModal(vm, true);
      return;
    }

    setIsOpeningSessionFor(vm.id);

    try {
      if (vm.powerState !== "ON") {
        await startVM(vm.id);
      }

      const ready = await waitForVmSshReady(vm.id);

      if (!ready) {
        setConnectionError("The VM did not become SSH-ready in time.");
        openConnectionModal(vm, false);
        return;
      }

      openSshSession(vm.id);
    } finally {
      setIsOpeningSessionFor(null);
    }
  };

  const closeSshSession = (sessionId: string) => {
    setSshSessions((current) => {
      const remaining = current.filter((session) => session.id !== sessionId);

      setActiveSessionId((active) => {
        if (active !== sessionId) {
          return active;
        }

        return remaining[0]?.id ?? null;
      });

      return remaining;
    });
  };

  const saveConnection = async (vm: VmRecord) => {
    const sshHost = connectionDraft.sshHost.trim();
    const sshUser = connectionDraft.sshUser.trim();
    const sshPortRaw = connectionDraft.sshPort.trim();
    const sshPort = sshPortRaw ? Number(sshPortRaw) : null;
    const hasValidPort =
      sshPort !== null &&
      Number.isInteger(sshPort) &&
      sshPort >= 1 &&
      sshPort <= 65535;

    if (!sshHost) {
      setConnectionError("Please enter the VM IP or hostname.");
      return;
    }

    if (!sshUser) {
      setConnectionError("Please enter the SSH username.");
      return;
    }

    if (sshPortRaw && !hasValidPort) {
      setConnectionError("SSH port must be a valid number between 1 and 65535.");
      return;
    }

    setSavingConnectionFor(vm.id);
    setConnectionError("");

    try {
      await updateVmConnection(vm.id, {
        sshHost,
        sshPort,
        sshUser,
      });
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setEditingConnectionVmId(null);

      if (openSshAfterSave) {
        openSshSession(vm.id);
      }
    } catch {
      setConnectionError("Could not update connection details. Please try again.");
    } finally {
      setSavingConnectionFor(null);
      setOpenSshAfterSave(false);
    }
  };

  const editingVm =
    editingConnectionVmId != null
      ? data.find((vm) => vm.id === editingConnectionVmId) ?? null
      : null;

  return (
    <div className="space-y-8 p-6">
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden border-white/10 bg-white/5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_38%)]" />
          <div className="relative space-y-4">
            <Badge label="Private cloud control plane" tone="info" />
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                VM inventory with live operator status
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                Track your local VMware fleet in real time, launch safe actions,
                and keep each machine organized with tags and SSH access from
                the same dashboard.
              </p>
              <p className="text-sm text-slate-400">
                Last SSH login across the fleet:{" "}
                <span className="text-white">
                  {latestSshLogin ? formatRelativeDate(latestSshLogin) : "No SSH session yet"}
                </span>
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <StatCard label="Total VMs" value={stats.total} tone="info" />
          <StatCard label="Running now" value={stats.running} tone="success" />
          <StatCard label="Powered off" value={stats.stopped} tone="warning" />
        </div>
      </div>

      <Card className="border-white/10 bg-white/5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              SSH workspace
            </p>
            <h2 className="text-2xl font-semibold text-white">
              Multi-session operator console
            </h2>
            <p className="text-sm text-slate-300">
              Open running VMs into dedicated SSH tabs, switch fast, and keep
              the active terminal front and center.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              Active tabs: <span className="text-white">{sshSessions.length}</span>
            </div>
            <Button
              variant="secondary"
              onClick={() => setIsAddSessionOpen((current) => !current)}
            >
              {isAddSessionOpen ? "Hide session picker" : "Add SSH tab"}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsAddSessionOpen((current) => !current)}
            className="inline-flex items-center justify-center rounded-2xl border border-dashed border-white/20 px-4 py-2 text-lg text-slate-300 transition hover:border-teal-400/40 hover:text-white"
          >
            +
          </button>
          {sshSessions.length > 0 ? (
            sshSessions.map((session) => {
              const vm = data.find((candidate) => candidate.id === session.vmId);

              if (!vm) {
                return null;
              }

              const isActive = activeSessionId === session.id;

              return (
                <div
                  key={session.id}
                  className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                    isActive
                      ? "border-teal-400/40 bg-teal-400/10"
                      : "border-white/10 bg-slate-950/70"
                  }`}
                >
                  <button
                    type="button"
                    className="text-sm text-white"
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    {vm.name}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-400 transition hover:text-white"
                    onClick={() => closeSshSession(session.id)}
                  >
                    Close
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-400">
              No active SSH sessions yet. Start one with the add-tab action.
            </p>
          )}
        </div>
      </Card>

      {isAddSessionOpen && !activeSessionVm ? (
        <Card className="border-white/10 bg-slate-950/90">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  New SSH tab
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Select a VM to open in a new tab
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  Running VMs open immediately. Powered-off VMs will be started and connected when SSH is reachable.
                </div>
              </div>
              <Button variant="ghost" onClick={() => setIsAddSessionOpen(false)}>
                Close
              </Button>
            </div>

            <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {sessionCandidateVms.map((vm) => (
                <button
                  key={vm.id}
                  type="button"
                  onClick={() => void handleSshClick(vm)}
                  disabled={isOpeningSessionFor === vm.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-left transition hover:border-teal-400/40 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{vm.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{vm.id}</div>
                    </div>
                    <PowerBadge powerState={vm.powerState} />
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    {vm.sshUser && vm.sshHost
                      ? `${vm.sshUser}@${vm.sshHost}:${vm.sshPort ?? 22}`
                      : "SSH not configured yet"}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {isOpeningSessionFor === vm.id
                      ? "Preparing SSH session..."
                      : vm.powerState === "ON"
                        ? "Open a new tab now"
                        : "Start, wait for SSH, then open a tab"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-white/10 bg-slate-950/85">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Inventory
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Running VMs first, searchable at a glance
              </h2>
            </div>

            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, tag, id, host..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400 sm:max-w-sm"
            />
          </div>

          <div className="text-sm text-slate-400">
            Showing <span className="text-white">{visibleVms.length}</span> VMs sorted by
            state and name.
          </div>
        </Card>

        {activeSessionVm ? (
          <Card className="border-white/10 bg-slate-950/90">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Active session
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {activeSessionVm.name}
              </h2>
              <p className="text-sm text-slate-400">
                {activeSessionVm.sshUser}@{activeSessionVm.sshHost}:{activeSessionVm.sshPort ?? 22}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="border-white/10 bg-slate-950/90">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Active session
              </p>
              <h2 className="text-2xl font-semibold text-white">
                No SSH session selected
              </h2>
              <p className="text-sm text-slate-400">
                Pick a running VM from the list or the SSH workspace above.
              </p>
            </div>
          </Card>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {visibleVms.map((vm) => {
          const draft = tagDrafts[vm.id] ?? vm.tags.join(", ");
          const isSelected = activeSessionVm?.id === vm.id;
          const isSaving = savingTagsFor === vm.id;
          const isStarting = runningActionFor === `start:${vm.id}`;
          const isStopping = runningActionFor === `stop:${vm.id}`;
          const canOpenSsh = vm.powerState === "ON";
          const canStartVm = vm.powerState !== "ON";
          const canStopVm = vm.powerState === "ON";

          return (
            <Card
              key={vm.id}
              className="border-white/10 bg-slate-950/70 shadow-[0_18px_60px_rgba(15,23,42,0.32)]"
            >
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        {vm.type}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {vm.name}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PowerBadge powerState={vm.powerState} />
                      {vm.sshHost ? (
                        <Badge
                          label={`${vm.sshUser ?? "user"}@${vm.sshHost}:${vm.sshPort ?? 22}`}
                          tone="neutral"
                        />
                      ) : (
                        <Badge label="No SSH mapping" tone="warning" />
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                      VM id
                    </div>
                    <div className="mt-1 text-sm text-slate-200">{vm.id}</div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
                  <InfoRow label="VMX path" value={vm.vmxPath} />
                  <InfoRow
                    label="SSH user"
                    value={vm.sshUser ? `${vm.sshUser}@${vm.sshHost}:${vm.sshPort ?? 22}` : "Not configured"}
                  />
                  <InfoRow label="Last online" value={formatLastOnline(vm)} />
                  <InfoRow
                    label="Last SSH login"
                    value={vm.lastSshLoginAt ? formatRelativeDate(vm.lastSshLoginAt) : "Never"}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white">Tags</h3>
                    <span className="text-xs text-slate-400">
                      Comma-separated
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {vm.tags.length > 0 ? (
                      vm.tags.map((tag) => (
                        <Badge key={tag} label={tag} tone="info" />
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">
                        No tags yet
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <input
                      value={draft}
                      onChange={(event) =>
                        setTagDrafts((current) => ({
                          ...current,
                          [vm.id]: event.target.value,
                        }))
                      }
                      placeholder="gateway, security, vpn"
                      className="flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                    <Button
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => saveTags(vm)}
                    >
                      {isSaving ? "Saving..." : "Save tags"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={isStarting || isOpeningSessionFor === vm.id || !canStartVm}
                    onClick={() => runVmAction(vm.id, "start")}
                  >
                    {isStarting ? "Starting..." : "Start VM"}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={isStopping || !canStopVm}
                    onClick={() => runVmAction(vm.id, "stop")}
                  >
                    {isStopping ? "Stopping..." : "Stop VM"}
                  </Button>
                  <Button
                    variant={isSelected ? "secondary" : "ghost"}
                    disabled={isOpeningSessionFor === vm.id}
                    onClick={() => void handleSshClick(vm)}
                  >
                    {isOpeningSessionFor === vm.id
                      ? "Preparing SSH..."
                      : isSelected
                        ? "Active tab"
                        : "Open SSH"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openConnectionModal(vm)}
                  >
                    Edit connection
                  </Button>
                </div>

                {!canOpenSsh && isOpeningSessionFor !== vm.id ? (
                  <p className="text-sm text-amber-200/90">
                    SSH can boot this VM and connect automatically when it becomes ready.
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {activeSessionVm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="h-[82vh] w-full max-w-[92rem] resize overflow-auto rounded-[1.75rem]">
          <Card className="h-full w-full border-white/10 bg-slate-950/95">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Live shell
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  SSH session for {activeSessionVm.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {activeSessionVm.sshUser}@{activeSessionVm.sshHost}:{activeSessionVm.sshPort ?? 22}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => activeSessionId && closeSshSession(activeSessionId)}
                >
                  Close session
                </Button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 overflow-x-auto border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setIsAddSessionOpen(true)}
                className="inline-flex items-center justify-center rounded-t-2xl border border-dashed border-white/20 px-4 py-2 text-lg text-slate-300 transition hover:border-teal-400/40 hover:text-white"
              >
                +
              </button>
              {sshSessions.map((session) => {
                const vm = data.find((candidate) => candidate.id === session.vmId);

                if (!vm) {
                  return null;
                }

                const isActive = session.id === activeSessionId;

                return (
                  <div
                    key={session.id}
                    className={`inline-flex items-center gap-2 rounded-t-2xl border px-4 py-2 ${
                      isActive
                        ? "border-teal-400/40 bg-teal-400/12 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(session.id)}
                      className="text-sm"
                    >
                      {vm.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeSshSession(session.id)}
                      className="text-xs text-slate-400 transition hover:text-white"
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>

            {isAddSessionOpen ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-slate-900/90 p-4">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      New SSH tab
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Select a VM to open in a new tab
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      Running VMs open immediately. Powered-off VMs will be started and connected when SSH is reachable.
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => setIsAddSessionOpen(false)}>
                    Close
                  </Button>
                </div>

                <div className="grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {sessionCandidateVms.map((vm) => (
                    <button
                      key={vm.id}
                      type="button"
                      onClick={() => void handleSshClick(vm)}
                      disabled={isOpeningSessionFor === vm.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-left transition hover:border-teal-400/40 hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{vm.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{vm.id}</div>
                        </div>
                        <PowerBadge powerState={vm.powerState} />
                      </div>
                      <div className="mt-3 text-sm text-slate-300">
                        {vm.sshUser && vm.sshHost
                          ? `${vm.sshUser}@${vm.sshHost}:${vm.sshPort ?? 22}`
                          : "SSH not configured yet"}
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        {isOpeningSessionFor === vm.id
                          ? "Preparing SSH session..."
                          : vm.powerState === "ON"
                            ? "Open a new tab now"
                            : "Start, wait for SSH, then open a tab"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="relative h-[calc(100%-7rem)] min-h-[480px] overflow-hidden rounded-2xl border border-white/10 bg-black/80 p-3">
              {sshSessions.map((session) => {
                const vm = data.find((candidate) => candidate.id === session.vmId);

                if (!vm) {
                  return null;
                }

                const isActive = session.id === activeSessionId;

                return (
                  <div
                    key={session.id}
                    className={`absolute inset-3 ${
                      isActive
                        ? "z-10 opacity-100"
                        : "pointer-events-none z-0 opacity-0"
                    }`}
                  >
                    <SSHTerminal vmId={vm.id} active={isActive} />
                  </div>
                );
              })}
            </div>
          </Card>
          </div>
        </div>
      )}

      {editingVm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  SSH connection
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  {openSshAfterSave ? "Set connection details before opening SSH" : `Edit connection for ${editingVm.name}`}
                </h2>
                <p className="text-sm leading-6 text-slate-400">
                  Keep the live SSH target here so the dashboard follows IP changes
                  without needing to edit the inventory bootstrap file.
                </p>
              </div>

              <div className="grid gap-4">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">IP or hostname</span>
                  <input
                    value={connectionDraft.sshHost}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({
                        ...current,
                        sshHost: event.target.value,
                      }))
                    }
                    placeholder="10.10.0.14"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">SSH port</span>
                    <input
                      value={connectionDraft.sshPort}
                      onChange={(event) =>
                        setConnectionDraft((current) => ({
                          ...current,
                          sshPort: event.target.value,
                        }))
                      }
                      placeholder="22"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">SSH user</span>
                    <input
                      value={connectionDraft.sshUser}
                      onChange={(event) =>
                        setConnectionDraft((current) => ({
                          ...current,
                          sshUser: event.target.value,
                        }))
                      }
                      placeholder="nightroo"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>
                </div>

                {connectionError ? (
                  <p className="text-sm text-rose-300">{connectionError}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingConnectionVmId(null);
                    setOpenSshAfterSave(false);
                    setConnectionError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={savingConnectionFor === editingVm.id}
                  onClick={() => saveConnection(editingVm)}
                >
                  {savingConnectionFor === editingVm.id
                    ? "Saving..."
                    : openSshAfterSave
                      ? "Save and open SSH"
                      : "Save connection"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "info";
}) {
  return (
    <Card className="border-white/10 bg-white/5">
      <div className="space-y-2">
        <Badge label={label} tone={tone} />
        <div className="text-3xl font-semibold text-white">{value}</div>
      </div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className="max-w-[70%] text-right text-slate-200">{value}</span>
    </div>
  );
}

function PowerBadge({ powerState }: { powerState: VmRecord["powerState"] }) {
  if (powerState === "ON") {
    return <Badge label="Running" tone="success" />;
  }

  if (powerState === "OFF") {
    return <Badge label="Powered off" tone="warning" />;
  }

  return <Badge label="Unknown" tone="danger" />;
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const deltaMs = Date.now() - date.getTime();

  if (deltaMs < 60_000) {
    return "Just now";
  }

  if (deltaMs < 3_600_000) {
    return `${Math.floor(deltaMs / 60_000)} min ago`;
  }

  if (deltaMs < 86_400_000) {
    return `${Math.floor(deltaMs / 3_600_000)} h ago`;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastOnline(vm: VmRecord) {
  if (vm.powerState === "ON") {
    return "Online now";
  }

  if (vm.lastSeenOnlineAt) {
    return formatRelativeDate(vm.lastSeenOnlineAt);
  }

  return "Never detected online";
}
