import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  Clock,
  Play,
  Package,
  Truck,
  Trash2,
  ShieldAlert,
  Terminal,
  RefreshCw,
  Server,
  ArrowRight,
  Check,
  FolderOpen,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { resolveSelectedPipelineVersion, storeSelectedPipelineVersion } from "./pipelineVersion";

type PipelineRun = Record<string, any>;

const FETCH_PIPELINE_URL = "/admin-dashboard/data-pipeline/fetch-pipeline";
const RUN_ID_LOGS_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/runId-logs";

// Step Webhook URLs
const MOVE_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/move-data";
const CLEAN_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/clean-data";
const VERIFY_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/verify-data";
const PACK_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/packOffline";
const CREATE_HIERARCHY_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/create-heirachy";
const COPY_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/copy-data";

type StepKey = "move" | "copy" | "clean" | "verify" | "pack";
type StepStatus = "idle" | "running" | "completed" | "failed";

type StepInfo = {
  key: StepKey;
  label: string;
  description: string;
  icon: typeof Truck;
  webhookUrl: string;
  successKeywords: string[];
  failureKeywords: string[];
};

type ServerDetails = {
  id: string;
  serverName: string;
  name: string;
  environment: string;
  ipAddress: string;
  port: string;
  username: string;
};

type ServiceMoveConfig = {
  fromServer: string;
  toServer: string;
  customSourcePath: string;
  customTargetPath: string;
  overrideSource: boolean;
  overrideTarget: boolean;
};

const stepsConfig: StepInfo[] = [
  {
    key: "move",
    label: "Move Data",
    description: "Move generated files to target server",
    icon: Truck,
    webhookUrl: MOVE_DATA_WEBHOOK,
    successKeywords: ["All folders copied successfully"],
    failureKeywords: ["failed", "error", "Connection timed out", "permission denied"],
  },
  {
    key: "copy",
    label: "Copy Data",
    description: "Copy generated files to backup server",
    icon: Copy,
    webhookUrl: COPY_DATA_WEBHOOK,
    successKeywords: ["all data copied"],
    failureKeywords: ["failed", "error", "permission denied"],
  },
  {
    key: "clean",
    label: "Clean Data",
    description: "Clean moved database elements in target server",
    icon: Trash2,
    webhookUrl: CLEAN_DATA_WEBHOOK,
    successKeywords: ["all data cleaned"],
    failureKeywords: ["failed", "error", "permission denied"],
  },
  {
    key: "verify",
    label: "Verify Cleaned Data",
    description: "Run verification checks on cleaned OSM data",
    icon: CheckCircle2,
    webhookUrl: VERIFY_DATA_WEBHOOK,
    successKeywords: ["validation completed"],
    failureKeywords: ["failed", "error", "invalid data", "mismatch"],
  },
  {
    key: "pack",
    label: "Pack Data",
    description: "Compress and archive verified database outputs",
    icon: Package,
    webhookUrl: PACK_DATA_WEBHOOK,
    successKeywords: ["Packup completed"],
    failureKeywords: ["failed", "error", "disk full", "permission denied"],
  },
];

function extractPipelineRuns(payload: any): PipelineRun[] {
  const body = payload?.data ?? payload;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.pipeline)) return body.pipeline;
  if (Array.isArray(body?.pipelines)) return body.pipelines;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.runs)) return body.data.runs;
  if (Array.isArray(body?.runs)) return body.runs;
  return [];
}

function serviceStatus(run: PipelineRun | null, service: string) {
  if (!run) return "unknown";
  const data = run.services?.[service];
  return String(data?.status ?? run?.[`${service}Status`] ?? "").toLowerCase();
}

function getRunId(run: PipelineRun | null) {
  return String(run?.runId ?? run?._id ?? run?.id ?? "");
}

function toServerDetails(server: any): ServerDetails | null {
  if (!server) return null;
  return {
    id: String(server?._id ?? server?.id ?? ""),
    serverName: String(server?.name ?? server?.serverName ?? ""),
    name: String(server?.name ?? server?.serverName ?? ""),
    environment: String(server?.environment ?? ""),
    ipAddress: String(server?.ipAddress ?? server?.host ?? ""),
    port: String(server?.port ?? "22"),
    username: String(server?.username ?? server?.user ?? ""),
  };
}

function fallbackServerDetails(name: string): ServerDetails | null {
  if (!name) return null;
  return {
    id: "",
    serverName: name,
    name,
    environment: "",
    ipAddress: "",
    port: "",
    username: "",
  };
}

function getServerValue(server: any) {
  return String(server?._id ?? server?.id ?? server?.name ?? server?.host ?? "");
}

function getServerLabel(server: any) {
  const name = String(server?.name ?? server?.serverName ?? server?.host ?? server?.ipAddress ?? "Unnamed server");
  const environment = String(server?.environment ?? "");
  const ipAddress = String(server?.ipAddress ?? server?.host ?? "");
  return [name, environment, ipAddress].filter(Boolean).join(" - ");
}

function toServerConfigKey(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function MoveAndPack() {
  const [searchParams] = useSearchParams();
  const [currentVersion, setCurrentVersion] = useState("");
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard state
  const [activeStep, setActiveStep] = useState<StepKey>("move");
  const [stepStatuses, setStepStatuses] = useState<Record<StepKey, StepStatus>>({
    move: "idle",
    copy: "idle",
    clean: "idle",
    verify: "idle",
    pack: "idle",
  });
  const [terminalLogs, setTerminalLogs] = useState<Record<StepKey, string>>({
    move: "",
    copy: "",
    clean: "",
    verify: "",
    pack: "",
  });

  const [executing, setExecuting] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const runningStepKeyRef = useRef<StepKey | null>(null);

  const [availabilityServers, setAvailabilityServers] = useState<any[]>([]);
  const [selectedTargetServerId, setSelectedTargetServerId] = useState("");
  const [isTargetServerModalOpen, setIsTargetServerModalOpen] = useState(false);
  const [hasSelectedTargetServer, setHasSelectedTargetServer] = useState(false);
  const [createHierarchy, setCreateHierarchy] = useState(false);
  const [hierarchyPath, setHierarchyPath] = useState("");
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movePackConfigs, setMovePackConfigs] = useState<Record<string, any>>({});

  const [selectedServices, setSelectedServices] = useState<Record<string, boolean>>({});
  const [serviceConfigs, setServiceConfigs] = useState<Record<string, ServiceMoveConfig>>({});
  const [selectedServicesOrder, setSelectedServicesOrder] = useState<string[]>([]);

  // Refs for sequential move execution
  const moveQueueRef = useRef<any[]>([]);
  const currentMoveIndexRef = useRef<number>(-1);
  const moveAccumulatedLogRef = useRef<string>("");
  const runSingleMoveServiceRef = useRef<any>(null);

  const findAvailabilityServer = useCallback((serverIdOrName: string) => {
    if (!serverIdOrName) return null;
    return availabilityServers.find(
      (s) =>
        s.name === serverIdOrName ||
        s.host === serverIdOrName ||
        s.ipAddress === serverIdOrName ||
        s._id === serverIdOrName ||
        s.id === serverIdOrName
    ) ?? null;
  }, [availabilityServers]);

  const selectedTargetServer = useMemo(() => {
    return findAvailabilityServer(selectedTargetServerId);
  }, [findAvailabilityServer, selectedTargetServerId]);

  const selectedTargetServerDetails = useMemo(() => {
    return toServerDetails(selectedTargetServer);
  }, [selectedTargetServer]);

  const getMovePackConfigListForServer = useCallback((serverIdOrName: string) => {
    if (!serverIdOrName) return "";
    const srvObj = findAvailabilityServer(serverIdOrName);
    const lookupKeys = [
      serverIdOrName,
      toServerConfigKey(serverIdOrName),
      srvObj?._id,
      srvObj?.id,
      srvObj?.name,
      srvObj?.serverName,
      srvObj?.host,
      srvObj?.ipAddress,
      toServerConfigKey(srvObj?.name),
      toServerConfigKey(srvObj?.serverName),
      toServerConfigKey(srvObj?.host),
    ].filter(Boolean).map(String);

    for (const key of lookupKeys) {
      const configList = movePackConfigs[key];
      if (Array.isArray(configList) && configList.length > 0) return configList;
    }

    for (const configList of Object.values(movePackConfigs)) {
      if (!Array.isArray(configList)) continue;
      const match = configList.find((item: any) =>
        lookupKeys.includes(String(item?.targetServerId ?? "")) ||
        lookupKeys.includes(String(item?.serverId ?? ""))
      );
      if (match) return configList;
    }

    return "";
  }, [findAvailabilityServer, movePackConfigs]);

  const getMoveSourcePathForServer = useCallback((serverIdOrName: string) => {
    const configList = getMovePackConfigListForServer(serverIdOrName);
    if (Array.isArray(configList) && configList.length > 0) {
      return configList[0].moveSourcePath || "";
    }
    return "";
  }, [getMovePackConfigListForServer]);

  const getMoveTargetPathForServer = useCallback((serverIdOrName: string) => {
    const configList = getMovePackConfigListForServer(serverIdOrName);
    if (Array.isArray(configList) && configList.length > 0) {
      return configList[0].moveTargetPath || "";
    }
    return "";
  }, [getMovePackConfigListForServer]);

  const getCommonScriptPathForServer = useCallback((serverIdOrName: string) => {
    const configList = getMovePackConfigListForServer(serverIdOrName);
    if (Array.isArray(configList) && configList.length > 0) {
      return configList[0].commonScriptPath || "";
    }
    return "";
  }, [getMovePackConfigListForServer]);

  const getFirstConfiguredMoveTargetPath = useCallback(() => {
    for (const configList of Object.values(movePackConfigs)) {
      if (Array.isArray(configList) && configList.length > 0) {
        const moveTargetPath = String(configList[0]?.moveTargetPath || "").trim();
        if (moveTargetPath) return moveTargetPath;
      }
    }
    return "";
  }, [movePackConfigs]);

  const handleUpdateServiceConfig = (service: string, key: string, value: any) => {
    setServiceConfigs((prev) => {
      const current = prev[service] || {
        fromServer: "",
        toServer: "",
        customSourcePath: "",
        customTargetPath: "",
        overrideSource: false,
        overrideTarget: false,
      };
      
      const updated = { ...current, [key]: value };

      if (key === "fromServer") {
        const configuredSourcePath = getMoveSourcePathForServer(String(value));
        updated.overrideSource = false;
        updated.customSourcePath = configuredSourcePath;
      }
      if (key === "toServer") {
        const configuredTargetPath = getMoveTargetPathForServer(String(value));
        updated.overrideTarget = false;
        updated.customTargetPath = configuredTargetPath;
      }
      if (key === "customSourcePath") {
        updated.overrideSource = true;
      }
      if (key === "customTargetPath") {
        updated.overrideTarget = true;
      }

      return {
        ...prev,
        [service]: updated,
      };
    });
  };

  const isMoveConfigValid = useMemo(() => {
    const activeServices = Object.keys(selectedServices).filter((s) => selectedServices[s]);
    if (activeServices.length === 0) return false;

    return activeServices.every((srv) => {
      const config = serviceConfigs[srv];
      if (!config) return false;
      if (!config.fromServer || !selectedTargetServerDetails) return false;

      const dbSource = getMoveSourcePathForServer(config.fromServer);
      const finalSource = (dbSource && !config.overrideSource) ? dbSource : config.customSourcePath;
      if (!finalSource?.trim()) return false;

      const dbTarget =
        getMoveTargetPathForServer(selectedTargetServerId) ||
        getMoveTargetPathForServer(selectedTargetServerDetails.name);
      const finalTarget = (dbTarget && !config.overrideTarget) ? dbTarget : config.customTargetPath;
      if (!finalTarget?.trim()) return false;

      return true;
    });
  }, [
    selectedServices,
    serviceConfigs,
    selectedTargetServerDetails,
    selectedTargetServerId,
    getMoveSourcePathForServer,
    getMoveTargetPathForServer,
  ]);

  const runServices = useMemo(() => {
    if (!selectedRun) return [];
    const services = ["search", "tile", "tiles", "routing"];
    return services.filter((srv) => {
      const srvData = selectedRun.services?.[srv];
      return !!srvData;
    });
  }, [selectedRun]);

  const runServers = useMemo(() => {
    if (!selectedRun) return [];
    const servers = new Set<string>();
    const services = ["search", "tile", "tiles", "routing"];
    services.forEach((srv) => {
      const srvData = selectedRun.services?.[srv];
      if (srvData) {
        const sName = srvData.targetServer || srvData.server || srvData.serverName || srvData.targetServerName || "";
        if (sName) servers.add(sName);
      }
    });
    if (selectedRun.targetServer) servers.add(selectedRun.targetServer);
    if (selectedRun.server) servers.add(selectedRun.server);
    if (selectedRun.targetServerName) servers.add(selectedRun.targetServerName);
    if (selectedRun.serverName) servers.add(selectedRun.serverName);

    return Array.from(servers).filter(Boolean);
  }, [selectedRun]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      runningStepKeyRef.current = null;
    };
  }, []);

  const updateDBServiceStatus = async (stepKey: StepKey, status: "running" | "completed" | "failed") => {
    if (!selectedRun) return;
    try {
      const runId = getRunId(selectedRun);
      await api.patch("/admin-dashboard/data-pipeline/service-status", {
        runId,
        service: stepKey,
        status,
      });
    } catch (err) {
      console.error(`Failed to update DB service status to ${status} for step ${stepKey}`, err);
    }
  };

  const runSingleMoveService = async (
    param: {
      service: string;
      fromServer: string;
      toServer: string;
      sourceServer?: ServerDetails | null;
      targetServer?: ServerDetails | null;
      moveSourcePath: string;
      moveTargetPath: string;
    },
    index: number,
    queue: any[]
  ) => {
    if (!selectedRun) {
      toast.error("No run selected.");
      return;
    }
    const runId = getRunId(selectedRun);
    const routingService = selectedRun?.services?.routing ?? {};
    const runSId = routingService.sId || "";
    if (!runSId) {
      toast.error("sId is missing in the selected run.");
      return;
    }
    if (!selectedTargetServerDetails) {
      toast.error("Select a target server before running Move & Pack.");
      return;
    }

    setExecuting(true);
    setStepStatuses((prev) => ({ ...prev, move: "running" }));
    
    const serviceName = param.service;
    const stepSId = `${runSId}_move_${serviceName}`;
    const rPath = routingService.logPath || "";
    const lastSlash = rPath.lastIndexOf("/");
    const calculatedLogBasePath = lastSlash !== -1 ? rPath.substring(0, lastSlash) : "/home/gaaya/Projects/pipeline/logs";
    const stepLogPath = `${calculatedLogBasePath}/${stepSId}.log`;

    setTerminalLogs((prev) => {
      const existing = index === 0 ? "" : prev.move;
      return {
        ...prev,
        move: existing + `[SYSTEM] Triggering Move Data webhook for service: ${serviceName.toUpperCase()}...\n`,
      };
    });

    runningStepKeyRef.current = "move";

    try {
      // Trigger Webhook for this single service
      const bodyPayload = {
        [serviceName]: [
          {
            sourceServer: param.sourceServer,
            fromServer: param.fromServer,
            targetServer: param.targetServer,
            toServer: param.toServer,
            moveSourcePath: param.moveSourcePath,
            moveTargetPath: param.moveTargetPath,
            logPath: stepLogPath,
            sId: stepSId,
            runId,
            version: currentVersion,
            createHierarchy,
            hierarchyPath: createHierarchy ? hierarchyPath : undefined,
          },
        ],
      };

      const stepInfo = stepsConfig.find((s) => s.key === "move")!;
      const response = await fetch(stepInfo.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (!isMountedRef.current || runningStepKeyRef.current !== "move") return;

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      setTerminalLogs((prev) => ({
        ...prev,
        move: prev.move + `[SYSTEM] Webhook triggered for ${serviceName.toUpperCase()}. Starting backend log monitor...\n`,
      }));

      // Determine the target server for log streaming
      const streamTargetServer = param.toServer || selectedTargetServerDetails.name || selectedTargetServerDetails.ipAddress;

      // Initialize status as running in DB
      await updateDBServiceStatus("move", "running");

      // Call backend monitor-logs API
      await api.post("/admin-dashboard/data-pipeline/monitor-logs", {
        runId,
        service: "move",
        targetServer: streamTargetServer,
        sId: stepSId,
        offset: 0,
        logPath: stepLogPath,
        version: currentVersion,
      });

      toast.success(`Move for service ${serviceName.toUpperCase()} started.`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to run move for ${serviceName.toUpperCase()}.`;
      if (isMountedRef.current && runningStepKeyRef.current === "move") {
        setStepStatuses((prev) => ({ ...prev, move: "failed" }));
        setTerminalLogs((prev) => ({ ...prev, move: prev.move + `\n[SYSTEM ERROR] ${msg}\n` }));
        void updateDBServiceStatus("move", "failed");
        toast.error(msg);
        
        // Reset queue on failure
        currentMoveIndexRef.current = -1;
        moveQueueRef.current = [];
        moveAccumulatedLogRef.current = "";
      }
    } finally {
      if (isMountedRef.current) {
        setExecuting(false);
      }
    }
  };

  runSingleMoveServiceRef.current = runSingleMoveService;

  const fetchRunsData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const version = resolveSelectedPipelineVersion(searchParams);
      if (version) storeSelectedPipelineVersion(version);
      setCurrentVersion(version);

      const pipelineResponse = await api.get(FETCH_PIPELINE_URL, {
        params: version ? { version } : undefined,
      });

      const extracted = extractPipelineRuns(pipelineResponse.data);
      // Filter for completed/success runs (checking multipart or routing success)
      const completedRuns = extracted.filter((run) => {
        const mStatus = serviceStatus(run, "multipart");
        const rStatus = serviceStatus(run, "routing");
        return (
          mStatus === "completed" ||
          mStatus === "success" ||
          rStatus === "completed" ||
          rStatus === "success"
        );
      });

      // Sort completed runs to find the most recent one
      const sortedCompletedRuns = completedRuns.sort((left, right) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });

      const recentRun = sortedCompletedRuns[0] ?? null;
      setRuns(recentRun ? [recentRun] : []);
      setSelectedRun(recentRun);

      // Fetch availability servers
      try {
        const serversRes = await api.get("/admin-dashboard/servers");
        const serversList = serversRes.data?.data?.servers ?? serversRes.data?.data ?? serversRes.data ?? [];
        setAvailabilityServers(serversList);
      } catch (srvErr) {
        console.error("Failed to load availability servers", srvErr);
        setAvailabilityServers([]);
      }

      // Fetch Move & Pack configurations
      try {
        const movePackRes = await api.get("/admin-dashboard/pipeline-config/move-pack-path-config", {
          params: { version },
        });
        const fetchedConfigs = movePackRes.data?.data?.movePackPaths ?? movePackRes.data?.data ?? {};
        setMovePackConfigs(fetchedConfigs);
      } catch (pathErr) {
        console.error("Failed to load Move & Pack path configuration", pathErr);
        setMovePackConfigs({});
      }

      // Restore wizard status from selected/recent run
      if (recentRun) {
        const nextStatuses: Record<StepKey, StepStatus> = {
          move: "idle",
          copy: "idle",
          clean: "idle",
          verify: "idle",
          pack: "idle",
        };
        const nextLogs: Record<StepKey, string> = {
          move: "",
          copy: "",
          clean: "",
          verify: "",
          pack: "",
        };

        const keys: StepKey[] = ["move", "clean", "verify", "pack"];
        const runSId = recentRun.services?.routing?.sId || "";

        keys.forEach((k) => {
          if (k === "move" && currentMoveIndexRef.current !== -1) {
            const currentIndex = currentMoveIndexRef.current;
            const queue = moveQueueRef.current;
            const currentParam = queue[currentIndex];
            const currentServiceName = currentParam.service;
            const expectedSId = `${runSId}_move_${currentServiceName}`;

            const statusVal = recentRun.moveStatus;
            const rawStatus = String(statusVal || "").toLowerCase();
            const logVal = recentRun.moveLog ?? "";

            const dbSId = recentRun.moveSId;
            const isMatchingService = dbSId === expectedSId;

            if (isMatchingService && (rawStatus === "success" || rawStatus === "completed")) {
              const completedLog = logVal;
              const nextIndex = currentIndex + 1;
              const spacer = `\n[SYSTEM] Completed move for service: ${currentServiceName.toUpperCase()}\n--------------------------------------------------\n`;
              const accumulated = moveAccumulatedLogRef.current + completedLog + spacer;

              if (nextIndex < queue.length) {
                // Trigger the next service!
                moveAccumulatedLogRef.current = accumulated;
                currentMoveIndexRef.current = nextIndex;

                nextStatuses.move = "running";
                nextLogs.move = accumulated + `[SYSTEM] Starting next move for service: ${queue[nextIndex].service.toUpperCase()}...\n`;

                void runSingleMoveServiceRef.current?.(queue[nextIndex], nextIndex, queue);
              } else {
                // Entire queue completed successfully!
                currentMoveIndexRef.current = -1;
                moveQueueRef.current = [];
                moveAccumulatedLogRef.current = "";

                nextStatuses.move = "completed";
                nextLogs.move = accumulated;
              }
            } else if (isMatchingService && (rawStatus === "failed" || rawStatus === "error")) {
              currentMoveIndexRef.current = -1;
              moveQueueRef.current = [];
              moveAccumulatedLogRef.current = "";

              nextStatuses.move = "failed";
              nextLogs.move = moveAccumulatedLogRef.current + logVal + `\n[SYSTEM ERROR] Move failed for service: ${currentServiceName.toUpperCase()}\n`;
            } else {
              nextStatuses.move = "running";
              nextLogs.move = moveAccumulatedLogRef.current + logVal;
            }
          } else {
            const svcData = recentRun.services?.[k];
            const statusVal = svcData?.status ?? recentRun[`${k}Status` as keyof PipelineRun];
            const rawStatus = String(statusVal || "").toLowerCase();
            if (rawStatus === "success" || rawStatus === "completed") {
              nextStatuses[k] = "completed";
            } else if (rawStatus === "failed" || rawStatus === "error") {
              nextStatuses[k] = "failed";
            } else if (rawStatus === "running") {
              nextStatuses[k] = "running";
            }
            nextLogs[k] = svcData?.log ?? recentRun[`${k}Log` as keyof PipelineRun] ?? "";
          }
        });

        setStepStatuses(nextStatuses);
        setTerminalLogs(nextLogs);

        // Find first incomplete step as active step
        const firstActive = keys.find((k) => nextStatuses[k] !== "completed") || "move";
        setActiveStep(firstActive);
      } else {
        setStepStatuses({
          move: "idle",
          copy: "idle",
          clean: "idle",
          verify: "idle",
          pack: "idle",
        });
        setTerminalLogs({
          move: "",
          copy: "",
          clean: "",
          verify: "",
          pack: "",
        });
        setActiveStep("move");
      }
    } catch (error) {
      toast.error("Failed to load completed runs list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void fetchRunsData();
  }, [fetchRunsData]);

  useEffect(() => {
    if (!selectedRun || availabilityServers.length === 0 || hasSelectedTargetServer) return;
    setSelectedTargetServerId((current) => current || getServerValue(availabilityServers[0]));
    setIsTargetServerModalOpen(true);
  }, [availabilityServers, hasSelectedTargetServer, selectedRun]);

  useEffect(() => {
    if (!selectedTargetServerId) return;
    setServiceConfigs((prev) => {
      const next = Object.entries(prev).reduce<Record<string, ServiceMoveConfig>>((acc, [service, config]) => {
        const configuredTargetPath =
          selectedTargetServerDetails
            ? getMoveTargetPathForServer(selectedTargetServerId) || getMoveTargetPathForServer(selectedTargetServerDetails.name)
            : "";
        acc[service] = {
          ...config,
          toServer: selectedTargetServerId,
          customTargetPath: config.overrideTarget ? config.customTargetPath : configuredTargetPath,
        };
        return acc;
      }, {});
      return next;
    });
  }, [getMoveTargetPathForServer, selectedTargetServerDetails, selectedTargetServerId]);

  // Auto scroll logs console to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Poll backend run status while any step is running
  useEffect(() => {
    const isAnyRunning = Object.values(stepStatuses).some((status) => status === "running");
    if (!isAnyRunning) return;

    const intervalId = setInterval(() => {
      void fetchRunsData(true);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [stepStatuses, fetchRunsData]);

  // Extract base log directory and calculate target file path
  const routingService = useMemo(() => selectedRun?.services?.routing ?? {}, [selectedRun]);
  const targetServer = useMemo(() => {
    return routingService.targetServer || selectedRun?.targetServer || "";
  }, [routingService, selectedRun]);

  const sId = useMemo(() => routingService.sId || "", [routingService]);

  const logBasePath = useMemo(() => {
    const rPath = routingService.logPath || "";
    if (!rPath) return "/home/gaaya/Projects/pipeline/logs";
    const lastSlash = rPath.lastIndexOf("/");
    return lastSlash !== -1 ? rPath.substring(0, lastSlash) : "/home/gaaya/Projects/pipeline/logs";
  }, [routingService]);

  const handleRunStep = async (
    stepInfo: StepInfo,
    moveParamsArray?: {
      service: string;
      fromServer: string;
      toServer: string;
      sourceServer?: ServerDetails | null;
      targetServer?: ServerDetails | null;
      moveSourcePath: string;
      moveTargetPath: string;
    }[]
  ) => {
    const key = stepInfo.key;
    if (!selectedRun) {
      toast.error("No run selected.");
      return;
    }
    if (!sId) {
      toast.error("sId is missing in the selected run.");
      return;
    }
    if (!selectedTargetServerDetails) {
      toast.error("Select a target server before running Move & Pack.");
      setIsTargetServerModalOpen(true);
      return;
    }

    const activeServices = key === "move" && moveParamsArray
      ? moveParamsArray.map((p) => p.service)
      : runServices;

    setExecuting(true);
    setStepStatuses((prev) => ({ ...prev, [key]: "running" }));
    setTerminalLogs((prev) => ({ ...prev, [key]: `[SYSTEM] Triggering ${stepInfo.label} webhook...\n` }));
    runningStepKeyRef.current = key;

    const stepSId = `${sId}_${key}`;
    const stepLogPath = `${logBasePath}/${stepSId}.log`;

    try {
      // Trigger Webhook Directly from Frontend
      let bodyPayload: any;

      if (key === "move" && moveParamsArray) {
        const payloadObj: Record<string, any> = {};
        moveParamsArray.forEach((param) => {
          const serviceName = param.service;
          const serviceStepSId = `${sId}_${key}_${serviceName}`;
          const serviceStepLogPath = `${logBasePath}/${serviceStepSId}.log`;
          payloadObj[serviceName] = [
            {
              sourceServer: param.sourceServer,
              fromServer: param.fromServer,
              targetServer: param.targetServer,
              toServer: param.toServer,
              moveSourcePath: param.moveSourcePath,
              moveTargetPath: param.moveTargetPath,
              logPath: serviceStepLogPath,
              sId: serviceStepSId,
              runId: getRunId(selectedRun),
              version: currentVersion,
              createHierarchy,
              hierarchyPath: createHierarchy ? hierarchyPath : undefined,
            },
          ];
        });
        bodyPayload = payloadObj;
      } else {
        const moveTargetPath =
          getMoveTargetPathForServer(selectedTargetServerId) ||
          getMoveTargetPathForServer(selectedTargetServerDetails.name) ||
          getFirstConfiguredMoveTargetPath();
        if (!moveTargetPath) {
          throw new Error("Move target path is not configured for this pipeline version.");
        }

        bodyPayload = key === "pack"
          ? {
              targetServer: selectedTargetServerDetails,
              moveTargetPath,
              logPath: stepLogPath,
              version: currentVersion,
              sId: stepSId,
              runId: getRunId(selectedRun),
              createHierarchy,
              hierarchyPath: createHierarchy ? hierarchyPath : undefined,
            }
          : {
              targetServer: selectedTargetServerDetails,
              moveTargetPath,
              logPath: stepLogPath,
              sId: stepSId,
              runId: getRunId(selectedRun),
              createHierarchy,
              hierarchyPath: createHierarchy ? hierarchyPath : undefined,
            };
      }

      const response = await fetch(stepInfo.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (!isMountedRef.current || runningStepKeyRef.current !== key) return;

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      setTerminalLogs((prev) => ({ ...prev, [key]: prev[key] + `[SYSTEM] Webhook triggered. Starting backend log monitor...\n` }));

      // Determine the target server for log streaming
      let streamTargetServer = targetServer;
      if (key === "move" && moveParamsArray && moveParamsArray.length > 0) {
        streamTargetServer = moveParamsArray[0].toServer;
      } else if (selectedTargetServerDetails) {
        streamTargetServer = selectedTargetServerDetails.name || selectedTargetServerDetails.ipAddress;
      }

      // Initialize status as running in DB
      await updateDBServiceStatus(key, "running");

      // Call backend monitor-logs API
      if (key === "move" && moveParamsArray) {
        await Promise.all(
          moveParamsArray.map(async (param) => {
            const serviceName = param.service;
            const serviceStepSId = `${sId}_${key}_${serviceName}`;
            const serviceStepLogPath = `${logBasePath}/${serviceStepSId}.log`;
            const paramTargetServer = param.toServer || targetServer || (selectedTargetServerDetails ? selectedTargetServerDetails.name || selectedTargetServerDetails.ipAddress : "");

            await api.post("/admin-dashboard/data-pipeline/monitor-logs", {
              runId: getRunId(selectedRun),
              service: key, // "move"
              targetServer: paramTargetServer,
              sId: serviceStepSId,
              offset: 0,
              logPath: serviceStepLogPath,
              version: currentVersion,
            });
          })
        );
      } else {
        await api.post("/admin-dashboard/data-pipeline/monitor-logs", {
          runId: getRunId(selectedRun),
          service: key, // "clean", "verify", "pack"
          targetServer: streamTargetServer,
          sId: stepSId,
          offset: 0,
          logPath: stepLogPath,
          version: currentVersion,
        });
      }

      toast.success(`${stepInfo.label} started. Log monitoring is active in the backend.`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to run step.";
      if (isMountedRef.current && runningStepKeyRef.current === key) {
        setStepStatuses((prev) => ({ ...prev, [key]: "failed" }));
        setTerminalLogs((prev) => ({ ...prev, [key]: prev[key] + `\n[SYSTEM ERROR] ${msg}\n` }));
        void updateDBServiceStatus(key, "failed");
        toast.error(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setExecuting(false);
        if (runningStepKeyRef.current === key) {
          runningStepKeyRef.current = null;
        }
      }
    }
  };

  const forceMarkCompleted = (key: StepKey) => {
    if (runningStepKeyRef.current === key) {
      runningStepKeyRef.current = null;
    }
    setStepStatuses((prev) => ({ ...prev, [key]: "completed" }));
    void updateDBServiceStatus(key, "completed");
    toast.success(`${key.toUpperCase()} step marked completed manually.`);
    const currentIndex = stepsConfig.findIndex((s) => s.key === key);
    if (currentIndex < stepsConfig.length - 1) {
      setActiveStep(stepsConfig[currentIndex + 1].key);
    }
  };

  const onRunStepClick = (step: StepInfo) => {
    if (!selectedTargetServerDetails) {
      toast.error("Select a target server before running this step.");
      setIsTargetServerModalOpen(true);
      return;
    }
 
    if (step.key === "move") {
      const newSelected: Record<string, boolean> = {};
      const newConfigs: Record<string, ServiceMoveConfig> = {};
      const order: string[] = [];
 
      runServices.forEach((srv) => {
        newSelected[srv] = true;
        order.push(srv);
 
        const srvData = selectedRun?.services?.[srv];
        const defaultFromServer = srvData?.targetServer || srvData?.server || srvData?.serverName || srvData?.targetServerName || runServers[0] || "";
        const defaultToServer = selectedTargetServerId || getServerValue(availabilityServers[0]);
        const configuredSourcePath = getMoveSourcePathForServer(defaultFromServer);
        const configuredTargetPath =
          selectedTargetServerDetails
            ? getMoveTargetPathForServer(defaultToServer) || getMoveTargetPathForServer(selectedTargetServerDetails.name)
            : "";
 
        newConfigs[srv] = {
          fromServer: defaultFromServer,
          toServer: defaultToServer,
          customSourcePath: configuredSourcePath,
          customTargetPath: configuredTargetPath,
          overrideSource: false,
          overrideTarget: false,
        };
      });
 
      setSelectedServices(newSelected);
      setSelectedServicesOrder(order);
      setServiceConfigs(newConfigs);
      setIsMoveModalOpen(true);
    } else {
      void handleRunStep(step);
    }
  };

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "failed":
        return "border-destructive/20 bg-destructive/10 text-destructive";
      case "running":
        return "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse";
      default:
        return "border-muted-foreground/20 bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading completed runs data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-base font-semibold leading-tight flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Move & Pack
          </h2>
          <p className="text-xs text-muted-foreground">
            Move, clean, verify, and compress completed generation outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentVersion ? (
            <Badge variant="outline" className="font-mono">
              Version {currentVersion}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchRunsData(true)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <main className="mx-auto max-w-6xl space-y-4">
          {runs.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center space-y-3">
                <ShieldAlert className="h-10 w-10 text-muted-foreground animate-bounce" />
                <div>
                  No completed generation run is available for version{" "}
                  <span className="font-mono font-medium text-foreground">{currentVersion || "any"}</span>.
                </div>
                <p className="text-xs max-w-md">
                  A multipart routing run must finish successfully (status success/completed) to enable move & pack operations.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Active Completed Generation Run Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Active Completed Generation Run</CardTitle>
                  <CardDescription>Only the most recently completed run can be processed for move & pack.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2.5 px-3 py-1.5 border border-border bg-muted/30 rounded-xl text-sm font-medium">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                    <span className="font-mono">{getRunId(selectedRun)}</span>
                    <span className="text-xs text-muted-foreground border-l border-border pl-2.5">{new Date(selectedRun?.createdAt || 0).toLocaleString()}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Server className="h-3.5 w-3.5" />
                      Server: <span className="font-mono text-foreground font-medium">{targetServer || "-"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 ml-2">
                      <Terminal className="h-3.5 w-3.5" />
                      sId: <span className="font-mono text-foreground font-medium">{sId || "-"}</span>
                    </span>
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                    <Server className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Selected target:</span>
                    <span className="font-semibold text-foreground">
                      {selectedTargetServerDetails
                        ? `${selectedTargetServerDetails.name} (${selectedTargetServerDetails.environment || "environment n/a"})`
                        : "Not selected"}
                    </span>
                    {selectedTargetServerDetails?.ipAddress ? (
                      <span className="font-mono text-muted-foreground">{selectedTargetServerDetails.ipAddress}:{selectedTargetServerDetails.port}</span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setIsTargetServerModalOpen(true)}
                    >
                      Change
                    </Button>
                  </div>

                  {createHierarchy && hierarchyPath ? (
                    <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                      <span className="text-muted-foreground">Hierarchy:</span>
                      <span className="font-mono text-foreground font-semibold">{hierarchyPath}</span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Wizard Steps */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Stepper Card */}
                <Card className="lg:col-span-1 border-border/80">
                  <CardHeader className="border-b border-border/50 bg-muted/10">
                    <CardTitle className="text-base">Operations Pipeline</CardTitle>
                    <CardDescription>Execute steps sequentially</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="relative pl-6 border-l border-border/70 space-y-6">
                      {stepsConfig.map((step, idx) => {
                        const StepIcon = step.icon;
                        const status = stepStatuses[step.key];
                        const isActive = activeStep === step.key;
                        const canExecute = status !== "completed" && status !== "running" && (idx === 0 || stepStatuses[stepsConfig[idx - 1].key] === "completed");

                        return (
                          <div key={step.key} className="relative">
                            {/* Bullet icon */}
                            <span className={`absolute -left-[37px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                              status === "completed"
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : status === "running"
                                ? "bg-sky-500 border-sky-500 text-white animate-pulse"
                                : status === "failed"
                                ? "bg-destructive border-destructive text-white"
                                : isActive
                                ? "bg-primary border-primary text-white"
                                : "bg-card border-border text-muted-foreground"
                            }`}>
                              {status === "completed" ? <Check className="h-3 w-3" /> : idx + 1}
                            </span>

                            <div className="space-y-2">
                              <div>
                                <h4 className={`text-sm font-semibold flex items-center gap-1.5 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                                  <StepIcon className="h-4 w-4 shrink-0" />
                                  {step.label}
                                </h4>
                                <p className="text-xs text-muted-foreground">{step.description}</p>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <Badge variant="outline" className={`${getStatusColor(status)} text-[10px] font-mono px-2 py-0.5`}>
                                  {status.toUpperCase()}
                                </Badge>

                                {canExecute && (
                                  <Button
                                    size="sm"
                                    className="h-7 px-2.5 text-xs gap-1"
                                    onClick={() => onRunStepClick(step)}
                                    disabled={executing}
                                  >
                                    <Play className="h-3 w-3 fill-current" />
                                    Run Step
                                  </Button>
                                )}

                                {status === "running" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-muted-foreground text-xs hover:text-foreground"
                                    onClick={() => forceMarkCompleted(step.key)}
                                  >
                                    Bypass
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Console logs Card */}
                <Card className="lg:col-span-2 border-border/80 overflow-hidden flex flex-col h-[520px]">
                  <CardHeader className="border-b border-border/50 bg-slate-900 text-slate-100 flex flex-row items-center justify-between py-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      <CardTitle className="text-sm font-mono text-slate-200">
                        Execution Console - {stepsConfig.find((s) => s.key === activeStep)?.label}
                      </CardTitle>
                    </div>
                    {stepStatuses[activeStep] === "running" && (
                      <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-400 animate-pulse text-[10px]">
                        Streaming logs
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 bg-slate-950 overflow-auto p-4 font-mono text-xs leading-6 text-slate-300 select-text">
                    <pre className="whitespace-pre-wrap break-words">
                      {terminalLogs[activeStep] || `Select step on the left and click 'Run Step' to start execution.`}
                    </pre>
                    <div ref={logEndRef} />
                  </CardContent>
                </Card>
              </div>

              {/* Target Server Selection Dialog */}
              {isTargetServerModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                  <div
                    className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => {
                      if (hasSelectedTargetServer) setIsTargetServerModalOpen(false);
                    }}
                  />

                  <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                          <Server className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">Select Target Server</h3>
                          <p className="text-xs text-muted-foreground">This server will be sent with cleanup, verify, and pack payloads.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Server</label>
                        <select
                          value={selectedTargetServerId}
                          onChange={(event) => setSelectedTargetServerId(event.target.value)}
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                        >
                          {availabilityServers.map((server) => {
                            const value = getServerValue(server);
                            return (
                              <option key={value} value={value}>
                                {getServerLabel(server)}
                              </option>
                            );
                          })}
                          {availabilityServers.length === 0 && <option value="">No servers available</option>}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="createHierarchy"
                          checked={createHierarchy}
                          onChange={(e) => setCreateHierarchy(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                        />
                        <label htmlFor="createHierarchy" className="text-xs font-semibold text-foreground cursor-pointer select-none">
                          Create Hierarchy?
                        </label>
                      </div>

                      {createHierarchy && (
                        <div className="space-y-1.5 animate-in fade-in duration-200">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hierarchy Path</label>
                          <input
                            type="text"
                            value={hierarchyPath}
                            onChange={(e) => setHierarchyPath(e.target.value)}
                            placeholder="e.g. /home/mkandula/Projects/TileGen/Gen"
                            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                          />
                        </div>
                      )}

                      {selectedTargetServerDetails ? (
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/60 p-3 text-xs">
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground">Name</p>
                            <p className="font-semibold text-foreground">{selectedTargetServerDetails.name || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground">Environment</p>
                            <p className="font-semibold text-foreground">{selectedTargetServerDetails.environment || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground">Username</p>
                            <p className="font-mono text-foreground">{selectedTargetServerDetails.username || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-muted-foreground">Port</p>
                            <p className="font-mono text-foreground">{selectedTargetServerDetails.port || "-"}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] uppercase text-muted-foreground">IP Address</p>
                            <p className="font-mono text-foreground">{selectedTargetServerDetails.ipAddress || "-"}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                          No server details are available.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 border-t border-border bg-muted/10 px-6 py-4">
                      <Button
                        className="flex-1 rounded-xl font-bold"
                        disabled={!selectedTargetServerDetails || (createHierarchy && !hierarchyPath.trim())}
                        onClick={() => {
                          setHasSelectedTargetServer(true);
                          setIsTargetServerModalOpen(false);

                          if (createHierarchy && hierarchyPath?.trim()) {
                            const promise = fetch(CREATE_HIERARCHY_WEBHOOK, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                targetServer: selectedTargetServerDetails,
                                hierarchyPath: hierarchyPath.trim(),
                                runId: getRunId(selectedRun),
                                version: currentVersion,
                                commonScriptPath: getCommonScriptPathForServer(selectedTargetServerId) || (selectedTargetServerDetails ? getCommonScriptPathForServer(selectedTargetServerDetails.name) : ""),
                              }),
                            }).then(async (res) => {
                              if (!res.ok) {
                                const errText = await res.text();
                                throw new Error(errText || `Server responded with ${res.status}`);
                              }
                              return res.text();
                            });

                            toast.promise(promise, {
                              loading: "Triggering directory hierarchy creation...",
                              success: "Directory hierarchy creation triggered successfully.",
                              error: (err) => `Failed to create hierarchy: ${err.message}`,
                            });
                          }
                        }}
                      >
                        Confirm Server
                      </Button>
                      {hasSelectedTargetServer ? (
                        <button
                          className="rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-secondary-foreground transition-all hover:bg-secondary/80"
                          onClick={() => setIsTargetServerModalOpen(false)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Move Configuration Dialog/Modal */}
              {isMoveModalOpen && selectedRun && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  {/* Backdrop */}
                  <div className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsMoveModalOpen(false)} />
                  
                  {/* Modal Container */}
                  <div className="relative bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-sm">Configure Move Parameters</h3>
                          <p className="text-[10px] text-muted-foreground font-mono">Run ID: {getRunId(selectedRun).slice(-8)}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsMoveModalOpen(false)} 
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Form Fields */}
                    <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
                      <div className="text-xs text-muted-foreground">
                        Select the services you want to move and configure their source/destination servers and paths.
                      </div>

                      {runServices.map((srv) => {
                        const isSelected = !!selectedServices[srv];
                        const config = serviceConfigs[srv] || {
                          fromServer: "",
                          toServer: "",
                          customSourcePath: "",
                          customTargetPath: "",
                          overrideSource: false,
                          overrideTarget: false,
                        };

                        const dbSourcePath = getMoveSourcePathForServer(config.fromServer);
                        const dbTargetPath =
                          selectedTargetServerDetails
                            ? getMoveTargetPathForServer(selectedTargetServerId) || getMoveTargetPathForServer(selectedTargetServerDetails.name)
                            : "";
                        const sourceServerDetails = toServerDetails(findAvailabilityServer(config.fromServer));
                        const sourceServerName = sourceServerDetails?.name || config.fromServer || "-";

                        return (
                          <div key={srv} className={`border rounded-2xl p-4 transition-all duration-200 ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card opacity-60"}`}>
                            {/* Service Toggle Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-border/40 mb-3">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedServices((prev) => ({ ...prev, [srv]: checked }));
                                    if (checked) {
                                      setSelectedServicesOrder((prev) => [...prev.filter((x) => x !== srv), srv]);
                                    } else {
                                      setSelectedServicesOrder((prev) => prev.filter((x) => x !== srv));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                                />
                                <span className="text-sm font-bold text-foreground tracking-wide uppercase">{srv}</span>
                              </label>
                              <Badge variant="outline" className={isSelected ? "bg-primary/10 text-primary font-semibold" : "bg-muted text-muted-foreground"}>
                                {isSelected ? `Active (Run #${selectedServicesOrder.indexOf(srv) + 1})` : "Skipped"}
                              </Badge>
                            </div>

                            {isSelected && (
                              <div className="space-y-4 animate-in fade-in duration-200">
                                {/* Servers Dropdowns Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                  {/* From Server */}
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">From Server</label>
                                    <div className="w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                                      {sourceServerName}
                                    </div>
                                  </div>

                                  {/* To Server */}
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">To Server</label>
                                    <div className="w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                                      {selectedTargetServerDetails
                                        ? selectedTargetServerDetails.name
                                        : "Select target server"}
                                    </div>
                                  </div>
                                </div>

                                {/* Source Path Section */}
                                <div className="space-y-1 bg-background/50 p-2.5 rounded-xl border border-border/40">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Source Path</label>
                                  <div className="space-y-1.5 mt-1">
                                    <input
                                      type="text"
                                      value={config.customSourcePath || dbSourcePath || ""}
                                      onChange={(e) => handleUpdateServiceConfig(srv, "customSourcePath", e.target.value)}
                                      placeholder="Enter Move Source Path"
                                      className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-primary outline-none"
                                      required
                                    />
                                    {dbSourcePath ? (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-muted-foreground font-semibold">
                                          {config.overrideSource ? "Custom override" : "Auto-filled from Move & Pack config"}
                                        </span>
                                        {config.overrideSource ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setServiceConfigs((prev) => ({
                                                ...prev,
                                                [srv]: {
                                                  ...config,
                                                  customSourcePath: dbSourcePath,
                                                  overrideSource: false,
                                                },
                                              }))
                                            }
                                            className="text-[9px] text-muted-foreground hover:text-foreground hover:underline"
                                          >
                                            Reset to Config
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="text-[9px] text-muted-foreground">No configured source path found for this server.</div>
                                    )}
                                  </div>
                                </div>

                                {/* Target Path Section */}
                                <div className="space-y-1 bg-background/50 p-2.5 rounded-xl border border-border/40">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Target Path</label>
                                  <div className="space-y-1.5 mt-1">
                                    <input
                                      type="text"
                                      value={config.customTargetPath || dbTargetPath || ""}
                                      onChange={(e) => handleUpdateServiceConfig(srv, "customTargetPath", e.target.value)}
                                      placeholder="Enter Move Target Path"
                                      className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-primary outline-none"
                                      required
                                    />
                                    {dbTargetPath ? (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-muted-foreground font-semibold">
                                          {config.overrideTarget ? "Custom override" : "Auto-filled from Move & Pack config"}
                                        </span>
                                        {config.overrideTarget ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setServiceConfigs((prev) => ({
                                                ...prev,
                                                [srv]: {
                                                  ...config,
                                                  customTargetPath: dbTargetPath,
                                                  overrideTarget: false,
                                                },
                                              }))
                                            }
                                            className="text-[9px] text-muted-foreground hover:text-foreground hover:underline"
                                          >
                                            Reset to Config
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="text-[9px] text-muted-foreground">No configured target path found for this server.</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Buttons */}
                    <div className="px-6 py-4 border-t border-border bg-muted/10 flex gap-3 flex-shrink-0">
                      <Button
                        className="flex-1 font-bold rounded-xl"
                        onClick={() => {
                          const activeServices = selectedServicesOrder.filter((s) => selectedServices[s]);
                          const moveParams = activeServices.map((srv) => {
                            const config = serviceConfigs[srv];
                            const dbSource = getMoveSourcePathForServer(config.fromServer);
                            const dbTarget =
                              selectedTargetServerDetails
                                ? getMoveTargetPathForServer(selectedTargetServerId) || getMoveTargetPathForServer(selectedTargetServerDetails.name)
                                : "";
                            const fromServer = findAvailabilityServer(config.fromServer);
                            const sourceServerDetails = toServerDetails(fromServer) ?? fallbackServerDetails(config.fromServer);
                            const targetServerDetails = selectedTargetServerDetails;
                            
                            return {
                              service: srv,
                              fromServer: config.fromServer,
                              toServer: targetServerDetails?.name || selectedTargetServerId,
                              sourceServer: sourceServerDetails,
                              targetServer: targetServerDetails,
                              moveSourcePath: (dbSource && !config.overrideSource) ? dbSource : config.customSourcePath,
                              moveTargetPath: (dbTarget && !config.overrideTarget) ? dbTarget : config.customTargetPath,
                            };
                          });

                          setIsMoveModalOpen(false);
                          
                          if (moveParams.length > 0) {
                            const stepInfo = stepsConfig.find((s) => s.key === "move")!;
                            void handleRunStep(stepInfo, moveParams);
                          } else {
                            toast.error("No active services selected to move.");
                          }
                        }}
                        disabled={!isMoveConfigValid}
                      >
                        Confirm & Run Move
                      </Button>
                      <button
                        className="px-4 py-2.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-xl hover:bg-secondary/80 transition-all"
                        onClick={() => setIsMoveModalOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
