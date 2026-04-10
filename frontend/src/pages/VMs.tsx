import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useVMs } from "../hooks/useVMs";
import { useJobs } from "../hooks/useJobs";
import { useCyberNews } from "../hooks/useCyberNews";
import { useTrafficMetrics } from "../hooks/useTrafficMetrics";
import { useLabStacks } from "../hooks/useLabStacks";
import type { CyberNewsItem } from "../api/news";
import {
  createLabStack,
  deleteLabStack,
  updateLabStack,
  type LabStack,
  type LabStackPayload,
  type LabStackTone,
} from "../api/labs";
import {
  checkVmSshReady,
  createVm,
  fetchVmUpdateFeed,
  refreshVmState,
  type CreateVmPayload,
  type UpdateVmSettingsPayload,
  type VmUpdateFeedRecord,
  type VmRecord,
  updateVmConnection,
  updateVmSettings,
  updateVmTags,
} from "../api/vms";
import { rebootVM, startVM, stopVM, updateVM } from "../api/jobs";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import SSHTerminal from "../components/ssh/Terminal";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

type SecurityRotationSummary = {
  candidateCount: number;
  queued: Array<{ vmId: string; vmName: string; securityCount: number }>;
  blocked: Array<{ vmId: string; vmName: string; reasons: string[] }>;
  skipped: Array<{ vmId: string; vmName: string; reason: string }>;
  errors: Array<{ vmId: string; vmName: string; error: string }>;
  generatedAt: string;
};

type JobTrendPoint = {
  label: string;
  start: number;
  stop: number;
  update: number;
  other: number;
  total: number;
};

const CRITICAL_GATEWAY_VM_ID = "FG-VM";

const VM_VIEW_LINKS = [
  { href: "#fleet-overview", label: "Overview" },
  { href: "#operator-charts", label: "Charts" },
  { href: "#lab-runbooks", label: "Runbooks" },
  { href: "#ssh-workspace", label: "SSH" },
  { href: "#vm-inventory", label: "Inventory" },
] as const;

const OS_FAMILY_OPTIONS: Array<{
  value: NonNullable<CreateVmPayload["osFamily"]>;
  label: string;
}> = [
  { value: "ubuntu", label: "Ubuntu" },
  { value: "debian", label: "Debian" },
  { value: "kali", label: "Kali" },
  { value: "windows", label: "Windows" },
  { value: "fortigate", label: "FortiGate" },
  { value: "other", label: "Other / unsupported" },
];

const DEFAULT_NEW_VM_DRAFT = {
  id: "",
  name: "",
  vmxPath: "",
  type: "PERSISTENT" as CreateVmPayload["type"],
  tags: "",
  osFamily: "ubuntu" as NonNullable<CreateVmPayload["osFamily"]>,
  osVersion: "",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshKeyPath: "",
  sshPassword: "",
};

const DEFAULT_VM_SETTINGS_DRAFT = {
  name: "",
  vmxPath: "",
  type: "PERSISTENT" as CreateVmPayload["type"],
  tags: "",
  osFamily: "other" as NonNullable<CreateVmPayload["osFamily"]>,
  osVersion: "",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshKeyPath: "",
  sshPassword: "",
};

const LAB_TONE_OPTIONS: Array<{ value: LabStackTone; label: string }> = [
  { value: "info", label: "Blue / info" },
  { value: "danger", label: "Red / offensive" },
  { value: "neutral", label: "Purple / mixed" },
  { value: "success", label: "Green / service" },
];

const DEFAULT_LAB_STACK_DRAFT = {
  id: "",
  name: "",
  fireLabel: "",
  stopLabel: "",
  description: "",
  vmIds: [] as string[],
  tone: "info" as LabStackTone,
  gatewayVmId: CRITICAL_GATEWAY_VM_ID,
  includeGatewayOnStart: true,
};

export default function VMs() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useVMs();
  const { data: jobs = [] } = useJobs();
  const { data: cyberNews, isLoading: isLoadingCyberNews } = useCyberNews(40);
  const { data: trafficMetrics } = useTrafficMetrics(12);
  const { data: labStacks = [] } = useLabStacks();
  const [sshSessions, setSshSessions] = useState<Array<{ id: string; vmId: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isOpeningSessionFor, setIsOpeningSessionFor] = useState<string | null>(null);
  const [isCreateVmOpen, setIsCreateVmOpen] = useState(false);
  const [newVmDraft, setNewVmDraft] = useState(DEFAULT_NEW_VM_DRAFT);
  const [isCreatingVm, setIsCreatingVm] = useState(false);
  const [createVmError, setCreateVmError] = useState("");
  const [editingVmSettingsId, setEditingVmSettingsId] = useState<string | null>(null);
  const [vmSettingsDraft, setVmSettingsDraft] = useState(DEFAULT_VM_SETTINGS_DRAFT);
  const [isSavingVmSettings, setIsSavingVmSettings] = useState(false);
  const [vmSettingsError, setVmSettingsError] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [savingTagsFor, setSavingTagsFor] = useState<string | null>(null);
  const [runningActionFor, setRunningActionFor] = useState<string | null>(null);
  const [updatingVmId, setUpdatingVmId] = useState<string | null>(null);
  const [editingConnectionVmId, setEditingConnectionVmId] = useState<string | null>(null);
  const [openSshAfterSave, setOpenSshAfterSave] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState({
    sshHost: "",
    sshPort: "22",
    sshUser: "",
  });
  const [savingConnectionFor, setSavingConnectionFor] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [runningLabActionId, setRunningLabActionId] = useState<string | null>(null);
  const [stopLabPreset, setStopLabPreset] = useState<LabStack | null>(null);
  const [includeGatewayOnStop, setIncludeGatewayOnStop] = useState(false);
  const [allowGatewayHardStopFallback, setAllowGatewayHardStopFallback] = useState(false);
  const [editingLabStackId, setEditingLabStackId] = useState<string | "new" | null>(null);
  const [labStackDraft, setLabStackDraft] = useState(DEFAULT_LAB_STACK_DRAFT);
  const [labStackError, setLabStackError] = useState("");
  const [isSavingLabStack, setIsSavingLabStack] = useState(false);
  const [isDeletingLabStack, setIsDeletingLabStack] = useState(false);
  const [updateFeedVmId, setUpdateFeedVmId] = useState<string | null>(null);
  const [updateFeed, setUpdateFeed] = useState<VmUpdateFeedRecord | null>(null);
  const [loadingUpdateFeedFor, setLoadingUpdateFeedFor] = useState<string | null>(null);
  const [updateFeedError, setUpdateFeedError] = useState("");
  const [isRunningSecurityRotation, setIsRunningSecurityRotation] = useState(false);
  const [securityRotationSummary, setSecurityRotationSummary] =
    useState<SecurityRotationSummary | null>(null);
  const [rebootVmState, setRebootVmState] = useState<{
    vmId: string;
    source: "power" | "required";
  } | null>(null);
  const [isQueueingRebootFor, setIsQueueingRebootFor] = useState<string | null>(null);
  const [refreshingVmId, setRefreshingVmId] = useState<string | null>(null);
  const [showAllCyberNews, setShowAllCyberNews] = useState(false);
  const [isCyberNewsPaused, setIsCyberNewsPaused] = useState(false);
  const [selectedCyberStory, setSelectedCyberStory] = useState<CyberNewsItem | null>(null);
  const cyberNewsScrollerRef = useRef<HTMLDivElement | null>(null);

  const stats = {
    total: data.length,
    running: data.filter((vm) => vm.powerState === "ON").length,
    stopped: data.filter((vm) => vm.powerState === "OFF").length,
    rebootRequired: data.filter((vm) => vm.rebootRequired).length,
    updatedThisWeek: data.filter((vm) => isWithinWindow(vm.lastUpdatedAt, 7 * 24)).length,
    sshThisDay: data.filter((vm) => isWithinWindow(vm.lastSshLoginAt, 24)).length,
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
  const latestUpdate = useMemo(() => {
    const timestamps = data
      .map((vm) => vm.lastUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

    return timestamps[0] ?? null;
  }, [data]);
  const sshHeatmap = useMemo(
    () => buildHourlyHeatmap(data.map((vm) => vm.lastSshLoginAt), 12),
    [data],
  );
  const updateHeatmap = useMemo(
    () => buildDailyHeatmap(data.map((vm) => vm.lastUpdatedAt), 7),
    [data],
  );
  const jobTrend = useMemo(() => buildJobTrend(jobs, 10), [jobs]);
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
  const labStatuses = useMemo(
    () =>
      labStacks.map((preset) => {
        const members = preset.vmIds
          .map((vmId) => data.find((vm) => vm.id === vmId))
          .filter((vm): vm is VmRecord => Boolean(vm));
        const runningCount = members.filter((vm) => vm.powerState === "ON").length;

        return {
          preset,
          runningCount,
          totalCount: preset.vmIds.length,
          allRunning: members.length === preset.vmIds.length && runningCount === preset.vmIds.length,
        };
      }),
    [data, labStacks],
  );

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

  useEffect(() => {
    const container = cyberNewsScrollerRef.current;
    if (!container || isCyberNewsPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!container) {
        return;
      }

      const maxScrollTop = container.scrollHeight - container.clientHeight;
      if (maxScrollTop <= 0) {
        return;
      }

      if (container.scrollTop >= maxScrollTop - 2) {
        container.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      container.scrollTop += 1;
    }, 50);

    return () => window.clearInterval(interval);
  }, [cyberNews?.items.length, isCyberNewsPaused, showAllCyberNews]);

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

  const saveNewVm = async () => {
    const id = newVmDraft.id.trim();
    const name = newVmDraft.name.trim();
    const vmxPath = newVmDraft.vmxPath.trim();
    const sshPortRaw = newVmDraft.sshPort.trim();
    const sshPort = sshPortRaw ? Number(sshPortRaw) : null;
    const tags = newVmDraft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!id || !name || !vmxPath) {
      setCreateVmError("VM id, name, and VMX path are required.");
      return;
    }

    if (
      sshPortRaw &&
      (!Number.isInteger(sshPort) || sshPort === null || sshPort < 1 || sshPort > 65535)
    ) {
      setCreateVmError("SSH port must be a valid number between 1 and 65535.");
      return;
    }

    setIsCreatingVm(true);
    setCreateVmError("");

    try {
      await createVm({
        id,
        name,
        vmxPath,
        type: newVmDraft.type,
        tags,
        osFamily: newVmDraft.osFamily,
        osVersion: newVmDraft.osVersion.trim(),
        sshHost: newVmDraft.sshHost.trim(),
        sshPort,
        sshUser: newVmDraft.sshUser.trim(),
        sshKeyPath: newVmDraft.sshKeyPath.trim(),
        sshPassword: newVmDraft.sshPassword,
      });
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setNewVmDraft(DEFAULT_NEW_VM_DRAFT);
      setIsCreateVmOpen(false);
    } catch (error: any) {
      setCreateVmError(
        error?.response?.data?.error ??
          error?.message ??
          "Could not add the VM. Check the VM id and VMX path.",
      );
    } finally {
      setIsCreatingVm(false);
    }
  };

  const openVmSettingsModal = (vm: VmRecord) => {
    const inferredFamily = inferOsFamilyFromVm(vm);

    setEditingVmSettingsId(vm.id);
    setVmSettingsError("");
    setVmSettingsDraft({
      name: vm.name,
      vmxPath: vm.vmxPath,
      type: vm.type,
      tags: vm.tags.join(", "),
      osFamily: (inferredFamily || "other") as NonNullable<CreateVmPayload["osFamily"]>,
      osVersion: vm.osVersion ?? "",
      sshHost: vm.sshHost ?? "",
      sshPort: String(vm.sshPort ?? 22),
      sshUser: vm.sshUser ?? "",
      sshKeyPath: "",
      sshPassword: "",
    });
  };

  const saveVmSettings = async (vm: VmRecord) => {
    const name = vmSettingsDraft.name.trim();
    const vmxPath = vmSettingsDraft.vmxPath.trim();
    const sshPortRaw = vmSettingsDraft.sshPort.trim();
    const sshPort = sshPortRaw ? Number(sshPortRaw) : null;
    const tags = vmSettingsDraft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!name || !vmxPath) {
      setVmSettingsError("VM name and VMX path are required.");
      return;
    }

    if (
      sshPortRaw &&
      (!Number.isInteger(sshPort) || sshPort === null || sshPort < 1 || sshPort > 65535)
    ) {
      setVmSettingsError("SSH port must be a valid number between 1 and 65535.");
      return;
    }

    const payload: UpdateVmSettingsPayload = {
      name,
      vmxPath,
      type: vmSettingsDraft.type,
      tags,
      osFamily: vmSettingsDraft.osFamily,
      osVersion: vmSettingsDraft.osVersion.trim(),
      sshHost: vmSettingsDraft.sshHost.trim(),
      sshPort,
      sshUser: vmSettingsDraft.sshUser.trim(),
      sshKeyPath: vmSettingsDraft.sshKeyPath.trim(),
    };

    const password = vmSettingsDraft.sshPassword;
    if (password) {
      payload.sshPassword = password;
    }

    setIsSavingVmSettings(true);
    setVmSettingsError("");

    try {
      await updateVmSettings(vm.id, payload);
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setEditingVmSettingsId(null);
      setVmSettingsDraft(DEFAULT_VM_SETTINGS_DRAFT);
    } catch (error: any) {
      setVmSettingsError(
        error?.response?.data?.error ??
          error?.message ??
          "Could not update VM settings. Check the VMX path and OS family.",
      );
    } finally {
      setIsSavingVmSettings(false);
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

  const queueVmReboot = async (vm: VmRecord, rebootMode: "soft" | "hard") => {
    setIsQueueingRebootFor(vm.id);

    try {
      await rebootVM(vm.id, { rebootMode });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setRebootVmState(null);
    } finally {
      setIsQueueingRebootFor(null);
    }
  };

  const runVmUpdate = async (vmId: string) => {
    setUpdatingVmId(vmId);

    try {
      await updateVM(vmId, { mode: "security", autoremove: false });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setUpdatingVmId(null);
    }
  };

  const runVmRefresh = async (vmId: string) => {
    setRefreshingVmId(vmId);

    try {
      await refreshVmState(vmId);
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
    } finally {
      setRefreshingVmId(null);
    }
  };

  const openUpdateFeed = async (vm: VmRecord) => {
    setUpdateFeedVmId(vm.id);
    setUpdateFeed(null);
    setUpdateFeedError("");
    setLoadingUpdateFeedFor(vm.id);

    try {
      if (vm.powerState !== "ON") {
        setUpdateFeedError("Start this VM first, then reopen the security feed to inspect live package changes.");
        return;
      }

      if (!isManagedUpdateVm(vm)) {
        setUpdateFeedError("The security feed is currently available only for running apt-managed Linux VMs and Windows VMs.");
        return;
      }

      const feed = await fetchVmUpdateFeed(vm.id, "security");
      setUpdateFeed(feed);
    } catch (error: any) {
      setUpdateFeedError(
        error?.response?.data?.error ??
          error?.message ??
          "Could not load the security change feed for this VM.",
      );
    } finally {
      setLoadingUpdateFeedFor(null);
    }
  };

  const openLabStackEditor = (lab?: LabStack) => {
    setLabStackError("");

    if (!lab) {
      setEditingLabStackId("new");
      setLabStackDraft(DEFAULT_LAB_STACK_DRAFT);
      return;
    }

    setEditingLabStackId(lab.id);
    setLabStackDraft({
      id: lab.id,
      name: lab.name,
      fireLabel: lab.fireLabel,
      stopLabel: lab.stopLabel,
      description: lab.description,
      vmIds: lab.vmIds,
      tone: lab.tone,
      gatewayVmId: lab.gatewayVmId ?? "",
      includeGatewayOnStart: lab.includeGatewayOnStart,
    });
  };

  const closeLabStackEditor = () => {
    setEditingLabStackId(null);
    setLabStackDraft(DEFAULT_LAB_STACK_DRAFT);
    setLabStackError("");
  };

  const saveLabStack = async () => {
    const id = labStackDraft.id.trim();
    const name = labStackDraft.name.trim();
    const vmIds = Array.from(new Set(labStackDraft.vmIds));

    if (!id || !name) {
      setLabStackError("Lab id and name are required.");
      return;
    }

    if (vmIds.length === 0) {
      setLabStackError("Select at least one VM for this lab stack.");
      return;
    }

    const payload: LabStackPayload = {
      id,
      name,
      fireLabel: labStackDraft.fireLabel.trim() || `Fire ${name}`,
      stopLabel: labStackDraft.stopLabel.trim() || `Stop ${name}`,
      description: labStackDraft.description.trim() || `Starts ${name} lab stack.`,
      vmIds,
      tone: labStackDraft.tone,
      gatewayVmId: labStackDraft.gatewayVmId.trim() || null,
      includeGatewayOnStart: labStackDraft.includeGatewayOnStart,
    };

    setIsSavingLabStack(true);
    setLabStackError("");

    try {
      if (editingLabStackId === "new") {
        await createLabStack(payload);
      } else if (editingLabStackId) {
        await updateLabStack(editingLabStackId, payload);
      }

      await queryClient.invalidateQueries({ queryKey: ["lab-stacks"] });
      closeLabStackEditor();
    } catch (error: any) {
      setLabStackError(
        error?.response?.data?.error ??
          error?.message ??
          "Could not save this lab stack.",
      );
    } finally {
      setIsSavingLabStack(false);
    }
  };

  const removeLabStack = async (labId: string) => {
    setIsDeletingLabStack(true);
    setLabStackError("");

    try {
      await deleteLabStack(labId);
      await queryClient.invalidateQueries({ queryKey: ["lab-stacks"] });
      closeLabStackEditor();
    } catch (error: any) {
      setLabStackError(
        error?.response?.data?.error ??
          error?.message ??
          "Could not delete this lab stack.",
      );
    } finally {
      setIsDeletingLabStack(false);
    }
  };

  const toggleLabVm = (vmId: string) => {
    setLabStackDraft((current) => ({
      ...current,
      vmIds: current.vmIds.includes(vmId)
        ? current.vmIds.filter((candidate) => candidate !== vmId)
        : [...current.vmIds, vmId],
    }));
  };

  const runLabStart = async (preset: LabStack) => {
    setRunningLabActionId(`start:${preset.id}`);

    try {
      const gatewayVmId = preset.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID;
      const gatewayVm = data.find((vm) => vm.id === gatewayVmId);
      if (preset.includeGatewayOnStart && gatewayVm && gatewayVm.powerState !== "ON") {
        await startVM(gatewayVmId);
      }

      for (const vmId of preset.vmIds) {
        const vm = data.find((candidate) => candidate.id === vmId);
        if (!vm || vm.powerState === "ON") {
          continue;
        }

        await startVM(vmId);
      }

      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setRunningLabActionId(null);
    }
  };

  const runLabStop = async (preset: LabStack, includeGateway: boolean) => {
    setRunningLabActionId(`stop:${preset.id}`);

    try {
      for (const vmId of [...preset.vmIds].reverse()) {
        const vm = data.find((candidate) => candidate.id === vmId);
        if (!vm || vm.powerState !== "ON") {
          continue;
        }

        await stopVM(vmId);
      }

      if (includeGateway) {
        const gatewayVmId = preset.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID;
        const gatewayVm = data.find((vm) => vm.id === gatewayVmId);
        if (gatewayVm?.powerState === "ON") {
          await stopVM(gatewayVmId, {
            overrideCriticalInfrastructure: true,
            stopMode: "soft",
            allowHardStopFallback: allowGatewayHardStopFallback,
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setRunningLabActionId(null);
      setStopLabPreset(null);
      setIncludeGatewayOnStop(false);
      setAllowGatewayHardStopFallback(false);
    }
  };

  const runSecurityRotation = async () => {
    setIsRunningSecurityRotation(true);
    setSecurityRotationSummary(null);

    const candidates = data.filter(
      (vm) =>
        vm.powerState === "ON" &&
        isManagedUpdateVm(vm) &&
        vm.type !== "TEMPLATE" &&
        !vm.isCriticalInfrastructure,
    );

    const summary: SecurityRotationSummary = {
      candidateCount: candidates.length,
      queued: [],
      blocked: [],
      skipped: [],
      errors: [],
      generatedAt: new Date().toISOString(),
    };

    try {
      for (const vm of candidates) {
        try {
          const feed = await fetchVmUpdateFeed(vm.id, "security");
          const criticalSecurityPackages = feed.packages.filter(
            (item) => item.securityCandidate && item.critical,
          );

          if (criticalSecurityPackages.length > 0) {
            summary.blocked.push({
              vmId: vm.id,
              vmName: vm.name,
              reasons: criticalSecurityPackages.map((item) => item.name),
            });
            continue;
          }

          if (feed.securityCandidateCount <= 0) {
            summary.skipped.push({
              vmId: vm.id,
              vmName: vm.name,
              reason: "No security-targeted package changes detected.",
            });
            continue;
          }

          await updateVM(vm.id, { mode: "security", autoremove: false });
          summary.queued.push({
            vmId: vm.id,
            vmName: vm.name,
            securityCount: feed.securityCandidateCount,
          });
        } catch (error: any) {
          summary.errors.push({
            vmId: vm.id,
            vmName: vm.name,
            error:
              error?.response?.data?.error ??
              error?.message ??
              "Unknown rotation error",
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["vms"] });
      setSecurityRotationSummary(summary);
    } finally {
      setIsRunningSecurityRotation(false);
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

  const scrollToVmSection = (href: string) => {
    const target = document.querySelector(href);
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
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
  const editingVmSettings =
    editingVmSettingsId != null
      ? data.find((vm) => vm.id === editingVmSettingsId) ?? null
      : null;

  return (
    <div className="space-y-8 p-6">
      <nav
        aria-label="VM view sections"
        className="sticky top-4 z-50 flex w-full flex-wrap items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 p-2 shadow-[0_18px_60px_rgba(2,6,23,0.45)] backdrop-blur-xl"
      >
        {VM_VIEW_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(event) => {
              event.preventDefault();
              scrollToVmSection(link.href);
            }}
            className="rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4">
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
      </div>

      <div id="fleet-overview" className="scroll-mt-28">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total" value={stats.total} tone="info" sparkline={buildMetricSparkline(stats.total, Math.max(stats.total, 1))} compact />
          <StatCard label="Running" value={stats.running} tone="success" sparkline={buildMetricSparkline(stats.running, Math.max(stats.total, 1))} compact />
          <StatCard label="Off" value={stats.stopped} tone="warning" sparkline={buildMetricSparkline(stats.stopped, Math.max(stats.total, 1))} compact />
          <StatCard
            label="Need reboot"
            value={stats.rebootRequired}
            tone={stats.rebootRequired > 0 ? "danger" : "neutral"}
            sparkline={buildMetricSparkline(stats.rebootRequired, Math.max(stats.total, 1))}
            compact
          />
          <StatCard
            label="Updated 7d"
            value={stats.updatedThisWeek}
            tone="info"
            sparkline={buildMetricSparkline(stats.updatedThisWeek, Math.max(stats.total, 1))}
            compact
          />
          <StatCard
            label="SSH 24h"
            value={stats.sshThisDay}
            tone="success"
            sparkline={buildMetricSparkline(stats.sshThisDay, Math.max(stats.total, 1))}
            compact
          />
        </div>
      </div>

      <div id="operator-charts" className="grid scroll-mt-28 items-start gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="grid self-start gap-4">
          <Card className="border-white/10 bg-white/5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Job volume
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    Execution trend over time
                  </h2>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>Total jobs: <span className="text-slate-200">{jobs.length}</span></div>
                  <div>Last 10 hours</div>
                </div>
              </div>

              <JobsLineChart points={jobTrend} />
            </div>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Traffic volume
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    Frontend to backend API traffic
                  </h2>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>
                    Window: <span className="text-slate-200">Last 12 hours</span>
                  </div>
                  <div>
                    Samples: <span className="text-slate-200">{trafficMetrics?.buckets.length ?? 0}</span>
                  </div>
                </div>
              </div>

              <TrafficLineChart buckets={trafficMetrics?.buckets ?? []} />
            </div>
          </Card>
        </div>

        <div className="grid self-start gap-4">
          <Card className="border-white/10 bg-white/5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Fleet cadence
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    Recent SSH and update activity
                  </h2>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>Last SSH: <span className="text-slate-200">{latestSshLogin ? formatRelativeDate(latestSshLogin) : "Never"}</span></div>
                  <div>Last update: <span className="text-slate-200">{latestUpdate ? formatRelativeDate(latestUpdate) : "Never"}</span></div>
                </div>
              </div>

              <HeatRow
                label="SSH timeline"
                cells={sshHeatmap}
                emptyLabel="No recent SSH logins"
              />
              <HeatRow
                label="Update timeline"
                cells={updateHeatmap}
                emptyLabel="No recent updates"
              />
            </div>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Cyber News
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    Top stories
                  </h2>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {cyberNews?.fetchedAt ? `Updated ${formatRelativeDate(cyberNews.fetchedAt)}` : "Live RSS"}
                </div>
              </div>

              <div
                ref={cyberNewsScrollerRef}
                onMouseEnter={() => setIsCyberNewsPaused(true)}
                onMouseLeave={() => setIsCyberNewsPaused(false)}
                onFocus={() => setIsCyberNewsPaused(true)}
                onBlur={() => setIsCyberNewsPaused(false)}
                className={`${showAllCyberNews ? "max-h-[42rem]" : "max-h-[30rem]"} space-y-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0`}
              >
                {isLoadingCyberNews ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
                    Loading cyber news feed...
                  </div>
                ) : (cyberNews?.items.length ?? 0) > 0 ? (
                  cyberNews!.items.map((item, index) => (
                    <CyberNewsRow
                      key={`${item.link}-${index}`}
                      item={item}
                      onOpen={() => setSelectedCyberStory(item)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
                    No cyber stories are available right now.
                  </div>
                )}
              </div>

              {cyberNews && cyberNews.items.length > 5 ? (
                <div className="flex items-center justify-between gap-4 pt-1">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Auto-scrolling feed, hover to pause
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAllCyberNews((current) => !current)}
                    className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
                  >
                    {showAllCyberNews ? "Show less" : "Show more"}
                  </button>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <Card id="lab-runbooks" className="scroll-mt-28 border-white/10 bg-white/5">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Runbooks
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Fire or stop a lab in one move
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  Create reusable VM stacks for your labs. Each stack can optionally start a gateway first,
                  then fire or stop the selected VMs in one operator action.
                </p>
              </div>
              <Button variant="secondary" onClick={() => openLabStackEditor()}>
                Add lab stack
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {labStatuses.map(({ preset, runningCount, totalCount, allRunning }) => (
              <Card key={preset.id} className="border-white/10 bg-slate-950/70 p-5">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{preset.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">{preset.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        label={`${runningCount}/${totalCount} running`}
                        tone={allRunning ? "success" : "info"}
                      />
                      <Button
                        variant="ghost"
                        onClick={() => openLabStackEditor(preset)}
                        title={`Edit ${preset.name}`}
                        className="px-3"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {preset.gatewayVmId ? (
                      <Badge label={`${preset.gatewayVmId} dependency`} tone="warning" />
                    ) : null}
                    {preset.vmIds.map((vmId) => (
                      <Badge key={vmId} label={vmId} tone="neutral" />
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={runningLabActionId !== null}
                      onClick={() => void runLabStart(preset)}
                    >
                      {runningLabActionId === `start:${preset.id}` ? "Firing..." : preset.fireLabel}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={runningLabActionId !== null}
                      onClick={() => {
                        setStopLabPreset(preset);
                        setIncludeGatewayOnStop(false);
                        setAllowGatewayHardStopFallback(false);
                      }}
                    >
                      {runningLabActionId === `stop:${preset.id}` ? "Stopping..." : preset.stopLabel}
                    </Button>
                  </div>

                  <div className="flex items-end justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <LogoStrip hints={[preset.gatewayVmId, ...preset.vmIds].filter(Boolean) as string[]} />
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      lab preset
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="border-white/10 bg-slate-950/70 p-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Rotate Security Updates</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Check the security feed on running managed Linux and Windows VMs, hold anything with critical or
                    kernel-class changes, and queue only the safer security-only patch jobs.
                  </p>
                </div>
                <Badge
                  label={`${data.filter((vm) => vm.powerState === "ON" && isManagedUpdateVm(vm) && !vm.isCriticalInfrastructure && vm.type !== "TEMPLATE").length} candidates`}
                  tone="info"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={isRunningSecurityRotation}
                  onClick={() => void runSecurityRotation()}
                >
                  {isRunningSecurityRotation ? "Reviewing..." : "Rotate Security Updates"}
                </Button>
                {securityRotationSummary ? (
                  <Button
                    variant="secondary"
                    onClick={() => setSecurityRotationSummary(null)}
                  >
                    Clear summary
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          {securityRotationSummary ? (
            <Card className="border-white/10 bg-slate-950/70 p-5 xl:col-span-2">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Rotation summary
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      Security-only patch review
                    </h3>
                  </div>
                  <div className="text-sm text-slate-400">
                    Generated {formatRelativeDate(securityRotationSummary.generatedAt)}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard label="Candidates" value={securityRotationSummary.candidateCount} tone="info" compact />
                  <StatCard label="Queued" value={securityRotationSummary.queued.length} tone="success" compact />
                  <StatCard label="Blocked" value={securityRotationSummary.blocked.length} tone="danger" compact />
                  <StatCard label="Skipped" value={securityRotationSummary.skipped.length} tone="warning" compact />
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="border-white/10 bg-slate-900/70">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-white">Queued updates</h4>
                      {securityRotationSummary.queued.length > 0 ? (
                        securityRotationSummary.queued.map((item) => (
                          <div key={item.vmId} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            {item.vmName} queued with {item.securityCount} security candidates.
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">No VMs were queued this run.</p>
                      )}
                    </div>
                  </Card>

                  <Card className="border-white/10 bg-slate-900/70">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-white">Blocked for review</h4>
                      {securityRotationSummary.blocked.length > 0 ? (
                        securityRotationSummary.blocked.map((item) => (
                          <div key={item.vmId} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                            <div className="font-medium">{item.vmName}</div>
                            <div className="mt-1 text-xs text-rose-100/80">
                              Critical packages: {item.reasons.join(", ")}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">No critical security changes blocked this run.</p>
                      )}
                    </div>
                  </Card>

                  <Card className="border-white/10 bg-slate-900/70">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-white">Skipped and errors</h4>
                      {securityRotationSummary.skipped.map((item) => (
                        <div key={`skip-${item.vmId}`} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                          {item.vmName}: {item.reason}
                        </div>
                      ))}
                      {securityRotationSummary.errors.map((item) => (
                        <div key={`err-${item.vmId}`} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                          {item.vmName}: {item.error}
                        </div>
                      ))}
                      {securityRotationSummary.skipped.length === 0 &&
                      securityRotationSummary.errors.length === 0 ? (
                        <p className="text-sm text-slate-400">Nothing was skipped or failed.</p>
                      ) : null}
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </Card>

      <Card id="ssh-workspace" className="scroll-mt-28 border-white/10 bg-white/5">
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

      <div id="vm-inventory" className="grid scroll-mt-28 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-white/10 bg-slate-950/85">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                Inventory
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Running VMs first, searchable at a glance
              </h2>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-xl">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, tag, id, host..."
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setCreateVmError("");
                  setIsCreateVmOpen(true);
                }}
                className="shrink-0"
              >
                Add VM
              </Button>
            </div>
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
          const canStopVm = vm.powerState === "ON" && !vm.isCriticalInfrastructure;
          const canUpdateVm = vm.powerState === "ON" && isManagedUpdateVm(vm);
          const isUpdating = updatingVmId === vm.id;

          return (
            <Card
              key={vm.id}
              className="border-white/10 bg-slate-950/70 shadow-[0_18px_60px_rgba(15,23,42,0.32)]"
            >
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <BrandLogo
                        hint={`${vm.id} ${vm.name}`}
                        osFamily={vm.osFamily}
                        size="lg"
                      />
                      <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                        {vm.type}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {vm.name}
                      </h2>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PowerBadge
                        powerState={vm.powerState}
                        onClick={
                          vm.powerState === "ON"
                            ? () => setRebootVmState({ vmId: vm.id, source: "power" })
                            : undefined
                        }
                      />
                      {vm.isCriticalInfrastructure ? (
                        <Badge label="Critical infrastructure" tone="warning" />
                      ) : null}
                      {vm.rebootRequired ? (
                        <Badge
                          label="Reboot required"
                          tone="danger"
                          onClick={() => setRebootVmState({ vmId: vm.id, source: "required" })}
                        />
                      ) : null}
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

                  <div className="flex items-start gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => openVmSettingsModal(vm)}
                      title={`Edit VM settings for ${vm.name}`}
                      className="px-3"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                        VM id
                      </div>
                      <div className="mt-1 text-sm text-slate-200">{vm.id}</div>
                    </div>
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
                  <InfoRow
                    label="OS"
                    value={vm.osVersion ?? vm.osFamily ?? "Unknown"}
                  />
                  <InfoRow
                    label="Last updated"
                    value={vm.lastUpdatedAt ? formatRelativeDate(vm.lastUpdatedAt) : "Never"}
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
                    title={canStartVm ? `Start ${vm.name}` : `${vm.name} is already running`}
                    className="px-3"
                  >
                    {isStarting ? <SpinnerIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={isStopping || !canStopVm}
                    onClick={() => runVmAction(vm.id, "stop")}
                    title={canStopVm ? `Stop ${vm.name}` : `${vm.name} is already powered off`}
                    className="px-3"
                  >
                    {isStopping ? <SpinnerIcon className="h-4 w-4" /> : <StopIcon className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant={isSelected ? "secondary" : "ghost"}
                    disabled={isOpeningSessionFor === vm.id}
                    onClick={() => void handleSshClick(vm)}
                    title={
                      isSelected
                        ? `${vm.name} already has an active SSH tab`
                        : `Open SSH for ${vm.name}`
                    }
                    className="px-3"
                  >
                    {isOpeningSessionFor === vm.id ? (
                      <SpinnerIcon className="h-4 w-4" />
                    ) : isSelected ? (
                      <TerminalIcon className="h-4 w-4" />
                    ) : (
                      <TerminalIcon className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openConnectionModal(vm)}
                    title={`Edit connection for ${vm.name}`}
                    className="px-3"
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </Button>
                  {vm.powerState === "ON" ? (
                    <Button
                      variant="ghost"
                      disabled={refreshingVmId === vm.id}
                      onClick={() => void runVmRefresh(vm.id)}
                      title={`Refresh live state for ${vm.name}`}
                      className="px-3"
                    >
                      {refreshingVmId === vm.id ? (
                        <SpinnerIcon className="h-4 w-4" />
                      ) : (
                        <RefreshIcon className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    disabled={!canUpdateVm || isUpdating}
                    onClick={() => runVmUpdate(vm.id)}
                    title={`Queue security updates for ${vm.name}`}
                    className="px-3"
                  >
                    {isUpdating ? <SpinnerIcon className="h-4 w-4" /> : <ShieldIcon className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={loadingUpdateFeedFor === vm.id}
                    onClick={() => void openUpdateFeed(vm)}
                    title={`Open security feed for ${vm.name}`}
                    className="px-3"
                  >
                    {loadingUpdateFeedFor === vm.id ? (
                      <SpinnerIcon className="h-4 w-4" />
                    ) : (
                      <FeedIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {!canOpenSsh && isOpeningSessionFor !== vm.id ? (
                  <p className="text-sm text-amber-200/90">
                    SSH can boot this VM and connect automatically when it becomes ready.
                  </p>
                ) : null}
                {vm.isCriticalInfrastructure ? (
                  <p className="text-sm text-amber-200/90">
                    This VM is treated as critical lab infrastructure. Routine stop actions are guarded, but lab stop flows can still include it when you explicitly choose to proceed.
                  </p>
                ) : null}
                {!canUpdateVm ? (
                  <p className="text-sm text-slate-400">
                    Server updates are currently available for running apt-managed Linux VMs and Windows VMs.
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

      {isCreateVmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Add VM
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    Register a VM in the control plane
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-400">
                    This adds the VM directly to the PCM database, which is now the single source of truth for VM records.
                    Pick the OS family so update/feed workflows can choose the right command path.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsCreateVmOpen(false);
                    setCreateVmError("");
                  }}
                >
                  Close
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">VM id</span>
                  <input
                    value={newVmDraft.id}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({ ...current, id: event.target.value }))
                    }
                    placeholder="win-srv-2025"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Display name</span>
                  <input
                    value={newVmDraft.name}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Windows Server 2025"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <span className="text-sm text-slate-300">VMX path</span>
                  <input
                    value={newVmDraft.vmxPath}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({ ...current, vmxPath: event.target.value }))
                    }
                    placeholder="D:\Vms\WIN-SRV-2025\Windows Server 2025.vmx"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">VM type</span>
                  <select
                    value={newVmDraft.type}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({
                        ...current,
                        type: event.target.value as CreateVmPayload["type"],
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    <option value="PERSISTENT">Persistent</option>
                    <option value="TEMPLATE">Template</option>
                    <option value="EPHEMERAL">Ephemeral</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">OS family</span>
                  <select
                    value={newVmDraft.osFamily}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({
                        ...current,
                        osFamily: event.target.value as NonNullable<CreateVmPayload["osFamily"]>,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    {OS_FAMILY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">OS version</span>
                  <input
                    value={newVmDraft.osVersion}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({ ...current, osVersion: event.target.value }))
                    }
                    placeholder="Windows Server 2025 / Ubuntu 24.04"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Tags</span>
                  <input
                    value={newVmDraft.tags}
                    onChange={(event) =>
                      setNewVmDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="windows, lab, server"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">SSH details</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Optional, but required for live state refresh, feeds, updates, and browser SSH.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Host/IP</span>
                    <input
                      value={newVmDraft.sshHost}
                      onChange={(event) =>
                        setNewVmDraft((current) => ({ ...current, sshHost: event.target.value }))
                      }
                      placeholder="10.10.0.5"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Port</span>
                    <input
                      value={newVmDraft.sshPort}
                      onChange={(event) =>
                        setNewVmDraft((current) => ({ ...current, sshPort: event.target.value }))
                      }
                      placeholder="22"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">User</span>
                    <input
                      value={newVmDraft.sshUser}
                      onChange={(event) =>
                        setNewVmDraft((current) => ({ ...current, sshUser: event.target.value }))
                      }
                      placeholder="Administrator"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Private key path</span>
                    <input
                      value={newVmDraft.sshKeyPath}
                      onChange={(event) =>
                        setNewVmDraft((current) => ({ ...current, sshKeyPath: event.target.value }))
                      }
                      placeholder="C:\Users\Nightroo\.ssh\id_rsa"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2 lg:col-span-2">
                    <span className="text-sm text-slate-300">Password</span>
                    <input
                      type="password"
                      value={newVmDraft.sshPassword}
                      onChange={(event) =>
                        setNewVmDraft((current) => ({ ...current, sshPassword: event.target.value }))
                      }
                      placeholder="Optional, needed for sudo -S / Windows update jobs if using password auth"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>
                </div>
              </div>

              {createVmError ? (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {createVmError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsCreateVmOpen(false);
                    setCreateVmError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={isCreatingVm}
                  onClick={() => void saveNewVm()}
                >
                  {isCreatingVm ? "Adding..." : "Add VM"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {editingVmSettings ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Edit VM
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    {editingVmSettings.name}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-400">
                    Update the database record that drives VMware actions, SSH, refresh-state,
                    security feeds, and OS-specific workflows. Password stays unchanged unless you enter a new one.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingVmSettingsId(null);
                    setVmSettingsError("");
                    setVmSettingsDraft(DEFAULT_VM_SETTINGS_DRAFT);
                  }}
                >
                  Close
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                VM id: <span className="font-semibold text-white">{editingVmSettings.id}</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Display name</span>
                  <input
                    value={vmSettingsDraft.name}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">VM type</span>
                  <select
                    value={vmSettingsDraft.type}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({
                        ...current,
                        type: event.target.value as CreateVmPayload["type"],
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    <option value="PERSISTENT">Persistent</option>
                    <option value="TEMPLATE">Template</option>
                    <option value="EPHEMERAL">Ephemeral</option>
                  </select>
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <span className="text-sm text-slate-300">VMX path</span>
                  <input
                    value={vmSettingsDraft.vmxPath}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({ ...current, vmxPath: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">OS family</span>
                  <select
                    value={vmSettingsDraft.osFamily}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({
                        ...current,
                        osFamily: event.target.value as NonNullable<CreateVmPayload["osFamily"]>,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    {OS_FAMILY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">OS version</span>
                  <input
                    value={vmSettingsDraft.osVersion}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({ ...current, osVersion: event.target.value }))
                    }
                    placeholder="Windows Server 2025 / Ubuntu 24.04"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <span className="text-sm text-slate-300">Tags</span>
                  <input
                    value={vmSettingsDraft.tags}
                    onChange={(event) =>
                      setVmSettingsDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="gateway, security, vpn"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">SSH and guest workflow details</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    These fields power browser SSH, refresh-state, security feeds, and update jobs.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Host/IP</span>
                    <input
                      value={vmSettingsDraft.sshHost}
                      onChange={(event) =>
                        setVmSettingsDraft((current) => ({ ...current, sshHost: event.target.value }))
                      }
                      placeholder="10.10.0.5"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Port</span>
                    <input
                      value={vmSettingsDraft.sshPort}
                      onChange={(event) =>
                        setVmSettingsDraft((current) => ({ ...current, sshPort: event.target.value }))
                      }
                      placeholder="22"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">User</span>
                    <input
                      value={vmSettingsDraft.sshUser}
                      onChange={(event) =>
                        setVmSettingsDraft((current) => ({ ...current, sshUser: event.target.value }))
                      }
                      placeholder="Administrator"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">Private key path</span>
                    <input
                      value={vmSettingsDraft.sshKeyPath}
                      onChange={(event) =>
                        setVmSettingsDraft((current) => ({ ...current, sshKeyPath: event.target.value }))
                      }
                      placeholder="Leave empty if password auth is used"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>

                  <label className="space-y-2 lg:col-span-2">
                    <span className="text-sm text-slate-300">Password</span>
                    <input
                      type="password"
                      value={vmSettingsDraft.sshPassword}
                      onChange={(event) =>
                        setVmSettingsDraft((current) => ({ ...current, sshPassword: event.target.value }))
                      }
                      placeholder="Leave blank to keep the stored password unchanged"
                      className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                    />
                  </label>
                </div>
              </div>

              {vmSettingsError ? (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {vmSettingsError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingVmSettingsId(null);
                    setVmSettingsError("");
                    setVmSettingsDraft(DEFAULT_VM_SETTINGS_DRAFT);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={isSavingVmSettings}
                  onClick={() => void saveVmSettings(editingVmSettings)}
                >
                  {isSavingVmSettings ? "Saving..." : "Save VM settings"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

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
                  directly in the database-backed VM record.
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

      {editingLabStackId ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Lab stack
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    {editingLabStackId === "new" ? "Create lab stack" : `Edit ${labStackDraft.name}`}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-400">
                    Pick the VMs that belong to this lab and choose whether a gateway VM should be started first.
                  </p>
                </div>
                <Button variant="ghost" onClick={closeLabStackEditor}>
                  Close
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Lab id</span>
                  <input
                    value={labStackDraft.id}
                    disabled={editingLabStackId !== "new"}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, id: event.target.value }))
                    }
                    placeholder="blue-team"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Name</span>
                  <input
                    value={labStackDraft.name}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Blue Team"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Fire label</span>
                  <input
                    value={labStackDraft.fireLabel}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, fireLabel: event.target.value }))
                    }
                    placeholder="Fire Blue Team Lab"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Stop label</span>
                  <input
                    value={labStackDraft.stopLabel}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, stopLabel: event.target.value }))
                    }
                    placeholder="Stop Blue Team Lab"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2 lg:col-span-2">
                  <span className="text-sm text-slate-300">Description</span>
                  <textarea
                    value={labStackDraft.description}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Starts FG-VM if needed, then the selected lab VMs."
                    className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Tone</span>
                  <select
                    value={labStackDraft.tone}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({
                        ...current,
                        tone: event.target.value as LabStackTone,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    {LAB_TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Gateway VM</span>
                  <select
                    value={labStackDraft.gatewayVmId}
                    onChange={(event) =>
                      setLabStackDraft((current) => ({ ...current, gatewayVmId: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
                  >
                    <option value="">No gateway dependency</option>
                    {data.map((vm) => (
                      <option key={vm.id} value={vm.id}>
                        {vm.name} ({vm.id})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={labStackDraft.includeGatewayOnStart}
                  onChange={(event) =>
                    setLabStackDraft((current) => ({
                      ...current,
                      includeGatewayOnStart: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950"
                />
                <span>Start the gateway VM first when firing this lab stack.</span>
              </label>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">Stack members</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    These are the VMs that fire/stop with this lab. The gateway is controlled separately.
                  </p>
                </div>

                <div className="grid max-h-72 gap-2 overflow-y-auto pr-2 sm:grid-cols-2">
                  {data.map((vm) => (
                    <label
                      key={vm.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-300"
                    >
                      <span>
                        <span className="font-medium text-white">{vm.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{vm.id}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={labStackDraft.vmIds.includes(vm.id)}
                        onChange={() => toggleLabVm(vm.id)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-950"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {labStackError ? (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {labStackError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {editingLabStackId !== "new" ? (
                    <Button
                      variant="danger"
                      disabled={isDeletingLabStack}
                      onClick={() => void removeLabStack(editingLabStackId)}
                    >
                      {isDeletingLabStack ? "Deleting..." : "Delete lab stack"}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button variant="ghost" onClick={closeLabStackEditor}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isSavingLabStack}
                    onClick={() => void saveLabStack()}
                  >
                    {isSavingLabStack ? "Saving..." : "Save lab stack"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {stopLabPreset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Stop lab
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  {stopLabPreset.stopLabel}
                </h2>
                <p className="text-sm leading-6 text-slate-400">
                  {stopLabPreset.name} can optionally stop {stopLabPreset.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID} after the stack VMs shut down.
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeGatewayOnStop}
                    onChange={(event) => setIncludeGatewayOnStop(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950"
                  />
                  <span>
                    Also shut down <span className="text-white">{stopLabPreset.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID}</span> after the lab VMs stop.
                  </span>
                </label>
                <p className="text-xs text-amber-200/90">
                  If checked, the lab may lose internal communication and internet access until FG-VM is started again.
                </p>
                {includeGatewayOnStop ? (
                  <label className="flex items-start gap-3 border-t border-white/10 pt-3">
                    <input
                      type="checkbox"
                      checked={allowGatewayHardStopFallback}
                      onChange={(event) => setAllowGatewayHardStopFallback(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950"
                    />
                    <span>
                      If the soft shutdown fails, allow a <span className="text-rose-200">hard-stop fallback</span> for <span className="text-white">{stopLabPreset.gatewayVmId ?? CRITICAL_GATEWAY_VM_ID}</span>.
                    </span>
                  </label>
                ) : null}
                {includeGatewayOnStop && allowGatewayHardStopFallback ? (
                  <p className="text-xs text-rose-200/90">
                    Use this only when you intentionally accept the appliance risk. Soft stop stays the first attempt.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStopLabPreset(null);
                    setIncludeGatewayOnStop(false);
                    setAllowGatewayHardStopFallback(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={runningLabActionId !== null}
                  onClick={() => void runLabStop(stopLabPreset, includeGatewayOnStop)}
                >
                  {runningLabActionId === `stop:${stopLabPreset.id}` ? "Stopping..." : "Proceed"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {updateFeedVmId && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-5xl overflow-hidden border-white/10 bg-slate-950">
            <div className="flex max-h-[90vh] flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Security change feed
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    {updateFeed?.vmName ?? updateFeedVmId}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Review security-targeted package changes before you queue a rotation or patch run.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUpdateFeedVmId(null);
                    setUpdateFeed(null);
                    setUpdateFeedError("");
                  }}
                >
                  Close
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {loadingUpdateFeedFor === updateFeedVmId ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-sm text-slate-300">
                    Fetching package changes, kernel hints, and security candidates from the guest over SSH...
                  </div>
                ) : updateFeedError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-100">
                    {updateFeedError}
                  </div>
                ) : updateFeed ? (
                  <div className="space-y-6">
                    <div className="grid gap-3 md:grid-cols-4">
                      <StatCard label="Upgradable" value={updateFeed.totalUpgradable} tone="info" compact />
                      <StatCard label="Security" value={updateFeed.securityCandidateCount} tone="warning" compact />
                      <StatCard
                        label="Critical"
                        value={updateFeed.packages.filter((item) => item.critical && item.securityCandidate).length}
                        tone={updateFeed.packages.some((item) => item.critical && item.securityCandidate) ? "danger" : "neutral"}
                        compact
                      />
                      <StatCard
                        label="Reboot flag"
                        value={updateFeed.rebootRequired ? 1 : 0}
                        tone={updateFeed.rebootRequired ? "danger" : "success"}
                        compact
                      />
                    </div>

                    <Card className="border-white/10 bg-slate-900/70">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge label={updateFeed.osVersion ?? "OS unknown"} tone="info" />
                          <Badge label={`Kernel ${updateFeed.kernelVersion ?? "unknown"}`} tone="neutral" />
                          <Badge
                            label={updateFeed.rebootRequired ? "Reboot required" : "No reboot flag"}
                            tone={updateFeed.rebootRequired ? "danger" : "success"}
                          />
                          <Badge label={`Generated ${formatRelativeDate(updateFeed.generatedAt)}`} tone="neutral" />
                        </div>
                        <div className="space-y-2">
                          {updateFeed.highlights.map((highlight) => (
                            <p
                              key={highlight}
                              className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
                            >
                              {highlight}
                            </p>
                          ))}
                          {updateFeed.highlights.length === 0 ? (
                            <p className="text-sm text-slate-300">
                              No urgent highlights detected.
                            </p>
                          ) : null}
                        </div>
                        {updateFeed.sourceNotes.length > 0 ? (
                          <div className="space-y-2">
                            {updateFeed.sourceNotes.map((note) => (
                              <p key={note} className="text-xs text-slate-400">
                                {note}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </Card>

                    <Card className="border-white/10 bg-slate-900/70">
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                            Pending packages
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-white">
                            Security-aware upgrade preview
                          </h3>
                        </div>

                        <div className="space-y-3">
                          {updateFeed.packages.length > 0 ? (
                            updateFeed.packages.map((item) => (
                              <div
                                key={`${item.name}-${item.targetVersion ?? "next"}`}
                                className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">{item.name}</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {item.currentVersion ?? "unknown"} {"->"} {item.targetVersion ?? "unknown"}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {item.securityCandidate ? <Badge label="Security" tone="warning" /> : null}
                                    {item.critical ? <Badge label="Critical" tone="danger" /> : null}
                                    {item.kernelRelated ? <Badge label="Kernel" tone="danger" /> : null}
                                    {item.repository ? <Badge label={item.repository} tone="neutral" /> : null}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-300">
                              No pending package changes detected.
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      )}

      {rebootVmState ? (
        <div className="fixed inset-0 z-[106] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl border-white/10 bg-slate-950">
            {(() => {
              const vm = data.find((candidate) => candidate.id === rebootVmState.vmId) ?? null;

              if (!vm) {
                return (
                  <div className="space-y-4">
                    <p className="text-white">VM not found.</p>
                    <div className="flex justify-end">
                      <Button variant="ghost" onClick={() => setRebootVmState(null)}>
                        Close
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      Power action
                    </p>
                    <h2 className="text-2xl font-semibold text-white">
                      Reboot {vm.name}
                    </h2>
                    <p className="text-sm leading-6 text-slate-400">
                      {rebootVmState.source === "required"
                        ? "This VM is reporting a reboot requirement. Choose the reboot style that fits the current maintenance risk."
                        : "Use this when the VM is stuck, a service is wedged, or you want a clean restart without adding another always-visible button to the card."}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-white/10 bg-slate-900/70">
                      <div className="space-y-3">
                        <h3 className="text-base font-semibold text-white">Soft reboot</h3>
                        <p className="text-sm text-slate-400">
                          Uses VMware soft reset. This is the safer default when the guest is responsive.
                        </p>
                        <Button
                          disabled={isQueueingRebootFor === vm.id}
                          onClick={() => void queueVmReboot(vm, "soft")}
                        >
                          {isQueueingRebootFor === vm.id ? "Queueing..." : "Queue soft reboot"}
                        </Button>
                      </div>
                    </Card>

                    <Card className="border-white/10 bg-slate-900/70">
                      <div className="space-y-3">
                        <h3 className="text-base font-semibold text-white">Hard reset</h3>
                        <p className="text-sm text-slate-400">
                          Uses VMware hard reset. Prefer this only if the guest is hung or the soft path is not enough.
                        </p>
                        <Button
                          variant="danger"
                          disabled={isQueueingRebootFor === vm.id}
                          onClick={() => void queueVmReboot(vm, "hard")}
                        >
                          {isQueueingRebootFor === vm.id ? "Queueing..." : "Queue hard reset"}
                        </Button>
                      </div>
                    </Card>
                  </div>

                  <div className="flex justify-end">
                    <Button variant="ghost" onClick={() => setRebootVmState(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      ) : null}

      {selectedCyberStory ? (
        <div className="fixed inset-0 z-[107] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
          <Card className="w-full max-w-3xl border-white/10 bg-slate-950">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Cyber news story
                  </p>
                  <h2 className="text-2xl font-semibold text-white">
                    {selectedCyberStory.title}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {formatNewsRelative(selectedCyberStory.publishedAt)} · {selectedCyberStory.source}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedCyberStory(null)}>
                  Close
                </Button>
              </div>

              <Card className="border-white/10 bg-slate-900/70">
                <div className="space-y-4">
                  <p className="text-base leading-7 text-slate-200">
                    {selectedCyberStory.description ?? "No article summary was available in the feed, but you can open the source to read the full story."}
                  </p>

                  <div className="flex justify-end">
                    <a
                      href={selectedCyberStory.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                      <span>Visit source</span>
                    </a>
                  </div>
                </div>
              </Card>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  sparkline,
  compact = false,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "info" | "danger";
  sparkline?: number[];
  compact?: boolean;
}) {
  return (
    <Card
      className={`self-start border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.62))] ${
        compact ? "h-auto min-h-0 p-4" : "h-auto min-h-[8.75rem] p-4"
      }`}
    >
      <div className="flex flex-col gap-2.5">
        <div className="space-y-1">
          <div className="min-h-[2rem]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              {label}
            </p>
          </div>
          <div
            className={
              compact
                ? "text-[2rem] font-semibold leading-none text-white"
                : "text-[2.15rem] font-semibold leading-none text-white"
            }
          >
            {value}
          </div>
        </div>

        <div className="space-y-1.5">
          {sparkline && sparkline.length > 0 ? (
            <div className="flex h-4 items-end gap-1">
              {sparkline.map((point, index) => (
                <div
                  key={`${label}-${index}`}
                  className={`w-full rounded-full ${getSparkTrackTone(tone)}`}
                >
                  <div
                    className={`w-full rounded-full ${getSparkFillTone(tone)}`}
                    style={{ height: `${Math.max(point * 0.78, 16)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className={`h-[2px] rounded-full ${getStatTrackTone(tone)}`}>
            <div className={`h-full w-1/2 rounded-full ${getStatFillTone(tone)}`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function HeatRow({
  label,
  cells,
  emptyLabel,
}: {
  label: string;
  cells: number[];
  emptyLabel: string;
}) {
  const hasActivity = cells.some((value) => value > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-xs text-slate-500">
          {hasActivity ? "More glow means more recent fleet activity" : emptyLabel}
        </span>
      </div>
      <div className="grid grid-cols-12 gap-2">
        {cells.map((value, index) => (
          <div
            key={`${label}-${index}`}
            className={`h-6 rounded-xl border border-white/5 ${getHeatCellTone(value)}`}
          />
        ))}
      </div>
    </div>
  );
}

function CyberNewsRow({
  item,
  onOpen,
}: {
  item: CyberNewsItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 transition hover:border-cyan-400/30 hover:bg-slate-950"
    >
      <div className="space-y-2 text-left">
        <p className="text-base font-semibold leading-6 text-white">
          {item.title}
        </p>
        <p className="text-sm text-slate-400">
          {formatNewsRelative(item.publishedAt)} · {item.source}
        </p>
      </div>
    </button>
  );
}

function JobsLineChart({
  points,
}: {
  points: JobTrendPoint[];
}) {
  const chartData = useMemo<ChartData<"line">>(
    () => ({
      labels: points.map((point) => point.label.toUpperCase()),
      datasets: [
        {
          label: "Start",
          data: points.map((point) => point.start),
          borderColor: "#67E8F9",
          backgroundColor: "rgba(103,232,249,0.18)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Stop",
          data: points.map((point) => point.stop),
          borderColor: "#FBBF24",
          backgroundColor: "rgba(251,191,36,0.18)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Update",
          data: points.map((point) => point.update),
          borderColor: "#F472B6",
          backgroundColor: "rgba(244,114,182,0.18)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Other",
          data: points.map((point) => point.other),
          borderColor: "#94A3B8",
          backgroundColor: "rgba(148,163,184,0.18)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Total",
          data: points.map((point) => point.total),
          borderColor: "#2DD4BF",
          backgroundColor: "rgba(45,212,191,0.14)",
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          fill: true,
        },
      ],
    }),
    [points],
  );

  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            color: "#94a3b8",
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            padding: 18,
            font: {
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(2, 6, 23, 0.96)",
          borderColor: "rgba(148, 163, 184, 0.18)",
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
          displayColors: true,
          padding: 12,
          callbacks: {
            title(items) {
              return items[0]?.label ?? "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#64748b",
            font: {
              size: 11,
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#64748b",
            font: {
              size: 11,
            },
          },
          grid: {
            color: "rgba(148, 163, 184, 0.1)",
            drawBorder: false,
          },
          border: {
            display: false,
          },
        },
      },
      elements: {
        line: {
          capBezierPoints: true,
        },
      },
    }),
    [],
  );

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
      <div className="h-[19rem]">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

function TrafficLineChart({
  buckets,
}: {
  buckets: Array<{
    label: string;
    requests: number;
    inboundBytes: number;
    outboundBytes: number;
  }>;
}) {
  const chartData = useMemo<ChartData<"line">>(
    () => ({
      labels: buckets.map((bucket) => bucket.label.toUpperCase()),
      datasets: [
        {
          label: "Requests",
          data: buckets.map((bucket) => bucket.requests),
          borderColor: "#2DD4BF",
          backgroundColor: "rgba(45,212,191,0.16)",
          tension: 0.34,
          borderWidth: 2.5,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          yAxisID: "requests",
        },
        {
          label: "Inbound KB",
          data: buckets.map((bucket) => Number((bucket.inboundBytes / 1024).toFixed(2))),
          borderColor: "#67E8F9",
          backgroundColor: "rgba(103,232,249,0.14)",
          tension: 0.34,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          yAxisID: "kb",
        },
        {
          label: "Outbound KB",
          data: buckets.map((bucket) => Number((bucket.outboundBytes / 1024).toFixed(2))),
          borderColor: "#A78BFA",
          backgroundColor: "rgba(167,139,250,0.14)",
          tension: 0.34,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          yAxisID: "kb",
        },
      ],
    }),
    [buckets],
  );

  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            color: "#94a3b8",
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            padding: 18,
            font: {
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(2, 6, 23, 0.96)",
          borderColor: "rgba(148, 163, 184, 0.18)",
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#64748b",
            font: {
              size: 11,
            },
          },
          border: {
            display: false,
          },
        },
        requests: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#64748b",
            font: {
              size: 11,
            },
          },
          grid: {
            color: "rgba(148, 163, 184, 0.1)",
          },
          border: {
            display: false,
          },
        },
        kb: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          ticks: {
            color: "#64748b",
            font: {
              size: 11,
            },
            callback(value) {
              return `${value} KB`;
            },
          },
          grid: {
            drawOnChartArea: false,
          },
          border: {
            display: false,
          },
        },
      },
    }),
    [],
  );

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
      <div className="h-[17rem]">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
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

function PowerBadge({
  powerState,
  onClick,
}: {
  powerState: VmRecord["powerState"];
  onClick?: () => void;
}) {
  if (powerState === "ON") {
    return <Badge label="Running" tone="success" onClick={onClick} />;
  }

  if (powerState === "OFF") {
    return <Badge label="Powered off" tone="warning" onClick={onClick} />;
  }

  return <Badge label="Unknown" tone="danger" onClick={onClick} />;
}

type BrandLogoSize = "sm" | "lg";

function LogoStrip({ hints }: { hints: string[] }) {
  return (
    <div className="flex items-center">
      {hints.map((hint, index) => (
        <div
          key={`${hint}-${index}`}
          className={index === 0 ? "" : "-ml-2"}
        >
          <BrandLogo hint={hint} size="sm" />
        </div>
      ))}
    </div>
  );
}

function BrandLogo({
  hint,
  osFamily,
  size = "sm",
}: {
  hint: string;
  osFamily?: string | null;
  size?: BrandLogoSize;
}) {
  const [failed, setFailed] = useState(false);
  const meta = getBrandLogoMeta(hint, osFamily);
  const classes =
    size === "lg"
      ? "h-14 w-14 rounded-2xl"
      : "h-10 w-10 rounded-xl";

  if (!meta || failed) {
    return (
      <div
        className={`flex items-center justify-center border border-white/10 bg-slate-900/80 ${classes}`}
        title={meta?.label ?? hint}
      >
        <span className={size === "lg" ? "text-sm font-semibold text-slate-200" : "text-[10px] font-semibold text-slate-200"}>
          {getLogoFallbackLabel(hint)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center border border-white/10 bg-slate-950/80 p-2 ${classes}`}
      title={meta.label}
    >
      <img
        src={meta.src}
        alt={meta.label}
        className="h-full w-full object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function getBrandLogoMeta(hint: string, osFamily?: string | null) {
  const value = hint.toLowerCase();

  if (value.includes("fg-vm") || value.includes("fortigate")) {
    return {
      label: "Fortinet",
      src: "https://cdn.simpleicons.org/fortinet/EE3124",
    };
  }

  if (value.includes("wireguard")) {
    return {
      label: "WireGuard",
      src: "https://cdn.simpleicons.org/wireguard/88171A",
    };
  }

  if (value.includes("pihole") || value.includes("pi-hole")) {
    return {
      label: "Pi-hole",
      src: "https://upload.wikimedia.org/wikipedia/en/thumb/1/15/Pi-hole_vector_logo.svg/960px-Pi-hole_vector_logo.svg.png",
    };
  }

  if (value.includes("n8n")) {
    return {
      label: "n8n",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/N8n-logo-new.svg/1920px-N8n-logo-new.svg.png",
    };
  }

  if (value.includes("nextcloud")) {
    return {
      label: "Nextcloud",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Nextcloud_Logo.svg/1280px-Nextcloud_Logo.svg.png",
    };
  }

  if (value.includes("synology")) {
    return {
      label: "Synology",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Synology_Logo.svg/1920px-Synology_Logo.svg.png",
    };
  }

  if (value.includes("t-pot") || value.includes("tpot")) {
    return {
      label: "T-Pot",
      src: "https://raw.githubusercontent.com/telekom-security/tpotce/refs/heads/master/doc/tpotsocial.png",
    };
  }

  if (value.includes("dolibarr")) {
    return {
      label: "Dolibarr",
      src: "https://www.google.com/s2/favicons?domain=dolibarr.org&sz=128",
    };
  }

  if (value.includes("wazuh")) {
    return {
      label: "Wazuh",
      src: "https://www.google.com/s2/favicons?domain=wazuh.com&sz=128",
    };
  }

  if (value.includes("iris")) {
    return {
      label: "DFIR-IRIS",
      src: "https://n8niostorageaccount.blob.core.windows.net/n8nio-strapi-blobs-prod/assets/iris_dfir_52f74857fd.png",
    };
  }

  if (value.includes("misp")) {
    return {
      label: "MISP",
      src: "https://www.google.com/s2/favicons?domain=misp-project.org&sz=128",
    };
  }

  if (value.includes("kali")) {
    return {
      label: "Kali Linux",
      src: "https://www.google.com/s2/favicons?domain=kali.org&sz=128",
    };
  }

  if (value.includes("windows") || osFamily?.toLowerCase() === "windows") {
    return {
      label: "Windows",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Windows_logo_and_wordmark_-_2021.svg/1920px-Windows_logo_and_wordmark_-_2021.svg.png",
    };
  }

  if (value.includes("victim") || osFamily?.toLowerCase() === "ubuntu") {
    return {
      label: "Ubuntu",
      src: "https://cdn.simpleicons.org/ubuntu/E95420",
    };
  }

  return null;
}

function getLogoFallbackLabel(hint: string) {
  const cleaned = hint
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return cleaned || "VM";
}

function IconBase({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M14 5.5h4.5V10" />
      <path d="M10 14 18.5 5.5" />
      <path d="M18.5 13v4a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 7 5.5h4" />
    </IconBase>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M8 6.5v11l8-5.5-8-5.5Z" />
    </IconBase>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" />
    </IconBase>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="m6.5 8.5 3 3-3 3" />
      <path d="M11.5 15.5h6" />
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    </IconBase>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
      <path d="M4.5 13.25v-2.5l2-0.5c0.18-0.54 0.4-1.04 0.68-1.5L6 6.9l1.77-1.77 1.84 1.18c0.46-0.28 0.96-0.5 1.5-0.68l0.5-2h2.5l0.5 2c0.54 0.18 1.04 0.4 1.5 0.68l1.84-1.18L18 6.9l-1.18 1.84c0.28 0.46 0.5 0.96 0.68 1.5l2 0.5v2.5l-2 0.5c-0.18 0.54-0.4 1.04-0.68 1.5L18 17.1l-1.77 1.77-1.84-1.18c-0.46 0.28-0.96 0.5-1.5 0.68l-0.5 2h-2.5l-0.5-2c-0.54-0.18-1.04-0.4-1.5-0.68l-1.84 1.18L6 17.1l1.18-1.84a6.7 6.7 0 0 1-.68-1.5l-2-.5Z" />
    </IconBase>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4.5 19.5h4.25L19 9.25a2.12 2.12 0 0 0-3-3L5.75 16.5 4.5 19.5Z" />
      <path d="m14.5 7.75 1.75 1.75" />
    </IconBase>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M20 11a8 8 0 0 0-14.5-4.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5" />
      <path d="M20 20v-4.5h-4.5" />
    </IconBase>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 3.5 5.5 6v5.2c0 4.26 2.72 7.95 6.5 9.3 3.78-1.35 6.5-5.04 6.5-9.3V6L12 3.5Z" />
      <path d="m9.5 12 1.75 1.75L14.75 10" />
    </IconBase>
  );
}

function FeedIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M5 18.5a1.5 1.5 0 1 0 0.01 0" />
      <path d="M5 11.5a7 7 0 0 1 7 7" />
      <path d="M5 6.5c6.63 0 12 5.37 12 12" />
    </IconBase>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <IconBase className={`${className ?? ""} animate-spin`}>
      <path d="M12 4a8 8 0 1 1-5.66 2.34" />
    </IconBase>
  );
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

function formatNewsRelative(value: string) {
  const date = new Date(value);
  const deltaMs = Date.now() - date.getTime();

  if (deltaMs < 60_000) {
    return "about a minute ago";
  }

  if (deltaMs < 3_600_000) {
    return `about ${Math.max(1, Math.floor(deltaMs / 60_000))} min ago`;
  }

  if (deltaMs < 86_400_000) {
    return `about ${Math.floor(deltaMs / 3_600_000)} hour${deltaMs >= 7_200_000 ? "s" : ""} ago`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "2-digit",
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

function isWithinWindow(value: string | null | undefined, hours: number) {
  if (!value) {
    return false;
  }

  return Date.now() - new Date(value).getTime() <= hours * 3_600_000;
}

function isAptManagedOs(osFamily: string | null | undefined) {
  const normalized = osFamily?.trim().toLowerCase();
  return normalized === "ubuntu" || normalized === "debian" || normalized === "kali";
}

function isManagedUpdateOs(osFamily: string | null | undefined) {
  return isAptManagedOs(osFamily) || osFamily?.trim().toLowerCase() === "windows";
}

function inferOsFamilyFromVm(vm: VmRecord) {
  const explicitFamily = vm.osFamily?.trim().toLowerCase();
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

function isManagedUpdateVm(vm: VmRecord) {
  return isManagedUpdateOs(inferOsFamilyFromVm(vm));
}

function buildHourlyHeatmap(values: Array<string | null | undefined>, hours: number) {
  const cells = Array.from({ length: hours }, () => 0);
  const now = Date.now();

  values.forEach((value) => {
    if (!value) {
      return;
    }

    const deltaHours = Math.floor((now - new Date(value).getTime()) / 3_600_000);
    if (deltaHours < 0 || deltaHours >= hours) {
      return;
    }

    const bucketIndex = hours - 1 - deltaHours;
    cells[bucketIndex] += 1;
  });

  return normalizeHeatmap(cells);
}

function buildDailyHeatmap(values: Array<string | null | undefined>, days: number) {
  const cells = Array.from({ length: days }, () => 0);
  const now = Date.now();

  values.forEach((value) => {
    if (!value) {
      return;
    }

    const deltaDays = Math.floor((now - new Date(value).getTime()) / 86_400_000);
    if (deltaDays < 0 || deltaDays >= days) {
      return;
    }

    const bucketIndex = days - 1 - deltaDays;
    cells[bucketIndex] += 1;
  });

  return normalizeHeatmap(cells);
}

function normalizeHeatmap(cells: number[]) {
  const max = Math.max(...cells, 0);
  if (max === 0) {
    return cells;
  }

  return cells.map((value) => Math.ceil((value / max) * 4));
}

function getHeatCellTone(value: number) {
  if (value <= 0) {
    return "bg-slate-900/70";
  }

  if (value === 1) {
    return "bg-teal-500/20";
  }

  if (value === 2) {
    return "bg-teal-400/35";
  }

  if (value === 3) {
    return "bg-cyan-400/45";
  }

  return "bg-cyan-300/70";
}

function getStatTrackTone(tone: "neutral" | "success" | "warning" | "info" | "danger") {
  if (tone === "info") {
    return "bg-cyan-500/10";
  }

  if (tone === "success") {
    return "bg-emerald-500/10";
  }

  if (tone === "warning") {
    return "bg-amber-500/10";
  }

  if (tone === "danger") {
    return "bg-rose-500/10";
  }

  return "bg-white/5";
}

function getStatFillTone(tone: "neutral" | "success" | "warning" | "info" | "danger") {
  if (tone === "info") {
    return "bg-cyan-300";
  }

  if (tone === "success") {
    return "bg-emerald-300";
  }

  if (tone === "warning") {
    return "bg-amber-300";
  }

  if (tone === "danger") {
    return "bg-rose-300";
  }

  return "bg-slate-300";
}

function getSparkTrackTone(tone: "neutral" | "success" | "warning" | "info" | "danger") {
  if (tone === "info") {
    return "bg-cyan-500/8";
  }

  if (tone === "success") {
    return "bg-emerald-500/8";
  }

  if (tone === "warning") {
    return "bg-amber-500/8";
  }

  if (tone === "danger") {
    return "bg-rose-500/8";
  }

  return "bg-white/5";
}

function getSparkFillTone(tone: "neutral" | "success" | "warning" | "info" | "danger") {
  if (tone === "info") {
    return "bg-gradient-to-t from-cyan-400/55 to-cyan-300";
  }

  if (tone === "success") {
    return "bg-gradient-to-t from-emerald-400/55 to-emerald-300";
  }

  if (tone === "warning") {
    return "bg-gradient-to-t from-amber-400/55 to-amber-300";
  }

  if (tone === "danger") {
    return "bg-gradient-to-t from-rose-400/55 to-rose-300";
  }

  return "bg-gradient-to-t from-slate-400/40 to-slate-200";
}

function buildMetricSparkline(value: number, maxValue: number) {
  const ratio = maxValue <= 0 ? 0 : Math.min(Math.max(value / maxValue, 0), 1);
  const base = [0.24, 0.34, 0.48, 0.4, 0.58, 0.52, 0.68, 0.6];

  return base.map((seed, index) => {
    const scaled = 14 + ratio * 62 + seed * 18 + index * 1.5;
    return Math.min(100, Math.round(scaled));
  });
}

function buildJobTrend(
  jobs: Array<{ createdAt: string; type?: string }>,
  buckets: number,
) {
  const cells = Array.from({ length: buckets }, (_, index) => ({
    label: `${index}h`,
    start: 0,
    stop: 0,
    update: 0,
    other: 0,
    total: 0,
  }));
  const now = Date.now();

  jobs.forEach((job) => {
    const deltaHours = Math.floor((now - new Date(job.createdAt).getTime()) / 3_600_000);
    if (deltaHours < 0 || deltaHours >= buckets) {
      return;
    }

    const bucketIndex = buckets - 1 - deltaHours;
    const type = "type" in job && typeof job.type === "string" ? job.type : "";

    if (type === "VM_START") {
      cells[bucketIndex].start += 1;
    } else if (type === "VM_STOP") {
      cells[bucketIndex].stop += 1;
    } else if (type === "VM_OS_UPDATE") {
      cells[bucketIndex].update += 1;
    } else {
      cells[bucketIndex].other += 1;
    }

    cells[bucketIndex].total += 1;
  });

  return cells.map((cell, index) => ({
    label: index === cells.length - 1 ? "now" : `${buckets - 1 - index}h`,
    start: cell.start,
    stop: cell.stop,
    update: cell.update,
    other: cell.other,
    total: cell.total,
  }));
}
