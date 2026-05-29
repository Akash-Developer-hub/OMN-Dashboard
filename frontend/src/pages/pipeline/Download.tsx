import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Folder,
  Home,
  Loader2,
  Play,
  RefreshCw,
  Router,
  Search,
  TerminalSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Server } from "@/pages/servers/serversApi";
import { api } from "@/utils/api";

type WorkflowKey = "searchTiles" | "routing";
type JobStatus = "queued" | "running" | "completed" | "failed";

type WorkflowFormState = {
  targetServerId: string;
  outputPath: string;
};

type ServerPathEntry = {
  targetServerId?: string;
  serverId?: string;
  inputPath?: string;
  outputPath?: string;
  scriptPath?: string;
  backupPath?: string;
  logPath?: string;
};

type DownloadJob = {
  id: string;
  runId: string;
  workflow: WorkflowKey;
  workflowLabel: string;
  serverName: string;
  outputPath: string;
  status: JobStatus;
  requestedAt: string;
  logs: string[];
  logOffset: number;
  logComplete: boolean;
  lastError?: string;
};

type BrowserState = {
  open: boolean;
  workflow: WorkflowKey;
  basePath: string;
  items: string[];
  loading: boolean;
  error?: string;
  search: string;
};

const DOWNLOAD_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook-test/omn/download";
const LIST_FOLDERS_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/list-folders";
const RUN_ID_LOGS_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/runId-logs";
const FORM_STORAGE_KEY = "pipeline-download-forms-v2";
const JOBS_STORAGE_KEY = "pipeline-download-jobs-v2";
const LOG_POLL_INTERVAL_MS = 4000;
const LOG_REQUEST_TIMEOUT = 3000;

const workflowCopy: Record<
  WorkflowKey,
  {
    label: string;
    description: string;
    icon: typeof Search;
    buttonLabel: string;
  }
> = {
  searchTiles: {
    label: "Search & Tiles",
    description: "Regional OSM sub-map downloads.",
    icon: Search,
    buttonLabel: "Download Search & Tiles",
  },
  routing: {
    label: "Routing",
    description: "Planet-scale routing download.",
    icon: Router,
    buttonLabel: "Download Routing",
  },
};

const emptyForm = (): WorkflowFormState => ({
  targetServerId: "",
  outputPath: "/home",
});

const defaultForms = (): Record<WorkflowKey, WorkflowFormState> => ({
  searchTiles: emptyForm(),
  routing: emptyForm(),
});

const parseStoredForms = (): Record<WorkflowKey, WorkflowFormState> => {
  if (typeof window === "undefined") return defaultForms();

  try {
    const raw = window.localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return defaultForms();
    const parsed = JSON.parse(raw) as Partial<Record<WorkflowKey, Partial<WorkflowFormState>>>;
    return {
      searchTiles: { ...emptyForm(), ...parsed.searchTiles },
      routing: { ...emptyForm(), ...parsed.routing },
    };
  } catch {
    return defaultForms();
  }
};

const parseStoredJobs = (): DownloadJob[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const makeRunId = (workflow: WorkflowKey) => {
  const prefix = workflow === "searchTiles" ? "st" : "rt";
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
};

const normalizeBrowsePath = (path: string) => {
  const value = String(path || "").trim();
  if (!value) return "/home";
  return value.startsWith("/") ? value : `/${value}`;
};

const buildBrowserPath = (basePath: string, item: string) => {
  if (!item) return basePath;
  if (item.startsWith("/")) return item;
  const trimmedBase = basePath.replace(/\/+$/, "");
  return `${trimmedBase}/${item}`;
};

const parsePathList = (data: unknown): string[] => {
  const payload = data as Record<string, unknown>;
  if (Array.isArray(data)) return data.map(String);
  if (Array.isArray(payload?.folders)) return payload.folders.map(String);
  if (Array.isArray(payload?.filenames)) return payload.filenames.map(String);
  if (Array.isArray(payload?.data)) return payload.data.map(String);
  if (typeof payload?.folders === "string") return payload.folders.split(",").map((item) => item.trim()).filter(Boolean);
  if (typeof payload?.filenames === "string") return payload.filenames.split(",").map((item) => item.trim()).filter(Boolean);
  if (typeof data === "string") return data.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
};

const flattenServerPaths = (serverPaths: Record<string, ServerPathEntry[]> | ServerPathEntry[] | undefined): ServerPathEntry[] => {
  if (!serverPaths) return [];
  if (Array.isArray(serverPaths)) return serverPaths;
  return Object.values(serverPaths).flat();
};

const normalizeLogLines = (payload: unknown): string[] => {
  const wrapper = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const body = wrapper?.data ?? payload;
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
  const nested = data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : undefined;
  const candidates = [
    data?.logs,
    data?.lines,
    data?.logLines,
    nested?.logs,
    nested?.lines,
    Array.isArray(body) ? body : null,
  ];
  const raw = candidates.find((item) => Array.isArray(item) || typeof item === "string");

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const candidate = (item as Record<string, unknown>).message
            ?? (item as Record<string, unknown>).line
            ?? (item as Record<string, unknown>).log;
          if (typeof candidate === "string") return candidate;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean);
  }

  if (typeof raw === "string") return raw ? [raw] : [];
  if (typeof data?.log === "string") return [data.log];
  if (typeof data?.message === "string") return [data.message];
  return [];
};

const extractNewOffset = (payload: unknown): number | null => {
  const wrapper = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const body = wrapper?.data ?? payload;
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
  const nested = data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : undefined;
  const value = data?.newOffset ?? nested?.newOffset ?? data?.offset ?? nested?.offset;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractLogCompleted = (payload: unknown): boolean => {
  const wrapper = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const body = wrapper?.data ?? payload;
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
  const nested = data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : undefined;
  const value = data?.completed ?? data?.complete ?? data?.done ?? data?.finished ?? nested?.completed ?? nested?.complete ?? nested?.done ?? nested?.finished;
  return value === true || String(value).toLowerCase() === "true";
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const statusTone = (status: JobStatus) => {
  switch (status) {
    case "completed":
      return "text-emerald-600 border-emerald-500/20 bg-emerald-500/10";
    case "failed":
      return "text-destructive border-destructive/20 bg-destructive/10";
    case "queued":
      return "text-slate-600 border-slate-500/20 bg-slate-500/10";
    default:
      return "text-sky-600 border-sky-500/20 bg-sky-500/10";
  }
};

function FolderBrowserModal({
  browserState,
  onClose,
  onNavigate,
  onSearch,
  onSelect,
}: {
  browserState: BrowserState | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSearch: (value: string) => void;
  onSelect: (item: string) => void;
}) {
  if (!browserState?.open) return null;

  const parts = browserState.basePath.split("/").filter(Boolean);
  const breadcrumbs = ["/home", ...parts.map((_, index) => `/${parts.slice(0, index + 1).join("/")}`)].filter(
    (crumb, index, list) => list.indexOf(crumb) === index,
  );
  const filteredItems = browserState.search.trim()
    ? browserState.items.filter((item) => item.toLowerCase().includes(browserState.search.toLowerCase()))
    : browserState.items;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[80vh] w-[92%] max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-semibold">Browse Output Folder</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/10 px-5 py-2">
          <button type="button" onClick={() => onNavigate("/home")} className="rounded-md p-1.5 transition hover:bg-muted" title="Go to /home">
            <Home className="h-4 w-4 text-muted-foreground" />
          </button>
          {breadcrumbs.map((crumb) => {
            const label = crumb === "/home" ? "home" : crumb.split("/").filter(Boolean).pop() || crumb;
            const isCurrent = crumb === browserState.basePath;
            return (
              <button
                key={crumb}
                type="button"
                onClick={() => !isCurrent && onNavigate(crumb)}
                className={`rounded-md px-2.5 py-1 text-xs font-mono transition ${isCurrent ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="border-b border-border px-5 py-3">
          <Input value={browserState.search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter folders" />
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          {browserState.loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading folders...
            </div>
          ) : browserState.error ? (
            <div className="py-12 text-center text-sm text-destructive">{browserState.error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No folders found.</div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <button
                  key={`${browserState.basePath}-${item}`}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Open</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border bg-muted/20 px-5 py-3">
          <Button onClick={() => onNavigate(browserState.basePath)}>Use {browserState.basePath}</Button>
        </div>
      </div>
    </div>
  );
}

export default function Download() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [forms, setForms] = useState<Record<WorkflowKey, WorkflowFormState>>(() => parseStoredForms());
  const [jobs, setJobs] = useState<DownloadJob[]>(() => parseStoredJobs());
  const [submitting, setSubmitting] = useState<Record<WorkflowKey, boolean>>({ searchTiles: false, routing: false });
  const [refreshing, setRefreshing] = useState(false);
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);

  useEffect(() => {
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(forms));
  }, [forms]);

  useEffect(() => {
    window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    const fetchServers = async () => {
      setLoadingServers(true);
      try {
        const response = await api.get("/admin-dashboard/servers", { params: { isActive: true } });
        const nextServers = response.data?.data?.servers ?? response.data?.data ?? response.data ?? [];
        setServers(Array.isArray(nextServers) ? nextServers : []);
      } catch (error) {
        console.error("Failed to load servers", error);
        toast.error("Failed to load target servers.");
      } finally {
        setLoadingServers(false);
      }
    };

    void fetchServers();
  }, []);

  const jobsByWorkflow = useMemo(() => ({
    searchTiles: jobs.filter((job) => job.workflow === "searchTiles").sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt)),
    routing: jobs.filter((job) => job.workflow === "routing").sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt)),
  }), [jobs]);

  const updateForm = (workflow: WorkflowKey, patch: Partial<WorkflowFormState>) => {
    setForms((current) => ({
      ...current,
      [workflow]: {
        ...current[workflow],
        ...patch,
      },
    }));
  };

  const getServer = (serverId: string) => servers.find((server) => server._id === serverId || server.id === serverId);

  const fetchCurrentConfigVersion = async () => {
    const response = await api.get("/admin-dashboard/pipeline-config/current-version");
    return response.data?.data?.version || response.data?.version || "v1.0";
  };

  const fetchServerPathForServer = async (serverId: string) => {
    const version = await fetchCurrentConfigVersion();
    const response = await api.post("/admin-dashboard/pipeline-config/server-path", { version });
    const serverPaths = response.data?.data?.serverPaths || response.data?.serverPaths || {};
    const pathInfo = flattenServerPaths(serverPaths).find((path) => (path.targetServerId || path.serverId) === serverId);
    return pathInfo;
  };

  const fetchServerFolders = async (server: Server, path: string) => {
    const copyServerUser = String(server.name || server.username || "ZEUS").trim().toUpperCase();
    const response = await fetch(LIST_FOLDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copyServerUser,
        copyFilePath: normalizeBrowsePath(path),
      }),
    });

    if (!response.ok) throw new Error("Failed to fetch folders");
    return parsePathList(await response.json());
  };

  const openBrowser = async (workflow: WorkflowKey) => {
    const server = getServer(forms[workflow].targetServerId);
    if (!server) {
      toast.error("Select a server before browsing output paths.");
      return;
    }

    const basePath = normalizeBrowsePath(forms[workflow].outputPath);
    setBrowserState({ open: true, workflow, basePath, items: [], loading: true, search: "" });

    try {
      const items = await fetchServerFolders(server, basePath);
      setBrowserState((current) => current ? { ...current, items, loading: false, error: undefined } : null);
    } catch (error) {
      console.error("Failed to browse folders", error);
      setBrowserState((current) => current ? { ...current, items: [], loading: false, error: "Unable to load folders." } : null);
      toast.error("Failed to browse server folders.");
    }
  };

  const navigateBrowser = async (path: string) => {
    if (!browserState) return;
    const server = getServer(forms[browserState.workflow].targetServerId);
    if (!server) return;

    const basePath = normalizeBrowsePath(path);
    setBrowserState((current) => current ? { ...current, basePath, items: [], loading: true, error: undefined } : null);

    try {
      const items = await fetchServerFolders(server, basePath);
      setBrowserState((current) => current ? { ...current, basePath, items, loading: false, error: undefined } : null);
      updateForm(browserState.workflow, { outputPath: basePath });
    } catch (error) {
      console.error("Failed to navigate folders", error);
      setBrowserState((current) => current ? { ...current, items: [], loading: false, error: "Unable to load folders." } : null);
    }
  };

  const selectBrowserItem = async (item: string) => {
    if (!browserState) return;
    const nextPath = buildBrowserPath(browserState.basePath, item);
    await navigateBrowser(nextPath);
  };

  const pollJobLogs = async (job: DownloadJob) => {
    try {
      const response = await axios.post(
        RUN_ID_LOGS_URL,
        {
          runId: job.runId,
          sId: job.runId,
          targetServer: job.serverName,
          offset: job.logOffset,
        },
        { timeout: LOG_REQUEST_TIMEOUT },
      );

      const nextLines = normalizeLogLines(response.data);
      const nextOffset = extractNewOffset(response.data);
      const completed = extractLogCompleted(response.data);

      return {
        ...job,
        status: completed ? "completed" : job.status === "queued" ? "running" : job.status,
        logOffset: nextOffset ?? job.logOffset,
        logComplete: completed,
        logs: nextLines.length > 0 ? [...job.logs, ...nextLines].slice(-400) : job.logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load logs.";
      return {
        ...job,
        lastError: message,
        status: job.status === "queued" ? "running" : job.status,
        logs: [...job.logs, `${new Date().toLocaleTimeString()} ${message}`].slice(-400),
      };
    }
  };

  useEffect(() => {
    const pendingJobs = jobs.filter((job) => !job.logComplete && job.status !== "failed");
    if (pendingJobs.length === 0) return undefined;

    const intervalId = window.setInterval(() => {
      void (async () => {
        const updates = await Promise.all(pendingJobs.map((job) => pollJobLogs(job)));
        setJobs((current) => current.map((job) => updates.find((update) => update.id === job.id) ?? job));
      })();
    }, LOG_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [jobs]);

  const refreshLogs = async () => {
    setRefreshing(true);
    try {
      const updates = await Promise.all(jobs.map((job) => pollJobLogs(job)));
      setJobs((current) => current.map((job) => updates.find((update) => update.id === job.id) ?? job));
    } finally {
      setRefreshing(false);
    }
  };

  const triggerWorkflow = async (workflow: WorkflowKey) => {
    const form = forms[workflow];
    const server = getServer(form.targetServerId);

    if (!server) {
      toast.error("Select a target server.");
      return;
    }

    if (!form.outputPath.trim()) {
      toast.error("Select an output path.");
      return;
    }

    const runId = makeRunId(workflow);
    const provisionalJob: DownloadJob = {
      id: runId,
      runId,
      workflow,
      workflowLabel: workflowCopy[workflow].label,
      serverName: server.name,
      outputPath: normalizeBrowsePath(form.outputPath),
      status: "queued",
      requestedAt: new Date().toISOString(),
      logs: [`${new Date().toLocaleTimeString()} Run created: ${runId}`],
      logOffset: 0,
      logComplete: false,
    };

    setSubmitting((current) => ({ ...current, [workflow]: true }));
    setJobs((current) => [provisionalJob, ...current]);

    try {
      const pathInfo = await fetchServerPathForServer(server._id || server.id);
      const scriptPath = String(pathInfo?.scriptPath || "").trim();

      if (!scriptPath) {
        throw new Error("No script path is configured for the selected server.");
      }

      const payload = {
        type: "osm-download",
        workflow,
        workflowLabel: workflowCopy[workflow].label,
        runId,
        outputPath: provisionalJob.outputPath,
        downloadType: workflow === "searchTiles" ? "search_tiles" : "routing",
        scriptPath,
        targetServer: {
          id: server._id || server.id,
          name: server.name,
          host: server.ipAddress,
          port: server.port,
          username: server.username,
        },
      };

      const response = await fetch(DOWNLOAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const responseMessage = data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined;
        const message = typeof responseMessage === "string" ? responseMessage : `Failed to start ${workflowCopy[workflow].label}.`;
        throw new Error(message);
      }

      const responseLines = normalizeLogLines(data);
      setJobs((current) => current.map((job) => {
        if (job.id !== provisionalJob.id) return job;
        return {
          ...job,
          status: "running",
          logs: [
            ...job.logs,
            `${new Date().toLocaleTimeString()} Download request submitted`,
            ...responseLines,
          ].slice(-400),
        };
      }));
      toast.success(`${workflowCopy[workflow].label} download started.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start download.";
      setJobs((current) => current.map((job) => {
        if (job.id !== provisionalJob.id) return job;
        return {
          ...job,
          status: "failed",
          lastError: message,
          logComplete: true,
          logs: [...job.logs, `${new Date().toLocaleTimeString()} ${message}`].slice(-400),
        };
      }));
      toast.error(message);
    } finally {
      setSubmitting((current) => ({ ...current, [workflow]: false }));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700">OSM Data Download Management</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Search & Tiles and Routing downloads</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Select a server, browse the destination folder, start the download, and monitor logs from the generated runId.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {(["searchTiles", "routing"] as WorkflowKey[]).map((workflow) => {
          const config = workflowCopy[workflow];
          const Icon = config.icon;
          const form = forms[workflow];
          const isBusy = submitting[workflow];

          return (
            <Card key={workflow} className="border-border/60 shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{config.label}</CardTitle>
                    <CardDescription className="mt-1">{config.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${workflow}-server`}>Target server</Label>
                  <select
                    id={`${workflow}-server`}
                    value={form.targetServerId}
                    onChange={(event) => updateForm(workflow, { targetServerId: event.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a target server</option>
                    {servers.map((server) => (
                      <option key={server._id || server.id} value={server._id || server.id}>
                        {server.name} · {server.environment}
                      </option>
                    ))}
                  </select>
                  {loadingServers ? <p className="text-xs text-muted-foreground">Loading active servers...</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${workflow}-output`}>Output path</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`${workflow}-output`}
                      value={form.outputPath}
                      onChange={(event) => updateForm(workflow, { outputPath: event.target.value })}
                      placeholder="/home/output"
                    />
                    <Button type="button" variant="outline" onClick={() => void openBrowser(workflow)}>
                      <Folder className="mr-2 h-4 w-4" /> Browse
                    </Button>
                  </div>
                </div>

                <Button className="w-full" size="lg" onClick={() => void triggerWorkflow(workflow)} disabled={isBusy}>
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {config.buttonLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Run logs</h2>
          <p className="text-sm text-muted-foreground">Each download creates a runId and streams logs into the matching panel below.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshLogs()} disabled={refreshing || jobs.length === 0}>
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh logs
        </Button>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {(["searchTiles", "routing"] as WorkflowKey[]).map((workflow) => {
          const workflowJobs = jobsByWorkflow[workflow];
          return (
            <Card key={`${workflow}-logs`} className="border-border/60 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>{workflowCopy[workflow].label} logs</CardTitle>
                </div>
                <CardDescription>Logs are keyed by the generated runId.</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                    No runs started yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {workflowJobs.map((job) => (
                      <div key={job.id} className="rounded-2xl border border-border/60 bg-background">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{job.runId}</Badge>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(job.status)}`}>
                              {job.status}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {job.serverName} · {formatTime(job.requestedAt)}
                          </div>
                        </div>
                        <ScrollArea className="h-64 bg-slate-950 text-slate-100">
                          <div className="space-y-2 p-4 font-mono text-xs leading-6">
                            {job.logs.length === 0 ? (
                              <p className="text-slate-400">Waiting for logs...</p>
                            ) : (
                              job.logs.map((line, index) => (
                                <p key={`${job.id}-${index}`} className="break-words text-slate-200">{line}</p>
                              ))
                            )}
                            {job.lastError ? <p className="text-rose-300">{job.lastError}</p> : null}
                          </div>
                        </ScrollArea>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <FolderBrowserModal
        browserState={browserState}
        onClose={() => setBrowserState(null)}
        onNavigate={(path) => void navigateBrowser(path)}
        onSearch={(value) => setBrowserState((current) => current ? { ...current, search: value } : null)}
        onSelect={(item) => void selectBrowserItem(item)}
      />
    </div>
  );
}
