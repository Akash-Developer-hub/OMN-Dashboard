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
  ChevronDown,
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
const PACK_DATA_WEBHOOK = "https://sandbox.vmmaps.com/n8n/webhook/omn/pack-data";

type StepKey = "move" | "clean" | "verify" | "pack";
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

const stepsConfig: StepInfo[] = [
  {
    key: "move",
    label: "Move Data",
    description: "Move generated files to target server",
    icon: Truck,
    webhookUrl: MOVE_DATA_WEBHOOK,
    successKeywords: ["Move complete", "files moved successfully", "completed successfully", "All countries have been processed successfully"],
    failureKeywords: ["failed", "error", "Connection timed out", "permission denied"],
  },
  {
    key: "clean",
    label: "Clean Data",
    description: "Clean moved database elements in target server",
    icon: Trash2,
    webhookUrl: CLEAN_DATA_WEBHOOK,
    successKeywords: ["Clean complete", "successfully cleaned", "completed successfully"],
    failureKeywords: ["failed", "error", "permission denied"],
  },
  {
    key: "verify",
    label: "Verify Cleaned Data",
    description: "Run verification checks on cleaned OSM data",
    icon: CheckCircle2,
    webhookUrl: VERIFY_DATA_WEBHOOK,
    successKeywords: ["Verification complete", "successfully verified", "completed successfully", "Verification success"],
    failureKeywords: ["failed", "error", "invalid data", "mismatch"],
  },
  {
    key: "pack",
    label: "Pack Data",
    description: "Compress and archive verified database outputs",
    icon: Package,
    webhookUrl: PACK_DATA_WEBHOOK,
    successKeywords: ["Pack complete", "successfully packed", "completed successfully", "archived successfully"],
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
    clean: "idle",
    verify: "idle",
    pack: "idle",
  });
  const [terminalLogs, setTerminalLogs] = useState<Record<StepKey, string>>({
    move: "",
    clean: "",
    verify: "",
    pack: "",
  });

  const [executing, setExecuting] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

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
      // Filter for completed/success multipart runs (checking routing service status)
      const completedRuns = extracted.filter((run) => {
        const rStatus = serviceStatus(run, "routing");
        return rStatus === "completed" || rStatus === "success";
      });

      setRuns(completedRuns);
      if (completedRuns.length > 0) {
        setSelectedRun(completedRuns[0]);
      } else {
        setSelectedRun(null);
      }

      // Reset wizard status
      setStepStatuses({
        move: "idle",
        clean: "idle",
        verify: "idle",
        pack: "idle",
      });
      setTerminalLogs({
        move: "",
        clean: "",
        verify: "",
        pack: "",
      });
      setActiveStep("move");
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

  // Auto scroll logs console to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

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

  const handleRunStep = async (stepInfo: StepInfo) => {
    const key = stepInfo.key;
    if (!selectedRun) {
      toast.error("No run selected.");
      return;
    }
    if (!targetServer || !sId) {
      toast.error("Target server or sId is missing in the selected run.");
      return;
    }

    setExecuting(true);
    setStepStatuses((prev) => ({ ...prev, [key]: "running" }));
    setTerminalLogs((prev) => ({ ...prev, [key]: `[SYSTEM] Triggering ${stepInfo.label} webhook...\n` }));

    const stepSId = `${sId}_${key}`;
    const stepLogPath = `${logBasePath}/${stepSId}.log`;

    try {
      // Trigger Webhook Directly from Frontend
      const response = await fetch(stepInfo.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetServer,
          sId: stepSId,
          logPath: stepLogPath,
          runId: getRunId(selectedRun),
          version: currentVersion,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      setTerminalLogs((prev) => ({ ...prev, [key]: prev[key] + `[SYSTEM] Webhook triggered. Starting log stream...\n` }));

      // Poll Logs in Frontend
      let offset = 0;
      let complete = false;
      let attempts = 0;
      const maxAttempts = 600; // 30 mins max

      while (!complete && attempts < maxAttempts) {
        attempts++;
        try {
          const logRes = await fetch(RUN_ID_LOGS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetServer,
              sId: stepSId,
              offset,
              logPath: stepLogPath,
            }),
          });

          if (logRes.ok) {
            const data = await logRes.json();
            const body = data?.data ?? data;
            const lines: string[] = Array.isArray(body?.logs)
              ? body.logs.map((l: any) => l?.message || l?.line || l?.log || String(l))
              : Array.isArray(body)
              ? body.map((l: any) => l?.message || l?.line || l?.log || String(l))
              : typeof body?.log === "string"
              ? body.log.split("\n")
              : typeof body === "string"
              ? body.split("\n")
              : [];

            if (lines.length > 0) {
              const cleanedLines = lines.map((l) => l.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim()).filter(Boolean);
              if (cleanedLines.length > 0) {
                setTerminalLogs((prev) => ({
                  ...prev,
                  [key]: prev[key] + cleanedLines.join("\n") + "\n",
                }));
              }
            }

            const nextOffset = Number(body?.newOffset ?? body?.offset);
            if (Number.isFinite(nextOffset)) {
              offset = nextOffset;
            } else {
              offset += lines.length;
            }

            const isN8NComplete = body?.completed === true || body?.complete === true || body?.done === true;
            
            // Check success / failure keywords
            const currentLogText = terminalLogs[key] + lines.join("\n");
            const isSuccess = stepInfo.successKeywords.some((word) => currentLogText.includes(word));
            const isFailure = stepInfo.failureKeywords.some((word) => currentLogText.includes(word));

            if (isSuccess) {
              complete = true;
              setStepStatuses((prev) => ({ ...prev, [key]: "completed" }));
              toast.success(`${stepInfo.label} finished successfully!`);
              // Move to next step
              const currentIndex = stepsConfig.findIndex((s) => s.key === key);
              if (currentIndex < stepsConfig.length - 1) {
                setActiveStep(stepsConfig[currentIndex + 1].key);
              }
            } else if (isFailure) {
              complete = true;
              setStepStatuses((prev) => ({ ...prev, [key]: "failed" }));
              toast.error(`${stepInfo.label} failed.`);
            } else if (isN8NComplete) {
              // Standard finished without failure keyword is assumed success
              complete = true;
              setStepStatuses((prev) => ({ ...prev, [key]: "completed" }));
              toast.success(`${stepInfo.label} completed.`);
              const currentIndex = stepsConfig.findIndex((s) => s.key === key);
              if (currentIndex < stepsConfig.length - 1) {
                setActiveStep(stepsConfig[currentIndex + 1].key);
              }
            }
          }
        } catch (pollErr) {
          console.warn("Logs poll error", pollErr);
        }

        // Wait 3 seconds before next tick
        await new Promise((res) => setTimeout(res, 3000));
      }

      if (attempts >= maxAttempts) {
        setStepStatuses((prev) => ({ ...prev, [key]: "failed" }));
        setTerminalLogs((prev) => ({ ...prev, [key]: prev[key] + `\n[SYSTEM] Log monitor timed out.\n` }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to run step.";
      setStepStatuses((prev) => ({ ...prev, [key]: "failed" }));
      setTerminalLogs((prev) => ({ ...prev, [key]: prev[key] + `\n[SYSTEM ERROR] ${msg}\n` }));
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  const forceMarkCompleted = (key: StepKey) => {
    setStepStatuses((prev) => ({ ...prev, [key]: "completed" }));
    toast.success(`${key.toUpperCase()} step marked completed manually.`);
    const currentIndex = stepsConfig.findIndex((s) => s.key === key);
    if (currentIndex < stepsConfig.length - 1) {
      setActiveStep(stepsConfig[currentIndex + 1].key);
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
              {/* Selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Select Completed Generation Run</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <div className="relative inline-block w-72">
                    <select
                      className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary cursor-pointer pr-8 appearance-none"
                      value={getRunId(selectedRun)}
                      onChange={(e) => {
                        const target = runs.find((r) => getRunId(r) === e.target.value);
                        if (target) setSelectedRun(target);
                      }}
                    >
                      {runs.map((run) => (
                        <option key={getRunId(run)} value={getRunId(run)}>
                          {getRunId(run)} ({new Date(run.createdAt).toLocaleString()})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 pointer-events-none text-muted-foreground" />
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
                        const canExecute = status !== "running" && (idx === 0 || stepStatuses[stepsConfig[idx - 1].key] === "completed");

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
                                    onClick={() => void handleRunStep(step)}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
