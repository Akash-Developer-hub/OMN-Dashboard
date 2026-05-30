import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Route,
  Search,
  Server,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

type PipelineRun = Record<string, any>;
type ServiceKey = "search" | "tile" | "routing" | string;

const FETCH_PIPELINE_URL = "/admin-dashboard/data-pipeline/fetch-pipeline";
const CURRENT_VERSION_URL = "/admin-dashboard/pipeline-config/current-version";
const DOWNLOAD_PATH_CONFIG_URL = "/admin-dashboard/pipeline-config/download-path-config";
const MULTITHREAD_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/multithread";

const serviceMeta: Record<string, { label: string; icon: typeof Search; tone: string }> = {
  search: { label: "Search", icon: Search, tone: "border-blue-500/20 bg-blue-500/10 text-blue-600" },
  tile: { label: "Tile", icon: Search, tone: "border-violet-500/20 bg-violet-500/10 text-violet-600" },
  searchTiles: { label: "Search & Tiles", icon: Search, tone: "border-blue-500/20 bg-blue-500/10 text-blue-600" },
  routing: { label: "Routing", icon: Route, tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" },
};

function extractPipelineRuns(payload: any): PipelineRun[] {
  const body = payload?.data ?? payload;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.pipeline)) return body.pipeline;
  if (Array.isArray(body?.pipelines)) return body.pipelines;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.runs)) return body.data.runs;
  if (Array.isArray(body?.data?.pipelineRuns)) return body.data.pipelineRuns;
  if (Array.isArray(body?.data?.pipelines)) return body.data.pipelines;
  if (Array.isArray(body?.runs)) return body.runs;
  if (Array.isArray(body?.pipelineRuns)) return body.pipelineRuns;
  return body && typeof body === "object" ? [body] : [];
}

function getVersion(payload: any) {
  return payload?.data?.version ?? payload?.data?.currentVersion ?? payload?.currentVersion ?? payload?.version ?? "";
}

function getRunId(run: PipelineRun | null) {
  return String(run?.runId ?? run?._id ?? run?.id ?? "");
}

function getCreatedAt(run: PipelineRun | null) {
  return run?.createdAt ?? run?.created_at ?? run?.updatedAt ?? run?.updated_at ?? null;
}

function getServiceData(run: PipelineRun | null, service: ServiceKey) {
  if (!run) return null;
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object") {
    return run.services[service] ?? (service === "tile" ? run.services.tiles : null) ?? null;
  }
  if (Array.isArray(run.services)) {
    return run.services.find((item: any) => {
      const name = item?.service ?? item?.name;
      return name === service || (service === "tile" && name === "tiles") || (service === "tiles" && name === "tile");
    }) ?? null;
  }
  return run[service] ?? (service === "tile" ? run.tiles : null) ?? null;
}

function servicesFor(run: PipelineRun | null): ServiceKey[] {
  if (!run) return [];
  const rawServices = run.services;
  if (Array.isArray(run.servicesList)) return run.servicesList.map(String);
  if (rawServices && !Array.isArray(rawServices) && typeof rawServices === "object") return Object.keys(rawServices);
  if (Array.isArray(rawServices)) return rawServices.map((item: any) => item?.service ?? item?.name).filter(Boolean).map(String);

  return ["search", "tile", "tiles", "routing"].filter((service) => Boolean(run[service]));
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (["success", "completed", "complete", "done", "generation_completed", "all_completed"].includes(status)) return "completed";
  if (["failed", "failure", "error", "generation_failed"].includes(status)) return "failed";
  if (["running", "processing", "in-progress", "in_progress", "queued", "pending", "generating"].includes(status)) return status;
  return status || "unknown";
}

function serviceStatus(run: PipelineRun | null, service: ServiceKey) {
  const data = getServiceData(run, service);
  return normalizeStatus(
    data?.status ??
      data?.state ??
      data?.serviceStatus ??
      run?.[`${service}Status`] ??
      run?.[`${service}_status`] ??
      run?.status,
  );
}

function isRunCompleted(run: PipelineRun) {
  const overall = normalizeStatus(run?.status ?? run?.overallStatus ?? run?.generationStatus ?? run?.state);
  if (overall === "completed") return true;

  if (run?.allCompleted === true || run?.completed === true || run?.isComplete === true) return true;

  const services = servicesFor(run);
  if (services.length === 0) return false;

  return services.every((service) => {
    const status = serviceStatus(run, service);
    return status === "completed";
  });
}

function createdAtTime(run: PipelineRun | null) {
  const value = new Date(getCreatedAt(run) ?? 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function latestGenerationRun(runs: PipelineRun[]) {
  return [...runs].sort((left, right) => createdAtTime(right) - createdAtTime(left))[0] ?? null;
}

function pickText(...values: any[]) {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return found ? String(found).trim() : "";
}

function serviceField(run: PipelineRun | null, service: ServiceKey, ...keys: string[]) {
  const data = getServiceData(run, service);
  const serviceValues = keys.map((key) => data?.[key]);
  const runValues = keys.flatMap((key) => [run?.[`${service}${key.charAt(0).toUpperCase()}${key.slice(1)}`], run?.[`${service}_${key}`], run?.[key]]);
  return pickText(...serviceValues, ...runValues);
}

function serviceLogText(run: PipelineRun | null, service: ServiceKey) {
  const data = getServiceData(run, service);
  const raw = data?.log ?? data?.logs ?? data?.logLines ?? data?.message ?? run?.[`${service}Log`] ?? run?.[`${service}_log`];
  if (Array.isArray(raw)) {
    return raw
      .map((line) => (typeof line === "string" ? line : line?.message ?? line?.line ?? line?.log ?? JSON.stringify(line)))
      .join("\n");
  }
  if (typeof raw === "string") return raw;
  return "";
}

function formatDate(value: unknown) {
  if (!value) return "No date";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function statusTone(status: string) {
  if (status === "completed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600";
  if (status === "failed") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (status === "running" || status === "processing") return "border-sky-500/20 bg-sky-500/10 text-sky-600";
  return "border-muted-foreground/20 bg-muted text-muted-foreground";
}

export default function PreviewGeneration() {
  const [currentVersion, setCurrentVersion] = useState("");
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routingLogsVisible, setRoutingLogsVisible] = useState(false);
  const [multithreadLoading, setMultithreadLoading] = useState(false);

  const fetchPreviewData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const versionResponse = await api.get(CURRENT_VERSION_URL);
      const version = getVersion(versionResponse.data);
      setCurrentVersion(version);

      const pipelineResponse = await api.get(FETCH_PIPELINE_URL, {
        params: version ? { version } : undefined,
      });

      const latestRun = latestGenerationRun(extractPipelineRuns(pipelineResponse.data));
      setSelectedRun(latestRun);
      setRoutingLogsVisible(false);
    } catch (error) {
      toast.error("Failed to load the latest completed generation.");
      setSelectedRun(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreviewData();
  }, [fetchPreviewData]);

  const handleStartMultithread = async () => {
    setMultithreadLoading(true);
    try {
      const version = currentVersion || (await api.get(CURRENT_VERSION_URL).then((r) => getVersion(r.data)));
      const configRes = await api.post(DOWNLOAD_PATH_CONFIG_URL, { version });
      const downloadPaths: any[] = Object.values(configRes.data?.data?.downloadPaths ?? configRes.data?.downloadPaths ?? {}).flat() as any[];

      const routingData = getServiceData(selectedRun, "routing");
      const serverId = routingData?.targetServerId ?? routingData?.serverId ?? selectedRun?.targetServerId ?? "";
      const pathInfo = downloadPaths.find((p: any) => (p?.targetServerId || p?.serverId) === serverId) ?? downloadPaths[0];

      const inputPath = pathInfo?.outputPath ?? "";
      const multithreadscriptpath = pathInfo?.multithreadscriptpath ?? "";
      const multithreadoutputpath = pathInfo?.multithreadoutputpath ?? "";

      if (!inputPath || !multithreadscriptpath || !multithreadoutputpath) {
        toast.error("Multithread paths are not configured for this server. Please configure them in Download Config.");
        return;
      }

      const response = await fetch(MULTITHREAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputPath, multithreadscriptpath, multithreadoutputpath }),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      setRoutingLogsVisible(true);
      toast.success("Multithread process started successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start multithread process.";
      toast.error(message);
    } finally {
      setMultithreadLoading(false);
    }
  };

  const services = useMemo(() => servicesFor(selectedRun), [selectedRun]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading current generation preview...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-base font-semibold leading-tight">Preview Generation</h2>
          <p className="text-xs text-muted-foreground">Latest generation for the current pipeline version, selected by createdAt.</p>
        </div>
        <div className="flex items-center gap-2">
          {currentVersion ? (
            <Badge variant="outline" className="font-mono">
              Version {currentVersion}
            </Badge>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchPreviewData(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <main className="mx-auto max-w-6xl space-y-4">
          {!selectedRun ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">No recent generation is available for preview.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <Badge variant="secondary" className="font-mono">{getRunId(selectedRun)}</Badge>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(getCreatedAt(selectedRun))}
                  </span>
                  {pickText(selectedRun?.targetServer, selectedRun?.targetServerName, selectedRun?.server) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />
                      {pickText(selectedRun?.targetServer, selectedRun?.targetServerName, selectedRun?.server)}
                    </span>
                  ) : null}
                  <Badge className={statusTone("completed")} variant="outline">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Recent generation
                  </Badge>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                {services.map((service) => {
                  const meta = serviceMeta[service] ?? { label: service, icon: Search, tone: "border-border bg-muted text-foreground" };
                  const Icon = meta.icon;
                  const status = serviceStatus(selectedRun, service);
                  const isRouting = service === "routing";
                  const showLogsTab = isRouting && routingLogsVisible;
                  const logText = serviceLogText(selectedRun, service);
                  const details = [
                    {
                      label: "Input file",
                      value: serviceField(selectedRun, service, "inputFile", "input_file", "fileName", "filename", "sourceFileName"),
                    },
                    {
                      label: "Output path",
                      value: serviceField(selectedRun, service, "outputPath", "output_path", "path", "dataDir"),
                    },
                    {
                      label: "Input path",
                      value: serviceField(selectedRun, service, "fileInputPath", "input_path", "filePath", "sourceFilePath", "sourcePath", "rawOsmPath"),
                    },
                    {
                      label: "Server",
                      value: serviceField(selectedRun, service, "targetServer", "target_server", "targetServerName", "server", "serverName", "devServerName"),
                    },
                    {
                      label: "Server ID",
                      value: serviceField(selectedRun, service, "targetServerId", "target_server_id", "serverId"),
                    },
                    {
                      label: "Status",
                      value: status,
                    },
                  ];

                  return (
                    <Card
                      key={service}
                      className="overflow-hidden border-border/70 shadow-sm"
                    >
                      <CardHeader className="border-b border-border/60 bg-muted/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${meta.tone}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="truncate text-base">{meta.label}</CardTitle>
                              <CardDescription>Generated service details</CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className={statusTone(status)}>
                            {status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        <Tabs defaultValue="details" className="w-full">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <TabsList>
                              <TabsTrigger value="details">Details</TabsTrigger>
                              {showLogsTab ? (
                                <TabsTrigger value="logs">
                                  <TerminalSquare className="mr-2 h-3.5 w-3.5" />
                                  Logs
                                </TabsTrigger>
                              ) : null}
                            </TabsList>

                            {isRouting && !routingLogsVisible ? (
                              <Button type="button" size="sm" onClick={() => void handleStartMultithread()} disabled={multithreadLoading}>
                                {multithreadLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                Start Multithread
                              </Button>
                            ) : null}
                          </div>

                          <TabsContent value="details" className="mt-0">
                            <div className="overflow-hidden rounded-md border border-border/60">
                              <div className="divide-y divide-border/60">
                                {details.map((detail) => (
                                  <div key={`${service}-${detail.label}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
                                    <span className="text-xs font-medium uppercase text-muted-foreground">{detail.label}</span>
                                    <span className="break-all font-mono text-sm text-foreground">{detail.value || "-"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TabsContent>

                          {showLogsTab ? (
                            <TabsContent value="logs" className="mt-0">
                              <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6 text-slate-200">
                                  {logText || "No log output available in this generation payload."}
                                </pre>
                              </div>
                            </TabsContent>
                          ) : null}
                        </Tabs>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {services.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    This completed run does not include generated service details.
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
