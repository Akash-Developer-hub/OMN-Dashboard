import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Loader2, ChevronDown, CheckCircle2, AlertCircle, Package,
  ArrowRight, History, MapPin, ExternalLink, Play, Terminal, Zap,
  CheckSquare, Square, Edit, Save, X, Circle, XCircle, AlertTriangle,
  RefreshCw, Folder, ChevronRight, Server,
} from "lucide-react";
import { toast } from "sonner";
import type { Server as ServerType } from "@/pages/servers/serversApi";
import { CreateGeneration } from "./CreateGeneration";
import type { GenerationCreationMeta, GenerationServiceTransferMeta } from "./CreateGeneration";
import { api } from "@/utils/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceRunStatus = "pending" | "running" | "success" | "failed";

interface ServiceRunInfo {
  service: string;
  status: ServiceRunStatus;
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

interface PipelineRunState {
  runId: string;
  generationId?: string;
  services: ServiceRunInfo[];
  allCompleted: boolean;
  anyFailed: boolean;
  pollingActive: boolean;
}

interface GenerationRecord {
  _id: string;
  id?: string;
  name?: string;
  status?: string;
  services: Array<{ service: string; version?: string; transfers?: any[]; targetServer?: string; sourcePath?: string }>;
  outputPath?: string;
  devServerName?: string;
  serviceTransfers?: GenerationServiceTransferMeta[];
  createdAt?: string | number;
  updatedAt?: string | number;
  timeline?: Array<{
    status: ServiceRunStatus;
    timestamp: number;
    note?: string;
  }>;
}

interface PipelineRunPayload {
  _id?: string;
  id?: string;
  runId?: string;
  generationId?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  services?: Record<string, any> | any[];
  servicesList?: string[];
  outputPath?: string;
  devServerName?: string;
  sourcePath?: string;
  [key: string]: any;
}

type DownloadWorkflowKey = "searchTiles" | "routing";
type DownloadSetupStep = "version" | "server" | "service";

interface DownloadSetupState {
  open: boolean;
  step: DownloadSetupStep;
  versions: string[];
  loadingVersions: boolean;
  addingVersion: boolean;
  creatingVersion: boolean;
  newVersion: string;
  selectedVersion: string;
  selectedServerId: string;
  selectedService: DownloadWorkflowKey | "";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4000;
const STAGING_DETAILS_FRESHNESS_MS = 15 * 60 * 1000;
const FETCH_PIPELINE_URL = "http://localhost:3000/api/v1/admin-dashboard/data-pipeline/fetch-pipeline";
const FETCH_TRANSFERS_URL = "http://localhost:3000/api/v1/admin-dashboard/data-pipeline/fetch-transfers";
const MOVE_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/move-service";
const FILES_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/list-files";
const FOLDERS_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/list-folders";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTs = (ts: number | string | undefined) => {
  if (!ts) return "—";
  const d = new Date(ts as any);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return d.toLocaleDateString();
};

const toTime = (ts: string | number | undefined) => {
  if (!ts) return 0;
  const value = new Date(ts as any).getTime();
  return Number.isFinite(value) ? value : 0;
};

const isNearCurrentTime = (ts: string | number | undefined, windowMs = STAGING_DETAILS_FRESHNESS_MS) => {
  const time = toTime(ts);
  if (!time) return false;
  return Math.abs(Date.now() - time) <= windowMs;
};

const hasFreshStagingDetails = (doc: any) =>
  isNearCurrentTime(doc?.updatedAt ?? doc?.updated_at ?? doc?.createdAt ?? doc?.created_at);

const normalizeServiceStatus = (status: unknown): ServiceRunStatus => {
  const value = String(status ?? "").trim().toLowerCase();
  if (["success", "completed", "complete", "done"].includes(value)) return "success";
  if (["failed", "failure", "error"].includes(value)) return "failed";
  if (["running", "processing", "in_progress", "started"].includes(value)) return "running";
  return "pending";
};

const isRawSuccessStatus = (status: unknown) =>
  ["success", "completed", "complete", "done"].includes(String(status ?? "").trim().toLowerCase());

const extractPipelineRuns = (data: any): PipelineRunPayload[] => {
  const body = data?.data ?? data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.runs)) return body.runs;
  if (Array.isArray(body?.data)) return body.data;
  return body ? [body] : [];
};

const extractPipelineVersions = (data: any): string[] => {
  const body = data?.data ?? data;
  const versions = body?.versions ?? body?.data?.versions ?? body;
  if (!Array.isArray(versions)) return [];

  return versions
    .map((version) => String(version || "").trim())
    .filter(Boolean);
};

const getRunServices = (run: PipelineRunPayload) => {
  const list = Array.isArray(run.servicesList) ? run.servicesList : [];
  if (Array.isArray(run.services)) {
    return run.services.map((item: any) => ({
      service: item.service ?? item.name ?? "unknown",
      status: item.status,
      version: item.version,
    }));
  }
  const serviceObj = run.services && typeof run.services === "object" ? run.services : {};
  const names = list.length ? list : Object.keys(serviceObj);
  return names.map((service) => {
    const item = serviceObj[service] ?? {};
    return {
      service,
      status: item.status ?? (run as any)[`${service}Status`],
      version: item.version,
    };
  });
};

/**
 * Get the service data object from a run payload.
 * Actual structure: run.services[serviceName] is the service object directly.
 */
const getServiceDataFromRun = (run: PipelineRunPayload, service: string): any => {
  // Primary: run.services is a record keyed by service name (actual API structure)
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object") {
    const svcData = (run.services as Record<string, any>)[service];
    if (svcData && typeof svcData === "object") return svcData;
    if (service === "tile") {
      const tilesData = (run.services as Record<string, any>).tiles;
      if (tilesData && typeof tilesData === "object") return tilesData;
    }
  }
  // Fallback: array of service objects
  if (Array.isArray(run.services)) {
    const srv = run.services.find((s: any) => {
      const name = s.service ?? s.name;
      return name === service || (service === "tile" && name === "tiles");
    });
    if (srv) return srv;
  }
  const direct = (run as any)[service] ?? (service === "tile" ? (run as any).tiles : undefined);
  if (direct && typeof direct === "object") return direct;
  return {};
};

/**
 * Get the move status key for a service.
 * Actual API structure has top-level keys: routingServerMove, searchServerMove, tilesServerMove
 */
const getMoveStatusKey = (service: string): string => {
  if (service === "tile" || service === "tiles") return "tilesServerMove";
  return `${service}ServerMove`;
};

/**
 * Get the move status for a service from the transfer document.
 * Actual structure: top-level fields like routingServerMove, searchServerMove, tilesServerMove
 */
const getTransferMoveStatus = (doc: any, service: string): string => {
  const keys =
    service === "tile" || service === "tiles"
      ? ["tilesServerMove", "tileServerMove"]
      : [`${service}ServerMove`];

  const serverMoveStatus = doc?.serverMoveStatus;
  if (serverMoveStatus && typeof serverMoveStatus === "object") {
    for (const key of keys) {
      const value = serverMoveStatus[key];
      if (value) return String(value).toLowerCase();
    }
  }

  for (const key of keys) {
    const value = doc?.[key];
    if (value) return String(value).toLowerCase();
  }

  return "";
};

/**
 * Extract the staging move status for a given service from the pipeline run.
 * Looks in: run.services[service].transfers[] for moveto=STAGING entries.
 */
const getStagingMoveStatus = (run: PipelineRunPayload, service: string): string => {
  const svcData = getServiceDataFromRun(run, service);
  const transfers: any[] = Array.isArray(svcData?.transfers) ? svcData.transfers : [];

  // Find staging transfer
  const stagingTransfer = transfers.find(
    (t: any) => String(t.moveto ?? "").toUpperCase() === "STAGING"
  ) ?? transfers[transfers.length - 1];

  if (!stagingTransfer) return "";

  const moveKey = getMoveStatusKey(service);
  return String(stagingTransfer[moveKey] ?? "").toLowerCase();
};

/**
 * Extract the production move status for a given service.
 */
const getProductionMoveStatus = (run: PipelineRunPayload, service: string): string => {
  const svcData = getServiceDataFromRun(run, service);
  const transfers: any[] = Array.isArray(svcData?.transfers) ? svcData.transfers : [];

  const prodTransfer = transfers.find(
    (t: any) => String(t.moveto ?? "").toUpperCase() === "PRODUCTION"
  ) ?? null;

  if (!prodTransfer) return "";

  const moveKey = getMoveStatusKey(service);
  return String(prodTransfer[moveKey] ?? "").toLowerCase();
};

/**
 * Get all transfers for a service from the actual API structure.
 * Actual structure: doc.transfers is an object keyed by service name (e.g. transfers.routing, transfers.search)
 * Each value is an array of transfer objects.
 */
const getServiceTransfers = (run: PipelineRunPayload, service: string): any[] => {
  const svcData = getServiceDataFromRun(run, service);
  return Array.isArray(svcData?.transfers) ? svcData.transfers : [];
};

const extractTransferDocs = (data: any): any[] => {
  const body = data?.data ?? data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return body ? [body] : [];
};

const flattenServerPaths = (serverPaths: Record<string, any[]> | any[] | undefined): any[] => {
  if (!serverPaths) return [];
  if (Array.isArray(serverPaths)) return serverPaths;
  return Object.values(serverPaths).flat();
};

/**
 * Get all service names from a transfer document.
 * Current structure: doc.servicesList is the selected service list.
 * Ignore servicesSet; it is not part of the UI selection source.
 */
const getTransferDocServices = (doc: any): string[] => {
  if (Array.isArray(doc?.servicesList) && doc.servicesList.length > 0) {
    return doc.servicesList as string[];
  }

  if (Array.isArray(doc?.serviceList) && doc.serviceList.length > 0) {
    return doc.serviceList as string[];
  }

  if (Array.isArray(doc?.transfers)) {
    return Array.from(
      new Set(
        doc.transfers
          .map((item: any) => item?.service)
          .filter(Boolean),
      ),
    );
  }

  if (doc?.transfers && typeof doc.transfers === "object") {
    return Object.keys(doc.transfers);
  }

  if (Array.isArray(doc?.service) && doc.service.length > 0) {
    return doc.service as string[];
  }

  return [];
};

/**
 * Get the transfer entries for a specific service from a transfer document.
 * Current structure: doc.transfers is an object keyed by service name.
 * Older flat transfer arrays are still supported as a fallback.
 */
const getTransferDocServiceTransfers = (doc: any, service: string): any[] => {
  const transfers = doc?.transfers;
  if (!transfers) return [];

  const serviceVariants =
    service === "tile"
      ? ["tile", "tiles"]
      : service === "tiles"
        ? ["tiles", "tile"]
        : [service];

  const enrichTransfer = (entry: any, previousMeta?: any) => ({
    ...entry,
    moveto: entry.moveto ?? previousMeta?.moveto ?? doc.moveto ?? "STAGING",
    targetEnv: entry.targetEnv ?? previousMeta?.targetEnv ?? doc.targetEnv,
    from: entry.from ?? previousMeta?.from ?? doc.from,
    to: entry.to ?? previousMeta?.to ?? doc.to,
    source: entry.source ?? entry.from?.path ?? previousMeta?.from?.path ?? doc.source,
    destination: entry.destination ?? entry.to?.path ?? previousMeta?.to?.path ?? doc.destination,
    basePath: entry.basePath ?? previousMeta?.basePath ?? doc.basePath,
    fileName: entry.fileName ?? previousMeta?.fileName ?? doc.fileName,
    results: entry.results ?? doc.results,
    serverMoveStatus: entry.serverMoveStatus ?? doc.serverMoveStatus,
  });

  const enrichTransferEntries = (entries: any[]) => {
    let previousMeta: any;
    return entries.map((entry) => {
      const enriched = enrichTransfer(entry, previousMeta);
      if (entry?.moveto || entry?.from || entry?.to || entry?.targetEnv) {
        previousMeta = enriched;
      }
      return enriched;
    });
  };

  if (Array.isArray(transfers)) {
    return enrichTransferEntries(
      transfers.filter((entry: any) => serviceVariants.includes(String(entry?.service ?? ""))),
    );
  }

  if (typeof transfers !== "object") return [];

  for (const variant of serviceVariants) {
    const entries = transfers[variant];
    if (Array.isArray(entries) && entries.length > 0) {
      return enrichTransferEntries(entries);
    }
  }

  return [];
};

/**
 * Get the move status for a given service and moveTo destination from a transfer document.
 * Actual structure: move status is stored at top-level of the doc as routingServerMove, searchServerMove etc.
 * The moveTo destination is stored at top-level as doc.moveto.
 */
const getTransferDocMoveStatus = (doc: any, service: string, moveTo: "STAGING" | "PRODUCTION"): string => {
  // Check if this document's moveto matches the requested destination
  const docMoveTo = String(doc?.moveto ?? "").toUpperCase();
  if (docMoveTo && docMoveTo !== moveTo) {
    // This doc is for a different destination
    return "";
  }

  const statusKey = service === "tile" || service === "tiles" ? "tilesServerMove" : `${service}ServerMove`;
  const statusFromMap = doc?.serverMoveStatus?.[statusKey];
  if (statusFromMap) return String(statusFromMap).toLowerCase();

  return getTransferMoveStatus(doc, service);
};

const findTransferDocForMove = (docs: any[], moveTo: "STAGING" | "PRODUCTION"): any | null =>
  docs.find((doc) => String(doc?.moveto ?? "").toUpperCase() === moveTo) ?? null;

const getTransferDocsMoveStatus = (docs: any[], service: string, moveTo: "STAGING" | "PRODUCTION"): string => {
  const matchingDoc = findTransferDocForMove(docs, moveTo);
  return matchingDoc ? getTransferDocMoveStatus(matchingDoc, service, moveTo) : "";
};

const getTransferDocsServiceTransfers = (docs: any[], service: string, moveTo: "STAGING" | "PRODUCTION"): any[] => {
  const matchingDoc = findTransferDocForMove(docs, moveTo);
  return matchingDoc ? getTransferDocServiceTransfers(matchingDoc, service) : [];
};

const buildGenerationFromTransferDoc = (
  doc: any,
  moveTo: "STAGING" | "PRODUCTION",
  onlyServices?: string[],
): GenerationRecord | null => {
  const matchesService = (left: string, right: string) =>
    left === right || (left === "tile" && right === "tiles") || (left === "tiles" && right === "tile");

  const serviceNames = getTransferDocServices(doc).filter((service) => {
    if (onlyServices?.length && !onlyServices.some((item) => matchesService(item, service))) return false;
    // Check if this doc has transfers for this service with matching moveto
    const transfers = getTransferDocServiceTransfers(doc, service);
    return transfers.length > 0;
  });

  if (serviceNames.length === 0) return null;

  const runId = String(doc?.runId ?? doc?._id ?? "");
  if (!runId) return null;

  return {
    _id: `${runId}-${moveTo.toLowerCase()}`,
    name: runId,
    status: moveTo === "STAGING" ? "staging" : "production",
    services: serviceNames.map((service) => ({
      service,
      transfers: getTransferDocServiceTransfers(doc, service),
    })),
    outputPath: serviceNames
      .map((service) => getTransferDocServiceTransfers(doc, service)[0]?.destination)
      .find(Boolean),
    createdAt: doc?.createdAt ?? Date.now(),
    updatedAt: doc?.updatedAt ?? doc?.updated_at ?? doc?.createdAt ?? Date.now(),
  };
};

const findLatestTransferGeneration = async (
  runs: PipelineRunPayload[],
  moveTo: "STAGING" | "PRODUCTION",
): Promise<{ generation: GenerationRecord; doc: any } | null> => {
  for (const run of runs) {
    const runId = run.runId ?? run._id ?? run.id ?? run.generationId;
    if (!runId) continue;

    const docs = await fetchTransferDocsByRunId(String(runId));
    const doc = findTransferDocForMove(docs, moveTo);
    if (!doc) continue;

    const generation = buildGenerationFromTransferDoc(doc, moveTo);
    if (generation) return { generation, doc };
  }

  return null;
};

const extractServiceTransfersFromRun = (
  run: PipelineRunPayload,
  services: Array<{ service: string }>,
): GenerationServiceTransferMeta[] => {
  return services
    .map(({ service }) => {
      const svcData = getServiceDataFromRun(run, service);
      const from = String(
        svcData.targetServer ?? svcData.target_server ?? svcData.targetServerName ?? svcData.devServerName ?? svcData.server ?? "",
      ).trim();
      const source = String(
        svcData.outputPath ?? svcData.output_path ?? svcData.sourcePath ?? svcData.source ?? svcData.fileInputPath ?? svcData.copySourcePath ?? "",
      ).trim();
      const gtfsEnabled = Boolean(
        svcData.gtfsEnabled ?? svcData.gtfs_enabled ?? svcData.routingGtfsIncluded ?? false,
      );
      return { service, from, source, gtfsEnabled };
    })
    .filter((item) => item.service && (item.from || item.source || item.gtfsEnabled));
};

const getServiceTargetFromGeneration = (generation: GenerationRecord, service: string): string => {
  const svc = generation.services.find((item) => {
    const name = item.service;
    return name === service || (service === "tile" && name === "tiles") || (service === "tiles" && name === "tile");
  });
  return String(svc?.targetServer ?? "").trim();
};

const buildDevelopmentGenerationFromRun = (run: PipelineRunPayload): GenerationRecord | null => {
  const services = getRunServices(run);
  if (services.length === 0) return null;

  const id = run.generationId ?? run.runId ?? run.id ?? run._id;
  if (!id) return null;

  const allSuccess = services.every((svc) => isRawSuccessStatus(svc.status));
  const anyFailed = services.some((svc) => String(svc.status ?? "").trim().toLowerCase() === "failed");
  const overallStatus = allSuccess ? "generation_completed" : anyFailed ? "generation_failed" : "generating";

  return {
    _id: String(id),
    id: run.id,
    name: run.runId ?? run.generationId ?? String(id), // prefer runId as name for matching
    status: overallStatus,
    services: services.map((svc) => {
      const svcData = getServiceDataFromRun(run, svc.service);
      return {
        service: svc.service,
        version: svc.version,
        transfers: svcData?.transfers,
        targetServer: String(
          svcData?.targetServer ?? svcData?.target_server ?? svcData?.targetServerName ?? svcData?.devServerName ?? svcData?.server ?? "",
        ).trim(),
        sourcePath: String(
          svcData?.outputPath ?? svcData?.output_path ?? svcData?.sourcePath ?? svcData?.source ?? svcData?.fileInputPath ?? svcData?.copySourcePath ?? "",
        ).trim(),
      };
    }),
    outputPath: run.outputPath ?? run.sourcePath,
    devServerName: run.devServerName,
    serviceTransfers: extractServiceTransfersFromRun(run, services),
    createdAt: run.createdAt,
    timeline: services.map((svc) => ({
      status: normalizeServiceStatus(svc.status),
      timestamp: toTime(run.createdAt) || Date.now(),
      note: `${svc.service} ${String(svc.status ?? "success")}`,
    })),
  };
};

const SERVICE_TAG_COLOR: Record<string, string> = {
  search: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  routing: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  tile: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPipelineStatus(_runId: string): Promise<ServiceRunInfo[] | null> {
  return null;
}

async function fetchAllServers(): Promise<ServerType[]> {
  try {
    const res = await api.get("/admin-dashboard/servers");
    return Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

interface MovePayload {
  target_env: string;
  runId?: string;
  moveto: string;
  backup?: boolean;
  isnotify?: boolean;
  version?: string;
  transfers: Array<{
    from: string;
    to: string;
    source: string;
    backupPath?: string;
    destination: string;
    services: string[];
  }>;
}

async function callMoveApi(payload: MovePayload): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(MOVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data?.message ?? "Move API error" };
    return { ok: true, message: data?.message };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}

const parsePathList = (data: any): string[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.files)) return data.files;
  if (Array.isArray(data?.filenames)) return data.filenames;
  if (Array.isArray(data?.folders)) return data.folders;
  if (Array.isArray(data?.data)) return data.data;
  if (typeof data?.files === "string") return data.files.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (typeof data?.filenames === "string") return data.filenames.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (typeof data?.folders === "string") return data.folders.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (typeof data === "string") return data.split(",").map((s: string) => s.trim()).filter(Boolean);
  return [];
};

async function listServerPaths(url: string, serverUser: string, path: string): Promise<string[]> {
  const formattedUser = String(serverUser || "ZEUS").trim() || "ZEUS";
  const requestPath = String(path || "/home").trim() || "/home";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyServerUser: formattedUser, copyFilePath: requestPath }),
    });
    if (!res.ok) throw new Error("Server browse failed");
    const data = await res.json();
    return parsePathList(data);
  } catch (error) {
    console.error("Path browse error:", error);
    throw error;
  }
}

async function listServerFiles(serverUser: string, path: string): Promise<string[]> {
  return listServerPaths(FILES_URL, serverUser, path);
}

async function listServerFolders(serverUser: string, path: string): Promise<string[]> {
  return listServerPaths(FOLDERS_URL, serverUser, path);
}

// ─── Status Icon ──────────────────────────────────────────────────────────────

function ServiceStatusIcon({ status }: { status: ServiceRunStatus }) {
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  if (status === "running")
    return (
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
      </span>
    );
  return <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />;
}

const svcStatusLabel = (s: ServiceRunStatus) =>
  ({ pending: "Pending", running: "Running…", success: "Success", failed: "Failed" }[s]);

const svcStatusClass = (s: ServiceRunStatus) =>
  ({ pending: "text-muted-foreground/50", running: "text-blue-600", success: "text-emerald-600", failed: "text-red-500" }[s]);

function EmptyPipelineVersionCard({ version }: { version: string }) {
  return (
    <div className="px-5 py-14 flex flex-col items-center gap-3 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border bg-muted/40 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground">No pipeline runs found</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          There is no pipeline run for this particular version{" "}
          <span className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
            {version}
          </span>
          .
        </p>
      </div>
    </div>
  );
}

// ─── Pipeline Phase Indicator ─────────────────────────────────────────────────

function PipelinePhaseIndicator({ currentPhase }: { currentPhase: "development" | "staging" | "production" }) {
  const phases = [
    { id: "development", label: "Development" },
    { id: "staging", label: "Staging" },
    { id: "production", label: "Production" },
  ];
  const currentIndex = phases.findIndex(p => p.id === currentPhase);

  return (
    <div className="flex items-center gap-1.5 mt-2.5 mb-2 flex-wrap">
      {phases.map((phase, idx) => {
        const isActive = idx === currentIndex;
        const isPast = idx < currentIndex;
        return (
          <div key={phase.id} className="flex items-center gap-1.5">
            <div className={`flex items-center justify-center px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider
              ${isActive ? "bg-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm" :
                isPast ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                  "bg-muted/50 text-muted-foreground/60 border-border/50"}`}>
              {phase.label}
              {isPast && <CheckCircle2 className="w-3 h-3 ml-1 text-emerald-500" />}
            </div>
            {idx < phases.length - 1 && (
              <ArrowRight className={`w-3 h-3 ${isPast || isActive ? "text-foreground/30" : "text-muted-foreground/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Editable path input ──────────────────────────────────────────────────────

interface PathInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
  disabled?: boolean;
}

function PathInput({ label, value, onChange, editing, onEdit, onSave, onCancel, placeholder = "", disabled = false }: PathInputProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">{label}</p>
      <div className="flex items-start gap-1.5">
        {editing ? (
          <>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-2.5 py-1.5 bg-background border border-blue-500/40 rounded-lg text-[11px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={onSave} className="p-1.5 bg-emerald-600/20 text-emerald-600 rounded-lg hover:bg-emerald-600/30 transition-colors mt-0.5">
              <Save className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onCancel} className="p-1.5 bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 px-2.5 py-1.5 bg-muted/40 border border-border rounded-lg text-[11px] font-mono text-foreground break-all min-h-[30px]">
              {value || <span className="text-muted-foreground/40">—</span>}
            </div>
            <button type="button" disabled={disabled} onClick={onEdit} className="p-1.5 bg-blue-600/20 text-blue-600 rounded-lg hover:bg-blue-600/30 transition-colors disabled:opacity-40 mt-0.5">
              <Edit className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type BrowserTarget = "routing" | "search" | "tile" | "destination";

interface BrowserState {
  open: boolean;
  mode: "files" | "folders";
  target: BrowserTarget;
  basePath: string;
  items: string[];
  loading: boolean;
  error?: string;
  search?: string;
}

// ─── Live Service Status Panel ────────────────────────────────────────────────

function ServiceRunStatusPanel({ runState }: { runState: PipelineRunState }) {
  return (
    <div className="rounded-xl border border-blue-500/20 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-blue-500/5 border-b border-blue-500/15">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono">Services</span>
      </div>
      <div className="px-3.5 py-3 space-y-2.5 bg-card">
        {runState.services.map((svc) => (
          <div key={svc.service} className="flex items-center gap-2.5">
            <ServiceStatusIcon status={svc.status} />
            <span className={`font-mono text-[11px] font-semibold flex-1 truncate ${SERVICE_TAG_COLOR[svc.service]?.split(" ")[1] ?? "text-foreground"}`}>
              {svc.service}
            </span>
            {svc.status === "success" && svc.completedAt && svc.startedAt && (
              <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0">
                {(((svc.completedAt - svc.startedAt) / 1000) | 0)}s
              </span>
            )}
          </div>
        ))}
      </div>
      {runState.allCompleted && !runState.anyFailed && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/5 border-t border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-[11px] text-emerald-600 font-medium">All services ready</span>
        </div>
      )}
      {runState.anyFailed && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-red-500/5 border-t border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-[11px] text-red-500 font-medium">One or more services failed</span>
        </div>
      )}
      {runState.pollingActive && !runState.allCompleted && !runState.anyFailed && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-muted/30 border-t border-border">
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
          <span className="text-[10px] text-muted-foreground">Auto-checking every {POLL_INTERVAL_MS / 1000}s…</span>
        </div>
      )}
    </div>
  );
}

// ─── Development Card ─────────────────────────────────────────────────────────

interface DevelopmentCardProps {
  generation: GenerationRecord | null;
  runState: PipelineRunState | null;
  sourcePath: string;
  devServerName: string;
  currentVersion: string | null;
  emptyVersion: string | null;
  stagingServers: ServerType[];
  stagingServersLoading: boolean;
  onMoveToStaging: (args: {
    services: string[];
    stagingServerId: string;
    stagingServerName: string;
    routingSourcePath?: string;
    searchSourcePath?: string;
    tileSourcePath?: string;
    destinationSourcePath: string;
    backupEnabled: boolean;
    isNotify: boolean;
  }) => Promise<void>;
  loading: boolean;
}

function DevelopmentCard({
  generation,
  runState,
  sourcePath,
  devServerName,
  currentVersion,
  emptyVersion,
  stagingServers,
  stagingServersLoading,
  onMoveToStaging,
  loading,
}: DevelopmentCardProps) {
  const [selectedSvcs, setSelectedSvcs] = useState<Set<string>>(new Set());
  const [selectedStagingId, setSelectedStagingId] = useState("");
  const [routingSourcePath, setRoutingSourcePath] = useState("");
  const [searchSourcePath, setSearchSourcePath] = useState("");
  const [tileSourcePath, setTileSourcePath] = useState("");
  const [editingRoutingSource, setEditingRoutingSource] = useState(false);
  const [editingSearchSource, setEditingSearchSource] = useState(false);
  const [editingTileSource, setEditingTileSource] = useState(false);
  const [routingSourceError, setRoutingSourceError] = useState("");
  const [searchSourceError, setSearchSourceError] = useState("");
  const [tileSourceError, setTileSourceError] = useState("");
  const [destinationSourcePath, setDestinationSourcePath] = useState("");
  const [editingDest, setEditingDest] = useState(false);
  const [destError, setDestError] = useState("");
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [isNotify, setIsNotify] = useState(false);

  useEffect(() => {
    if (generation) setSelectedSvcs(new Set(generation.services.map((s) => s.service)));
    setSelectedStagingId("");
    const transfers = generation?.serviceTransfers ?? [];
    const routingTransfer = transfers.find((item) => item.service === "routing");
    const searchTransfer = transfers.find((item) => item.service === "search");
    const tileTransfer = transfers.find((item) => item.service === "tile");

    const isRoutingGtfsEnabled = routingTransfer ? routingTransfer.gtfsEnabled : false;
    const routingOutputPath = routingTransfer?.source || (isRoutingGtfsEnabled ? (sourcePath || generation?.outputPath || "") : "");

    setRoutingSourcePath(routingOutputPath);
    setSearchSourcePath(searchTransfer?.source || "");
    setTileSourcePath(tileTransfer?.source || "");
    setEditingRoutingSource(false);
    setEditingSearchSource(false);
    setEditingTileSource(false);
    setRoutingSourceError("");
    setSearchSourceError("");
    setTileSourceError("");
    setDestinationSourcePath("");
    setEditingDest(false);
    setDestError("");
    setBackupEnabled(true);
    setIsNotify(false);
  }, [generation?._id, sourcePath]);

  // Fetch staging server paths when a server is selected
  useEffect(() => {
    if (!selectedStagingId) {
      setDestinationSourcePath("");
      return;
    }

    const fetchServerPath = async () => {
      try {
        const res = await api.post("/admin-dashboard/pipeline-config/server-path", {
          version: currentVersion || "v1.0",
        });
        const serverPaths = res.data?.data?.serverPaths || res.data?.serverPaths || {};
        const paths = flattenServerPaths(serverPaths);
        const pathInfo = paths.find((path) => (path.targetServerId || path.serverId) === selectedStagingId);
        setDestinationSourcePath(pathInfo?.outputPath || "/home");
      } catch (error) {
        console.error("Failed to fetch staging server path:", error);
        setDestinationSourcePath("/home");
      }
    };

    fetchServerPath();
  }, [selectedStagingId, currentVersion]);

  const toggleSvc = (svc: string) =>
    setSelectedSvcs((prev) => { const n = new Set(prev); n.has(svc) ? n.delete(svc) : n.add(svc); return n; });

  const handleSaveDest = () => {
    if (!destinationSourcePath.trim()) { setDestError("Path is required"); return; }
    if (!destinationSourcePath.startsWith("/")) { setDestError("Path must start with /"); return; }
    setDestError(""); setEditingDest(false);
  };

  const handleSaveRoutingSource = () => {
    if (!routingSourcePath.trim()) { setRoutingSourceError("Path is required"); return; }
    if (!routingSourcePath.startsWith("/")) { setRoutingSourceError("Path must start with /"); return; }
    setRoutingSourceError(""); setEditingRoutingSource(false);
  };

  const handleSaveSearchSource = () => {
    if (!searchSourcePath.trim()) { setSearchSourceError("Path is required"); return; }
    if (!searchSourcePath.startsWith("/")) { setSearchSourceError("Path must start with /"); return; }
    setSearchSourceError(""); setEditingSearchSource(false);
  };

  const handleSaveTileSource = () => {
    if (!tileSourcePath.trim()) { setTileSourceError("Path is required"); return; }
    if (!tileSourcePath.startsWith("/")) { setTileSourceError("Path must start with /"); return; }
    setTileSourceError(""); setEditingTileSource(false);
  };

  const [browserState, setBrowserState] = useState<BrowserState | null>(null);

  const getServiceBrowseServerUser = (service: BrowserTarget) => {
    if (service === "destination") {
      return stagingServer?.name?.trim() || stagingServer?.username?.trim() || "";
    }

    const matchesService = (name: string | undefined) =>
      name === service || (service === "tile" && name === "tiles");

    const serviceRecord = generation?.services.find((item) => {
      return matchesService(item.service);
    });

    const serviceTransfer = generation?.serviceTransfers?.find((item) => {
      return matchesService(item.service);
    });

    return (
      serviceRecord?.targetServer?.trim()
      || serviceTransfer?.from?.trim()
      || devServerName?.trim()
      || ""
    );
  };

  const normalizeBrowsePath = (path: string) => {
    const value = String(path || "").trim();
    if (!value) return "/home";
    return value.startsWith("/") ? value : `/${value}`;
  };

  const getBrowseBasePath = (path: string) => {
    const normalized = normalizeBrowsePath(path);
    if (normalized.endsWith("/")) return normalized;
    const last = normalized.split("/").pop() ?? "";
    if (last.includes(".") && normalized.includes("/")) {
      return normalized.slice(0, normalized.lastIndexOf("/")) || "/home";
    }
    return normalized;
  };

  const buildBrowserPath = (basePath: string, item: string) => {
    if (!item) return basePath;
    if (item.startsWith("/")) return item;
    const trimmedBase = basePath.replace(/\/+$/, "");
    return `${trimmedBase}/${item}`;
  };

  const closeBrowser = () => setBrowserState(null);

  const openBrowser = async (mode: "files" | "folders", target: BrowserTarget, path: string) => {
    const browseServerUser = getServiceBrowseServerUser(target);

    if (!browseServerUser) {
      toast.error(target === "destination" ? "Select a staging server first." : "Source server not found for this service.");
      return;
    }
    const basePath = normalizeBrowsePath(path);
    setBrowserState({ open: true, mode, target, basePath, items: [], loading: true, search: "" });
    try {
      const items = mode === "files"
        ? await listServerFiles(browseServerUser, basePath)
        : await listServerFolders(browseServerUser, basePath);

      setBrowserState((prev) => prev ? { ...prev, items, loading: false, error: undefined } : null);

      if (items.length === 0 && mode === "folders") {
        toast.info("No subfolders found.");
      }
    } catch {
      setBrowserState((prev) => prev ? { ...prev, items: [], loading: false, error: "Unable to load items." } : null);
      toast.error("Failed to browse server path.");
    }
  };

  const applyBrowserSelection = (item: string) => {
    if (!browserState) return;
    const selectedPath = buildBrowserPath(browserState.basePath, item);

    if (browserState.target === "destination") {
      setDestinationSourcePath(selectedPath);
    } else if (browserState.target === "routing") {
      setRoutingSourcePath(selectedPath);
    } else if (browserState.target === "search") {
      setSearchSourcePath(selectedPath);
    } else if (browserState.target === "tile") {
      setTileSourcePath(selectedPath);
    }

    if (browserState.mode === "folders") {
      // Navigate into folder instead of closing
      openBrowser("folders", browserState.target, selectedPath);
    } else {
      closeBrowser();
    }
  };

  const stagingServer = stagingServers.find((s) => s.id === selectedStagingId);
  const showGenerationProgress = !runState?.allCompleted;
  const hasSelectedRouting = selectedSvcs.has("routing");
  const hasSelectedSearch = selectedSvcs.has("search");
  const hasSelectedTile = selectedSvcs.has("tile");

  const canMove = selectedSvcs.size > 0
    && !!selectedStagingId
    && (!hasSelectedRouting || !!routingSourcePath.trim())
    && (!hasSelectedSearch || !!searchSourcePath.trim())
    && (!hasSelectedTile || !!tileSourcePath.trim())
    && !!destinationSourcePath.trim()
    && !editingRoutingSource
    && !editingSearchSource
    && !editingTileSource
    && !editingDest
    && !loading;

  const handleMove = async () => {
    if (!canMove || !stagingServer) return;
    await onMoveToStaging({
      services: Array.from(selectedSvcs),
      stagingServerId: stagingServer.id,
      stagingServerName: stagingServer.name,
      routingSourcePath: hasSelectedRouting ? routingSourcePath.trim() : undefined,
      searchSourcePath: hasSelectedSearch ? searchSourcePath.trim() : undefined,
      tileSourcePath: hasSelectedTile ? tileSourcePath.trim() : undefined,
      destinationSourcePath: destinationSourcePath.trim(),
      backupEnabled,
      isNotify,
    });
  };

  const moveBtnLabel = () => {
    if (loading) return "Moving...";
    if (!selectedStagingId) return "Select a staging server";
    if (hasSelectedRouting && !routingSourcePath.trim()) return "Enter routing source path";
    if (hasSelectedSearch && !searchSourcePath.trim()) return "Enter search source path";
    if (hasSelectedTile && !tileSourcePath.trim()) return "Enter tile source path";
    if (editingRoutingSource || editingSearchSource || editingTileSource) return "Save source paths first";
    if (!destinationSourcePath.trim()) return "Enter destination source path";
    if (editingDest) return "Save path first";
    return "Move to Staging";
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border bg-blue-500/5 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Terminal className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Development</h3>
          <p className="text-xs text-muted-foreground">Initial Generation</p>
        </div>
      </div>

      {generation ? (
        <div className="px-5 py-4 space-y-4 flex-1">
          {showGenerationProgress && (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Generation</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-semibold text-foreground">
                    RunID: {generation.name || generation._id}
                  </span>
                </div>
              </div>
              {runState && <ServiceRunStatusPanel runState={runState} />}
            </>
          )}

          <div className="space-y-4 pt-1 border-t border-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">Move to Staging</p>

            {/* Service checkboxes */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Select services to transfer</p>
              <div className="space-y-1">
                {generation.services.map((s) => {
                  const checked = selectedSvcs.has(s.service);
                  const svcInfo = runState?.services.find((r) => r.service === s.service);
                  return (
                    <label key={s.service} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleSvc(s.service)}>
                      <div className="flex-shrink-0">
                        {checked
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-medium text-foreground">{s.service}</p>
                        {s.version && <p className="text-[10px] text-muted-foreground">v{s.version}</p>}
                      </div>
                      {svcInfo && (
                        <span className={`text-[10px] font-mono font-medium shrink-0 ${svcStatusClass(svcInfo.status)}`}>
                          {svcStatusLabel(svcInfo.status)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Staging server selector */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">To Staging Server</p>
              {stagingServersLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading staging servers…
                </div>
              ) : stagingServers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 py-1">No staging servers available</p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedStagingId}
                    onChange={(e) => { setSelectedStagingId(e.target.value); setBrowserState(null); }}
                    className="w-full px-3 py-2 bg-background border border-blue-500/25 rounded-lg text-xs text-foreground font-mono appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select staging server…</option>
                    {stagingServers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {s.ipAddress}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Per-service source paths */}
            {selectedStagingId && hasSelectedRouting && (
              <div className="space-y-1.5">
                <PathInput
                  label="Routing Source Path"
                  value={routingSourcePath}
                  onChange={setRoutingSourcePath}
                  editing={editingRoutingSource}
                  onEdit={() => setEditingRoutingSource(true)}
                  onSave={handleSaveRoutingSource}
                  onCancel={() => { setEditingRoutingSource(false); setRoutingSourceError(""); }}
                  placeholder="/home/mkandula/Projects/TileGen/Gen/berlin-latest"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!stagingServer || editingRoutingSource}
                    onClick={() => openBrowser("folders", "routing", routingSourcePath)}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    View folders
                  </button>
                </div>
                {routingSourceError && <p className="text-[10px] text-red-500">{routingSourceError}</p>}
                {browserState?.open && browserState.target === "routing" && (
                  <div className="rounded-xl border border-blue-500/20 bg-background p-3 text-[10px] text-foreground">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1 mr-2">
                        <span className="font-semibold shrink-0">Browsing:</span>
                      </div>
                      <button type="button" onClick={closeBrowser} className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 bg-blue-500/10 rounded-lg shrink-0">Done</button>
                    </div>
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={browserState.search || ""}
                      onChange={(e) => setBrowserState(prev => prev ? { ...prev, search: e.target.value } : null)}
                      className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[10px] mb-2 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {browserState.loading ? (
                      <div className="text-xs text-muted-foreground py-4 flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                      </div>
                    ) : browserState.items.filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase())).length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">{browserState.search ? "No matching files found" : "No folders found"}</div>
                    ) : (
                      <div className="grid gap-1 max-h-40 overflow-y-auto">
                        {browserState.items
                          .filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase()))
                          .map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => applyBrowserSelection(item)}
                            className="w-full text-left rounded-lg px-2 py-1 hover:bg-blue-500/10 flex items-center gap-2 group"
                          >
                            <Folder className="w-3 h-3 text-amber-500" />
                            <span className="truncate">{item}</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {selectedStagingId && hasSelectedSearch && (
              <div className="space-y-1.5">
                <PathInput
                  label="Search Source Path"
                  value={searchSourcePath}
                  onChange={setSearchSourcePath}
                  editing={editingSearchSource}
                  onEdit={() => setEditingSearchSource(true)}
                  onSave={handleSaveSearchSource}
                  onCancel={() => { setEditingSearchSource(false); setSearchSourceError(""); }}
                  placeholder="/home/mkandula/Projects/TileGen/Gen/berlin-latest"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!stagingServer || editingSearchSource}
                    onClick={() => openBrowser("folders", "search", searchSourcePath)}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    View folders
                  </button>
                </div>
                {searchSourceError && <p className="text-[10px] text-red-500">{searchSourceError}</p>}
                {browserState?.open && browserState.target === "search" && (
                  <div className="rounded-xl border border-blue-500/20 bg-background p-3 text-[10px] text-foreground">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1 mr-2">
                        <span className="font-semibold shrink-0">Browsing:</span>
                      </div>
                      <button type="button" onClick={closeBrowser} className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 bg-blue-500/10 rounded-lg shrink-0">Done</button>
                    </div>
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={browserState.search || ""}
                      onChange={(e) => setBrowserState(prev => prev ? { ...prev, search: e.target.value } : null)}
                      className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[10px] mb-2 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {browserState.loading ? (
                      <div className="text-xs text-muted-foreground py-4 flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                      </div>
                    ) : browserState.items.filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase())).length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">{browserState.search ? "No matching files found" : "No folders found"}</div>
                    ) : (
                      <div className="grid gap-1 max-h-40 overflow-y-auto">
                        {browserState.items
                          .filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase()))
                          .map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => applyBrowserSelection(item)}
                            className="w-full text-left rounded-lg px-2 py-1 hover:bg-blue-500/10 flex items-center gap-2 group"
                          >
                            <Folder className="w-3 h-3 text-amber-500" />
                            <span className="truncate">{item}</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {selectedStagingId && hasSelectedTile && (
              <div className="space-y-1.5">
                <PathInput
                  label="Tile Source Path"
                  value={tileSourcePath}
                  onChange={setTileSourcePath}
                  editing={editingTileSource}
                  onEdit={() => setEditingTileSource(true)}
                  onSave={handleSaveTileSource}
                  onCancel={() => { setEditingTileSource(false); setTileSourceError(""); }}
                  placeholder="/home/mkandula/Projects/TileGen/Gen/berlin-latest"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!stagingServer || editingTileSource}
                    onClick={() => openBrowser("folders", "tile", tileSourcePath)}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    View folders
                  </button>
                </div>
                {tileSourceError && <p className="text-[10px] text-red-500">{tileSourceError}</p>}
                {browserState?.open && browserState.target === "tile" && (
                  <div className="rounded-xl border border-blue-500/20 bg-background p-3 text-[10px] text-foreground">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1 mr-2">
                        <span className="font-semibold shrink-0">Browsing:</span>
                        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
                        </div>
                      </div>
                      <button type="button" onClick={closeBrowser} className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 bg-blue-500/10 rounded-lg shrink-0">Done</button>
                    </div>
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={browserState.search || ""}
                      onChange={(e) => setBrowserState(prev => prev ? { ...prev, search: e.target.value } : null)}
                      className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[10px] mb-2 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {browserState.loading ? (
                      <div className="text-xs text-muted-foreground py-4 flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                      </div>
                    ) : browserState.items.filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase())).length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">{browserState.search ? "No matching files found" : "No folders found"}</div>
                    ) : (
                      <div className="grid gap-1 max-h-40 overflow-y-auto">
                        {browserState.items
                          .filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase()))
                          .map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => applyBrowserSelection(item)}
                            className="w-full text-left rounded-lg px-2 py-1 hover:bg-blue-500/10 flex items-center gap-2 group"
                          >
                            <Folder className="w-3 h-3 text-amber-500" />
                            <span className="truncate">{item}</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedStagingId && (
              <div className="space-y-1.5">
                <PathInput
                  label="Destination Source Path"
                  value={destinationSourcePath}
                  onChange={setDestinationSourcePath}
                  editing={editingDest}
                  onEdit={() => setEditingDest(true)}
                  onSave={handleSaveDest}
                  onCancel={() => { setEditingDest(false); setDestError(""); }}
                  placeholder="/home/mkandula/Projects/TileGen/Gen/berlin-latest"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!stagingServer || editingDest}
                    onClick={() => openBrowser("folders", "destination", destinationSourcePath)}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    View folders
                  </button>
                </div>
                {destError && <p className="text-[10px] text-red-500">{destError}</p>}
                {browserState?.open && browserState.target === "destination" && (
                  <div className="rounded-xl border border-blue-500/20 bg-background p-3 text-[10px] text-foreground">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1 mr-2">
                        <span className="font-semibold shrink-0">Browsing:</span>
                        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
                        </div>
                      </div>
                      <button type="button" onClick={closeBrowser} className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 bg-blue-500/10 rounded-lg shrink-0">Done</button>
                    </div>
                    {browserState.loading ? (
                      <div className="text-xs text-muted-foreground py-4 flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                      </div>
                    ) : browserState.items.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">No folders found</div>
                    ) : (
                      <div className="grid gap-1 max-h-40 overflow-y-auto">
                        {browserState.items.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => applyBrowserSelection(item)}
                            className="w-full text-left rounded-lg px-2 py-1 hover:bg-blue-500/10 flex items-center gap-2 group"
                          >
                            <Folder className="w-3 h-3 text-amber-500" />
                            <span className="truncate">{item}</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {destinationSourcePath && !editingDest && stagingServer && (
                  <p className="text-[9px] text-muted-foreground font-mono">
                    Files will land on <span className="font-semibold">{stagingServer.name}</span> at this path
                  </p>
                )}
              </div>
            )}

            {selectedStagingId && (
              <>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBackupEnabled(!backupEnabled)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${backupEnabled
                        ? "bg-blue-600/10 text-blue-700 border border-blue-600/30 shadow-sm"
                        : "bg-muted text-muted-foreground border border-border"
                      }`}
                  >
                    {backupEnabled ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Backup
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsNotify(!isNotify)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${isNotify
                        ? "bg-blue-600/10 text-blue-700 border border-blue-600/30 shadow-sm"
                        : "bg-muted text-muted-foreground border border-border"
                      }`}
                  >
                    {isNotify ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Notify
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!canMove}
                  onClick={handleMove}
                  className="flex items-center gap-2 w-full justify-center bg-blue-600 text-white px-3 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ArrowRight className="w-3.5 h-3.5" />}
                  {moveBtnLabel()}
                </button>
              </>
            )}
          </div>
        </div>
      ) : emptyVersion ? (
        <EmptyPipelineVersionCard version={emptyVersion} />
      ) : (
        <div className="px-5 py-16 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="w-5 h-5 text-muted-foreground/25" />
          <p className="text-xs text-muted-foreground/50">No generation running</p>
          <p className="text-[10px] text-muted-foreground/40">Click "Create Generation" to start</p>
        </div>
      )}
    </div>
  );
}

// ─── Staging Card ─────────────────────────────────────────────────────────────

interface StagingCardProps {
  generation: GenerationRecord | null;
  prodServers: ServerType[];
  prodServersLoading: boolean;
  stagingServerName: string;
  sourcePath: string;
  currentVersion: string | null;
  emptyVersion: string | null;
  onMoveToProduction: (serverId: string, services: string[], destination: string, backupEnabled: boolean, backupPath: string, isNotify: boolean) => Promise<void>;
  loading: boolean;
  movingServices: string[];
}

function StagingCard({
  generation,
  prodServers,
  prodServersLoading,
  stagingServerName,
  sourcePath,
  currentVersion,
  emptyVersion,
  onMoveToProduction,
  loading,
  movingServices,
}: StagingCardProps) {
  const [selectedSvcs, setSelectedSvcs] = useState<Set<string>>(new Set());
  const [selectedProdId, setSelectedProdId] = useState("");
  const [destination, setDestination] = useState("");
  const [editingDest, setEditingDest] = useState(false);
  const [destError, setDestError] = useState("");
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [isNotify, setIsNotify] = useState(true);

  const getStagingTransferForService = (service: { service: string; transfers?: any[] }) => {
    const transfers: any[] = Array.isArray(service.transfers) ? service.transfers : [];
    return transfers.find(
      (t: any) => String(t.moveto ?? "").toUpperCase() === "STAGING"
    ) ?? transfers[transfers.length - 1] ?? null;
  };

  const isStagingServiceCompleted = (service: { service: string; transfers?: any[] }) => {
    const stagingTransfer = getStagingTransferForService(service);
    return stagingTransfer ? isRawSuccessStatus(getTransferMoveStatus(stagingTransfer, service.service)) : false;
  };

  useEffect(() => {
    if (generation) {
      const completedServices = generation.services
        .filter(isStagingServiceCompleted)
        .map((s) => s.service);
      setSelectedSvcs(new Set(completedServices.length ? completedServices : generation.services.map((s) => s.service)));
    }
    setSelectedProdId(""); setDestination(""); setEditingDest(false); setDestError(""); setBrowserState(null);
    setBackupEnabled(true);
    setIsNotify(true);
  }, [generation?._id]);

  useEffect(() => {
    if (!selectedProdId) {
      setDestination("");
      setBrowserState(null);
      return;
    }

    const fetchServerPath = async () => {
      try {
        const res = await api.post("/admin-dashboard/pipeline-config/server-path", {
          version: currentVersion || "v1.0",
        });
        const serverPaths = res.data?.data?.serverPaths || res.data?.serverPaths || {};
        const paths = flattenServerPaths(serverPaths);
        const pathInfo = paths.find((path) => (path.targetServerId || path.serverId) === selectedProdId);
        setDestination(pathInfo?.outputPath || "/home");
      } catch (error) {
        console.error("Failed to fetch production server path:", error);
        setDestination("/home");
      }
    };

    fetchServerPath();
  }, [selectedProdId, currentVersion]);

  const toggleSvc = (svc: string) =>
    setSelectedSvcs((prev) => { const n = new Set(prev); n.has(svc) ? n.delete(svc) : n.add(svc); return n; });

  const handleSaveDest = () => {
    if (!destination.trim()) { setDestError("Path is required"); return; }
    if (!destination.startsWith("/")) { setDestError("Path must start with /"); return; }
    setDestError(""); setEditingDest(false);
  };



  const prodServer = prodServers.find((s) => s.id === selectedProdId);
  const completedStagingServices = generation?.services.filter(isStagingServiceCompleted) ?? [];
  const selectedCompletedServices = completedStagingServices.filter((s) => selectedSvcs.has(s.service));
  const hasCompletedStagingServices = completedStagingServices.length > 0;
  const canMove = !!selectedProdId && selectedCompletedServices.length > 0 && !!destination.trim() && !editingDest && !loading;

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

  const closeBrowser = () => setBrowserState(null);

  const openProductionFolders = async (path = destination) => {
    const browseServerUser = prodServer?.username?.trim() || prodServer?.name?.trim() || "";
    if (!browseServerUser) {
      toast.error("Select a production server first.");
      return;
    }

    const basePath = normalizeBrowsePath(path);
    setBrowserState({ open: true, mode: "folders", target: "destination", basePath, items: [], loading: true, search: "" });
    try {
      const items = await listServerFolders(browseServerUser, basePath);
      setBrowserState((prev) => prev ? { ...prev, items, loading: false, error: undefined } : null);
      if (items.length === 0) toast.info("No subfolders found.");
    } catch {
      setBrowserState((prev) => prev ? { ...prev, items: [], loading: false, error: "Unable to load items." } : null);
      toast.error("Failed to browse server path.");
    }
  };

  const applyBrowserSelection = (item: string) => {
    if (!browserState) return;
    const selectedPath = buildBrowserPath(browserState.basePath, item);
    setDestination(selectedPath);
    openProductionFolders(selectedPath);
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border bg-amber-500/5 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Package className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Staging</h3>
          <p className="text-xs text-muted-foreground">Ready for Testing</p>
        </div>
      </div>

      {generation || movingServices.length > 0 ? (
        <div className="px-5 py-4 space-y-4 flex-1">
          {generation && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Staging</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-mono font-semibold text-foreground">
                  RunID: {generation.name || generation._id}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-amber-600 bg-amber-500/10 border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />Staged
                </span>
              </div>
            </div>
          )}

          {/* Services list */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Services</p>
            <div className="space-y-1">
              {/* In-progress moving services */}
              {movingServices.map((svc) => (
                <div key={`moving-${svc}`} className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/20 border border-border/50">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-medium text-muted-foreground">{svc}</p>
                    <p className="text-[10px] text-muted-foreground">Moving to staging…</p>
                  </div>
                </div>
              ))}

              {/* Completed staged services */}
              {generation?.services.map((s) => {
                const checked = selectedSvcs.has(s.service);
                const stagingTransfer = getStagingTransferForService(s);
                const moveStatus = stagingTransfer ? getTransferMoveStatus(stagingTransfer, s.service) : "";
                const isMoveCompleted = isRawSuccessStatus(moveStatus);
                const isMoveFailed = ["failed", "error"].includes(moveStatus);

                return (
                  <div key={s.service} className="space-y-2">
                    <label
                      className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${isMoveCompleted ? "hover:bg-muted/30 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
                      onClick={() => isMoveCompleted && toggleSvc(s.service)}
                    >
                      <div className="flex-shrink-0">
                        {checked
                          ? <CheckSquare className="w-4 h-4 text-amber-600" />
                          : <Square className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-medium text-foreground">{s.service}</p>
                        {s.version && <p className="text-[10px] text-muted-foreground">v{s.version}</p>}
                      </div>
                      {isMoveCompleted && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                      {isMoveFailed && (
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                    </label>

                    {stagingTransfer && (
                      <div className="ml-8 mr-2 p-2.5 bg-muted/30 rounded-lg border border-border/50 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          {isMoveCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : isMoveFailed ? (
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                          ) : (
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                          )}
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${isMoveCompleted ? "text-emerald-600" : isMoveFailed ? "text-red-500" : "text-blue-500"}`}>
                            {isMoveCompleted ? "Transfer Successful" : isMoveFailed ? "Transfer Failed" : "Transfer Pending"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[10px] font-mono">
                          <span className="text-muted-foreground/60 text-right">Service:</span>
                          <span className="text-foreground break-all">{s.service}</span>
                          {/* from: top-level doc.from (array of server objects) */}
                          <span className="text-muted-foreground/60 text-right">From:</span>
                          <span className="text-foreground break-all">
                            {Array.isArray(stagingTransfer.from)
                              ? stagingTransfer.from.map((f: any) => f.name || f.host || f).join(", ")
                              : (stagingTransfer.from?.name || stagingTransfer.from?.host || stagingTransfer.from || "—")}
                          </span>
                          {/* to: top-level doc.to (single server object) */}
                          <span className="text-muted-foreground/60 text-right">To:</span>
                          <span className="text-foreground break-all">
                            {stagingTransfer.to?.name || stagingTransfer.to?.host || stagingTransfer.to || stagingTransfer.targetEnv || "—"}
                          </span>
                          {/* source: per-service transfer entry source path */}
                          <span className="text-muted-foreground/60 text-right">Source:</span>
                          <span className="text-muted-foreground break-all">{stagingTransfer.source || "—"}</span>
                          {/* destination: per-service transfer entry destination path */}
                          <span className="text-muted-foreground/60 text-right">Dest:</span>
                          <span className="text-muted-foreground break-all">{stagingTransfer.destination || "—"}</span>
                          {/* fileName: top-level doc.fileName */}
                          {stagingTransfer.fileName && (
                            <>
                              <span className="text-muted-foreground/60 text-right">File:</span>
                              <span className="text-muted-foreground break-all">{stagingTransfer.fileName}</span>
                            </>
                          )}
                          {/* targetEnv: top-level doc.targetEnv */}
                          {stagingTransfer.targetEnv && (
                            <>
                              <span className="text-muted-foreground/60 text-right">Target Env:</span>
                              <span className="text-muted-foreground break-all">{stagingTransfer.targetEnv}</span>
                            </>
                          )}
                        </div>
                        {/* results: top-level doc.results */}
                        {Array.isArray(stagingTransfer.results) && stagingTransfer.results.length > 0 && (
                          <div className="pt-1.5 border-t border-border/40">
                            <span className="text-[9px] text-muted-foreground/60">
                              Results: {stagingTransfer.results.length} item(s)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Move to production - shown when at least one staged service completed transfer */}
          {hasCompletedStagingServices && (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  To Production Server
                </p>
                {prodServersLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading production servers…
                  </div>
                ) : prodServers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 py-1">No production servers available</p>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedProdId}
                      onChange={(e) => { setSelectedProdId(e.target.value); setDestination(""); setBrowserState(null); }}
                      className="w-full px-3 py-2 bg-background border border-amber-500/25 rounded-lg text-xs text-foreground font-mono appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">Select production server…</option>
                      {prodServers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {s.ipAddress}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>

              {prodServer && sourcePath && (
                <div className="text-[10px] font-mono text-muted-foreground break-all">
                  <span className="text-muted-foreground/50">source: </span>{sourcePath}
                </div>
              )}

              {selectedProdId && (
                <div className="space-y-1.5">
                  <PathInput
                    label="Destination Path on Production Server"
                    value={destination}
                    onChange={setDestination}
                    editing={editingDest}
                    onEdit={() => setEditingDest(true)}
                    onSave={handleSaveDest}
                    onCancel={() => { setEditingDest(false); setDestError(""); }}
                    placeholder="/home/mkandula/Projects/TileGen/Gen/berlin-latest"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!prodServer || editingDest}
                      onClick={() => openProductionFolders()}
                      className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 disabled:opacity-40"
                    >
                      View folders
                    </button>
                  </div>
                  {destError && <p className="text-[10px] text-red-500">{destError}</p>}
                  {browserState?.open && (
                    <div className="rounded-xl border border-amber-500/20 bg-background p-3 text-[10px] text-foreground">
                      <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={closeBrowser} className="text-amber-600 hover:text-amber-800 font-bold px-2 py-1 bg-amber-500/10 rounded-lg shrink-0">Done</button>
                      </div>
                      <input
                        type="text"
                        placeholder="Search files..."
                        value={browserState.search || ""}
                        onChange={(e) => setBrowserState(prev => prev ? { ...prev, search: e.target.value } : null)}
                        className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[10px] mb-2 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      {browserState.loading ? (
                        <div className="text-xs text-muted-foreground py-4 flex items-center justify-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                        </div>
                      ) : browserState.items.filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase())).length === 0 ? (
                        <div className="text-xs text-muted-foreground py-4 text-center">{browserState.search ? "No matching files found" : "No folders found"}</div>
                      ) : (
                        <div className="grid gap-1 max-h-40 overflow-y-auto">
                          {browserState.items
                            .filter(item => !browserState.search || item.toLowerCase().includes(browserState.search.toLowerCase()))
                            .map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => applyBrowserSelection(item)}
                              className="w-full text-left rounded-lg px-2 py-1 hover:bg-amber-500/10 flex items-center gap-2 group"
                            >
                              <Folder className="w-3 h-3 text-amber-500" />
                              <span className="truncate">{item}</span>
                              <ChevronRight className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {destination && !editingDest && prodServer && (
                    <p className="text-[9px] text-muted-foreground font-mono">
                      Files will land on <span className="font-semibold">{prodServer.name}</span> at this path
                    </p>
                  )}

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBackupEnabled(!backupEnabled)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${backupEnabled
                          ? "bg-amber-600/10 text-amber-700 border border-amber-600/30 shadow-sm"
                          : "bg-muted text-muted-foreground border border-border"
                        }`}
                    >
                      {backupEnabled ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      Backup
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsNotify(!isNotify)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${isNotify
                          ? "bg-amber-600/10 text-amber-700 border border-amber-600/30 shadow-sm"
                          : "bg-muted text-muted-foreground border border-border"
                        }`}
                    >
                      {isNotify ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      Notify
                    </button>
                  </div>
                </div>
              )}

              {selectedProdId && (
                <button
                  type="button"
                  disabled={!canMove}
                  onClick={() => canMove && onMoveToProduction(selectedProdId, selectedCompletedServices.map((s) => s.service), destination.trim(), backupEnabled, destination.trim(), isNotify)}
                  className="flex items-center gap-2 w-full justify-center bg-amber-600 text-white px-3 py-2.5 rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  {loading ? "Moving..." : selectedCompletedServices.length === 0 ? "Select completed service" : !destination.trim() ? "Enter destination path" : "Move to Production"}
                </button>
              )}
            </>
          )}
        </div>
      ) : emptyVersion ? (
        <EmptyPipelineVersionCard version={emptyVersion} />
      ) : (
        <div className="px-5 py-16 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="w-5 h-5 text-muted-foreground/25" />
          <p className="text-xs text-muted-foreground/50">No generation in staging</p>
        </div>
      )}
    </div>
  );
}

// ─── Production Card ──────────────────────────────────────────────────────────

function ProductionCard({ generations, loading, emptyVersion }: { generations: GenerationRecord[]; loading: boolean; emptyVersion: string | null }) {
  const getProductionTransferForService = (service: { service: string; transfers?: any[] }) => {
    const transfers: any[] = Array.isArray(service.transfers) ? service.transfers : [];
    return (
      transfers.find((t: any) => String(t.moveto ?? "").toUpperCase() === "PRODUCTION" && (t.from || t.to)) ??
      transfers.find((t: any) => String(t.moveto ?? "").toUpperCase() === "PRODUCTION") ??
      transfers[transfers.length - 1] ??
      null
    );
  };

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-card overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border bg-purple-500/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Production</h3>
            <p className="text-xs text-muted-foreground">Live Deployments</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border max-h-[480px] overflow-y-auto flex-1">
        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : generations.length === 0 && emptyVersion ? (
          <EmptyPipelineVersionCard version={emptyVersion} />
        ) : generations.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="w-5 h-5 text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground/50">No deployments in production</p>
          </div>
        ) : (
          generations.map((gen) => (
            <div key={gen._id} className="px-5 py-4 space-y-3">
              {/* Header — no click, always expanded */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-600 shrink-0 font-mono">
                  {(gen.name || gen._id).slice(-4)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground font-mono truncate">
                    {gen.name || gen._id}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {gen.services.length} service{gen.services.length !== 1 ? "s" : ""}
                    {gen.createdAt && <span className="ml-2">{formatTs(gen.createdAt)}</span>}
                  </p>
                </div>
              </div>

              {/* Services — always visible */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Services
                </p>
                {gen.services.map((s) => {
                  const prodTransfer = getProductionTransferForService(s);
                  const moveStatus = prodTransfer ? getTransferMoveStatus(prodTransfer, s.service) : "";
                  const isMoveCompleted = isRawSuccessStatus(moveStatus);
                  const isMoveFailed = ["failed", "error"].includes(moveStatus);

                  return (
                    <div key={s.service} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-medium border font-mono ${SERVICE_TAG_COLOR[s.service] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {s.service}
                        </span>
                        {isMoveCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        {isMoveFailed && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        {!isMoveCompleted && !isMoveFailed && prodTransfer && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />}
                      </div>

                      {prodTransfer && (
                        <div className="ml-1 p-2.5 bg-muted/30 rounded-lg border border-border/50 space-y-1.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            {isMoveCompleted ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : isMoveFailed ? <XCircle className="w-3.5 h-3.5 text-red-500" /> : <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${isMoveCompleted ? "text-emerald-600" : isMoveFailed ? "text-red-500" : "text-blue-500"}`}>
                              {isMoveCompleted ? "Transfer Successful" : isMoveFailed ? "Transfer Failed" : "Transfer Pending"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[10px] font-mono">
                            <span className="text-muted-foreground/60 text-right">From:</span>
                            <span className="text-foreground break-all">
                              {Array.isArray(prodTransfer.from)
                                ? prodTransfer.from.map((f: any) => f.name || f.host || f).join(", ")
                                : (prodTransfer.from?.name || prodTransfer.from?.host || prodTransfer.from || "—")}
                            </span>
                            <span className="text-muted-foreground/60 text-right">To:</span>
                            <span className="text-foreground break-all">{prodTransfer.to?.name || prodTransfer.to?.host || prodTransfer.to || prodTransfer.targetEnv || "—"}</span>
                            <span className="text-muted-foreground/60 text-right">Source:</span>
                            <span className="text-muted-foreground break-all">{prodTransfer.source || "—"}</span>
                            <span className="text-muted-foreground/60 text-right">Dest:</span>
                            <span className="text-muted-foreground break-all">{prodTransfer.destination || "—"}</span>
                            {prodTransfer.fileName && (<><span className="text-muted-foreground/60 text-right">File:</span><span className="text-muted-foreground break-all">{prodTransfer.fileName}</span></>)}
                          </div>
                          {Array.isArray(prodTransfer.results) && prodTransfer.results.length > 0 && (
                            <div className="pt-1.5 border-t border-border/40">
                              <span className="text-[9px] text-muted-foreground/60">Results: {prodTransfer.results.length} item(s)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── POI Banner ───────────────────────────────────────────────────────────────

function ApprovedPOISection({ count, loading, onStart }: { count: number; loading: boolean; onStart: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-orange-500/30 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Approved POI Contributions</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : <><span className="font-semibold text-orange-600">{count} POI{count !== 1 ? "s" : ""}</span> approved but not yet live</>}
            </p>
          </div>
        </div>
        {!loading && count > 0 && <span className="text-xs font-bold text-orange-600 bg-orange-500/10 rounded-full px-2 py-0.5 font-mono">{count}</span>}
      </div>
      <div className="border-t border-border px-5 py-3 flex items-center gap-2">
        <button type="button" disabled={loading || count === 0} onClick={onStart} className="flex items-center gap-1.5 bg-orange-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">
          <Play className="w-3.5 h-3.5" />Start Generation
        </button>
        <button type="button" onClick={() => navigate("/contributions/poi")} className="flex items-center gap-1.5 bg-muted text-foreground px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-muted/80 border border-border transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />View Contributions
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataPipeline() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createOpenForContrib, setCreateOpenForContrib] = useState(false);
  const [allowFailedDownloadGeneration, setAllowFailedDownloadGeneration] = useState(false);

  const [allServers, setAllServers] = useState<ServerType[]>([]);
  const [allServersLoading, setAllServersLoading] = useState(true);
  const [stagingServers, setStagingServers] = useState<ServerType[]>([]);
  const [prodServers, setProdServers] = useState<ServerType[]>([]);
  const [stagingServersLoading, setStagingServersLoading] = useState(false);
  const [prodServersLoading, setProdServersLoading] = useState(false);
  const [stagingLoading, setStagingLoading] = useState(false);
  const [prodLoading, setProdLoading] = useState(false);

  const [approvedPOICount, setApprovedPOICount] = useState(0);
  const [poiLoading, setPoiLoading] = useState(true);

  const [devGeneration, setDevGeneration] = useState<GenerationRecord | null>(null);
  const [stagingGeneration, setStagingGeneration] = useState<GenerationRecord | null>(null);
  const [prodGenerations, setProdGenerations] = useState<GenerationRecord[]>([]);

  const [runState, setRunState] = useState<PipelineRunState | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagingPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPipelineLoadRef = useRef(false);
  // Ref to track polling state without triggering re-renders
  const stagingPollActiveRef = useRef(false);

  // Services currently being moved to staging (showing spinner in staging card)
  const [stagingMoveRemaining, setStagingMoveRemaining] = useState<string[]>([]);

  const [devServerName, setDevServerName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [stagingServerName, setStagingServerName] = useState("");
  const [serviceTransfers, setServiceTransfers] = useState<GenerationServiceTransferMeta[]>([]);

    const [currentVersion, setCurrentVersion] = useState<string | null>(() => new URLSearchParams(window.location.search).get("version")?.trim() || localStorage.getItem("pipeline_version") || null);
    const [emptyPipelineVersion, setEmptyPipelineVersion] = useState<string | null>(null);
    const [downloadStatuses, setDownloadStatuses] = useState<any[]>([]);
    const [downloadStatusesLoaded, setDownloadStatusesLoaded] = useState(false);
    const [downloadSetup, setDownloadSetup] = useState<DownloadSetupState>({
      open: false,
      step: "version",
      versions: [],
      loadingVersions: false,
      addingVersion: false,
      creatingVersion: false,
      newVersion: "",
      selectedVersion: "",
      selectedServerId: "",
      selectedService: "",
    });

  const fetchCurrentVersion = useCallback(async () => {
    try {
      const res = await api.get("/admin-dashboard/pipeline-config/current-version");
      const fromApi = (res.data?.version || res.data?.data?.version || "") as string;
      const version = searchParams.get("version")?.trim() || fromApi.trim() || localStorage.getItem("pipeline_version") || null;
      if (version) {
        localStorage.setItem("pipeline_version", version);
        setCurrentVersion(version);
        return version;
      }
    } catch (error) {
      console.error("Failed to fetch current version:", error);
    }
    return null;
  }, [searchParams]);

    useEffect(() => {
      if (searchParams.get("createGeneration") !== "true") return;
      const selectedVersion = searchParams.get("version")?.trim() || (currentVersion ?? "") || localStorage.getItem("pipeline_version") || null;
      if (selectedVersion) {
        localStorage.setItem("pipeline_version", selectedVersion);
        setCurrentVersion(selectedVersion);
      }
      setAllowFailedDownloadGeneration(searchParams.get("allowFailedDownload") === "true");
      setCreateOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("createGeneration");
      nextParams.delete("allowFailedDownload");
      setSearchParams(nextParams, { replace: true });
    }, [currentVersion, searchParams, setSearchParams]);

    const openDownloadSetup = useCallback(async () => {
      setDownloadSetup({
        open: true,
        step: "version",
        versions: [],
        loadingVersions: true,
        addingVersion: false,
        creatingVersion: false,
        newVersion: "",
        selectedVersion: currentVersion || "",
        selectedServerId: "",
        selectedService: "",
      });

      try {
        const response = await api.get("/admin-dashboard/pipeline-config/versions");
        const versions = extractPipelineVersions(response.data);
        setDownloadSetup((current) => ({
          ...current,
          versions,
          loadingVersions: false,
          selectedVersion: current.selectedVersion || versions[versions.length - 1] || "",
        }));
      } catch (error) {
        console.error("Failed to load pipeline config versions:", error);
        setDownloadSetup((current) => ({ ...current, loadingVersions: false }));
        toast.error("Failed to load pipeline versions.");
      }
    }, [currentVersion]);

    const closeDownloadSetup = () => {
      setDownloadSetup((current) => ({ ...current, open: false }));
    };

    const createDownloadSetupVersion = async () => {
      const version = downloadSetup.newVersion.trim();
      if (!version) {
        toast.error("Enter a version.");
        return;
      }
      if (downloadSetup.versions.includes(version)) {
        setDownloadSetup((current) => ({
          ...current,
          addingVersion: false,
          newVersion: "",
          selectedVersion: version,
        }));
        toast.info("Version already exists. Selected it.");
        return;
      }

      setDownloadSetup((current) => ({ ...current, creatingVersion: true }));
      try {
        await api.post("/admin-dashboard/pipeline-config/add", { version });
        setDownloadSetup((current) => ({
          ...current,
          versions: [...current.versions, version].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
          loadingVersions: false,
          addingVersion: false,
          creatingVersion: false,
          newVersion: "",
          selectedVersion: version,
        }));
        toast.success(`Version ${version} added.`);
      } catch (error: any) {
        console.error("Failed to add pipeline version:", error);
        setDownloadSetup((current) => ({ ...current, creatingVersion: false }));
        toast.error(error?.response?.data?.message || "Failed to add version.");
      }
    };

    const continueDownloadSetup = () => {
      if (downloadSetup.step === "version") {
        if (!downloadSetup.selectedVersion) {
          toast.error("Select a version.");
          return;
        }
        setDownloadSetup((current) => ({ ...current, step: "server" }));
        return;
      }

      if (downloadSetup.step === "server") {
        if (!downloadSetup.selectedServerId) {
          toast.error("Select a server.");
          return;
        }
        setDownloadSetup((current) => ({ ...current, step: "service" }));
        return;
      }

      if (!downloadSetup.selectedService) {
        toast.error("Select a download service.");
        return;
      }

      const params = new URLSearchParams({
        version: downloadSetup.selectedVersion,
        serverId: downloadSetup.selectedServerId,
        workflow: downloadSetup.selectedService,
      });
      localStorage.setItem("pipeline_version", downloadSetup.selectedVersion);
      setCurrentVersion(downloadSetup.selectedVersion);
      navigate(`/pipeline/download?${params.toString()}`);
    };

  // ── Polling: generation status ─────────────────────────────────────────────

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
  }, []);

  const startPolling = useCallback((runId: string, serviceNames: string[], generationId?: string) => {
    clearPolling();
    setRunState({
      runId,
      generationId,
      services: serviceNames.map((s) => ({ service: s, status: "success" })),
      allCompleted: true,
      anyFailed: false,
      pollingActive: false,
    });

    const active = false;
    const poll = async () => {
      return;
      if (!active) return;
      const result = await fetchPipelineStatus(runId);
      if (!result || result.length === 0) {
        if (active) pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      const allCompleted = result.every((s) => s.status === "success");
      const anyFailed = result.some((s) => s.status === "failed");

      setRunState((prev) => ({
        runId,
        generationId: prev?.generationId ?? generationId,
        services: result,
        allCompleted,
        anyFailed,
        pollingActive: !allCompleted && !anyFailed,
      }));

      if (allCompleted) {
        clearPolling();
        toast.success("All services completed — ready to stage!");
        return;
      }
      if (anyFailed) {
        clearPolling();
        toast.error("One or more services failed");
        return;
      }

      if (active) pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  }, [clearPolling]);

  // ── Polling: staging move status ──────────────────────────────────────────

  const stopStagingPoll = useCallback(() => {
    stagingPollActiveRef.current = false;
    if (stagingPollTimerRef.current) {
      clearTimeout(stagingPollTimerRef.current);
      stagingPollTimerRef.current = null;
    }
  }, []);

  const startStagingMovePolling = useCallback((runId: string, servicesToMove: string[]) => {
    stopStagingPoll();

    setStagingMoveRemaining(servicesToMove);
    setStagingGeneration((prev) => (prev?.name === runId ? prev : null));
    stagingPollActiveRef.current = true;

    const poll = async () => {
      if (!stagingPollActiveRef.current) return;

      try {
        const transferDoc = await fetchTransferDocByRunId(runId);
        if (!transferDoc) {
          if (stagingPollActiveRef.current) {
            stagingPollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return;
        }

        setStagingMoveRemaining((prevRemaining) => {
          if (prevRemaining.length === 0) {
            stagingPollActiveRef.current = false;
            return prevRemaining;
          }

          const completed: string[] = [];
          const failed: string[] = [];
          const stillPending: string[] = [];

          for (const svc of prevRemaining) {
            // Use getTransferDocMoveStatus which reads from top-level doc fields
            const moveStatus = getTransferDocMoveStatus(transferDoc, svc, "STAGING");
            if (isRawSuccessStatus(moveStatus)) {
              completed.push(svc);
            } else if (["failed", "error"].includes(moveStatus)) {
              failed.push(svc);
            } else {
              stillPending.push(svc);
            }
          }

          // Update staging generation with newly completed services
          if (completed.length > 0) {
            setStagingGeneration((prev) => {
              const base = prev?.name === runId ? prev : {
                _id: `${runId}-staging`,
                name: runId,
                status: "staging",
                services: [],
                createdAt: transferDoc.createdAt ?? Date.now(),
                updatedAt: transferDoc.updatedAt ?? transferDoc.updated_at ?? transferDoc.createdAt ?? Date.now(),
              };

              const newServices = completed.map((svc) => ({
                service: svc,
                // Enrich with the per-service transfer entries (source/destination paths)
                // and doc-level fields (from, to, moveto, fileName, results, targetEnv)
                transfers: getTransferDocServiceTransfers(transferDoc, svc),
              }));

              // Merge, avoiding duplicates
              const existingNames = new Set(base.services.map((s) => s.service));
              const merged = [
                ...base.services,
                ...newServices.filter((s) => !existingNames.has(s.service)),
              ];

              return { ...base, services: merged };
            });

            completed.forEach((svc) => toast.success(`${svc} moved to staging!`));
          }

          if (failed.length > 0) {
            failed.forEach((svc) => toast.error(`Failed to move ${svc} to staging`));
          }

          const nextRemaining = stillPending;

          if (nextRemaining.length === 0) {
            stagingPollActiveRef.current = false;
            if (completed.length > 0 || failed.length > 0) {
              const allDone = failed.length === 0;
              if (allDone) toast.success("All selected services moved to staging!");
            }
          } else if (stagingPollActiveRef.current) {
            stagingPollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }

          return nextRemaining;
        });
      } catch {
        if (stagingPollActiveRef.current) {
          stagingPollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();
  }, [stopStagingPoll]);

  useEffect(() => {
    return () => {
      clearPolling();
      stopStagingPoll();
    };
  }, [clearPolling, stopStagingPoll]);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadPOI = useCallback(async () => {
    setPoiLoading(true);
    try {
      const res = await api.get("/admin-dashboard/contributors/approved-not-live/count");
      setApprovedPOICount(res.data?.data?.count ?? 0);
    } catch { setApprovedPOICount(0); } finally { setPoiLoading(false); }
  }, []);

  const loadDownloadStatuses = useCallback(async () => {
    setDownloadStatusesLoaded(false);
    try {
      const version = currentVersion || await fetchCurrentVersion();
      if (!version) {
        setDownloadStatuses([]);
        return;
      }
      const res = await api.get("/admin-dashboard/download-status", { params: { version } });
      const statuses = res.data?.data?.statuses ?? res.data?.statuses ?? [];
      setDownloadStatuses(statuses);
    } catch (error) {
      console.error("Failed to load download statuses:", error);
    } finally {
      setDownloadStatusesLoaded(true);
    }
  }, [currentVersion, fetchCurrentVersion]);

  const loadCurrentDevelopmentGeneration = useCallback(async () => {
    try {
      const version = currentVersion || await fetchCurrentVersion();
      const fetchUrl = version
        ? `${FETCH_PIPELINE_URL}?version=${encodeURIComponent(version)}`
        : FETCH_PIPELINE_URL;
      const res = await fetch(fetchUrl);
      if (!res.ok) { setDevGeneration(null); return; }
      const data = await res.json();
      const runs = extractPipelineRuns(data)
        .filter((run) => !!run?.createdAt)
        .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

      if (runs.length === 0) {
        setDevGeneration(null);
        setStagingGeneration(null);
        setStagingServerName("");
        setProdGenerations([]);
        setRunState(null);
        setServiceTransfers([]);
        setEmptyPipelineVersion(version || null);
        return;
      }

      setEmptyPipelineVersion(null);
      const latestRun = runs[0];
      const generation = buildDevelopmentGenerationFromRun(latestRun);
      if (!generation) { setDevGeneration(null); setRunState(null); return; }

      const actualRunId = latestRun.runId ?? latestRun._id ?? generation._id;
      const transferDocs = await fetchTransferDocsByRunId(String(actualRunId));

      // ── Visibility Logic ──────────────────────────────────────────────────

      if (transferDocs.length === 0) {
        // No transfers yet: Show in Development card
        setDevGeneration(generation);

        const [latestStaging, latestProduction] = await Promise.all([
          findLatestTransferGeneration(runs.slice(1), "STAGING"),
          findLatestTransferGeneration(runs.slice(1), "PRODUCTION"),
        ]);

        if (latestStaging?.doc && hasFreshStagingDetails(latestStaging.doc)) {
          setStagingGeneration(latestStaging.generation);
          setStagingServerName(latestStaging.doc.targetEnv || "");
        } else {
          setStagingGeneration(null);
          setStagingServerName("");
        }
        setProdGenerations(latestProduction ? [latestProduction.generation] : []);

        // Build run state for Development card
        const serviceStatuses: ServiceRunInfo[] = generation.services.map((svc) => ({
          service: svc.service,
          status: normalizeServiceStatus(getServiceDataFromRun(latestRun, svc.service)?.status ?? "success"),
          startedAt: toTime(getServiceDataFromRun(latestRun, svc.service)?.createdAt),
          completedAt: toTime(getServiceDataFromRun(latestRun, svc.service)?.endTime),
        }));
        setRunState({
          runId: actualRunId,
          generationId: generation._id,
          services: serviceStatuses,
          allCompleted: serviceStatuses.every((s) => s.status === "success"),
          anyFailed: serviceStatuses.some((s) => s.status === "failed"),
          pollingActive: false,
        });
      } else {
        // Transfers exist: Show in Staging or Production based on moveto
        const stagingDoc = findTransferDocForMove(transferDocs, "STAGING");
        const prodDoc = findTransferDocForMove(transferDocs, "PRODUCTION");

        if (stagingDoc && hasFreshStagingDetails(stagingDoc)) {
          setStagingGeneration(buildGenerationFromTransferDoc(stagingDoc, "STAGING"));
          setStagingServerName(stagingDoc.targetEnv || "");
        } else {
          setStagingGeneration(null);
          setStagingServerName("");
        }

        if (prodDoc) {
          const prGen = buildGenerationFromTransferDoc(prodDoc, "PRODUCTION");
          setProdGenerations(prGen ? [prGen] : []);
        } else {
          const latestProduction = await findLatestTransferGeneration(runs.slice(1), "PRODUCTION");
          setProdGenerations(latestProduction ? [latestProduction.generation] : []);
        }

        // Hide from Development card if it has been moved to transfers
        setDevGeneration(null);
        setRunState(null);
      }

      // Metadata updates
      setSourcePath(generation.outputPath ?? "");
      setDevServerName(generation.devServerName ?? "");
      setServiceTransfers(generation.serviceTransfers ?? []);

    } catch (error) {
      console.error("Failed to load pipeline data:", error);
      setDevGeneration(null);
      setEmptyPipelineVersion(null);
    }
  }, [currentVersion, fetchCurrentVersion, startStagingMovePolling]);

  const loadServers = useCallback(async () => {
    setAllServersLoading(true);
    setStagingServersLoading(true);
    setProdServersLoading(true);
    try {
      const all = await fetchAllServers();
      setAllServers(all);
      setStagingServers(all.filter((s: any) => s.environment === "staging"));
      setProdServers(all.filter((s: any) => s.environment === "production"));
    } catch {
      toast.error("Failed to load server list.");
    } finally {
      setAllServersLoading(false);
      setStagingServersLoading(false);
      setProdServersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
    loadPOI();
    loadDownloadStatuses();
    if (!initialPipelineLoadRef.current) {
      initialPipelineLoadRef.current = true;
      loadCurrentDevelopmentGeneration();
    }
  }, [loadServers, loadPOI, loadCurrentDevelopmentGeneration, loadDownloadStatuses]);

  // ── Handle new generation created ─────────────────────────────────────────

  const handleGenerationCreated = useCallback(async (meta: GenerationCreationMeta) => {
    setDevServerName(meta.devServerName ?? "");
    setSourcePath(meta.sourcePath ?? "");
    setServiceTransfers(meta.serviceTransfers ?? []);
    setStagingMoveRemaining([]);
    stopStagingPoll();

    if (meta.generationId || meta.runId) {
      const preliminary: GenerationRecord = {
        _id: meta.generationId ?? meta.runId ?? "",
        name: meta.runId ?? meta.generationId ?? "",
        status: "generating",
        services: (meta.services || []).map((s) => ({ service: s })),
        outputPath: meta.outputPath,
        devServerName: meta.devServerName,
        serviceTransfers: meta.serviceTransfers,
        createdAt: Date.now(),
      };
      setDevGeneration(preliminary);

    }

    if (meta.runId && meta.services?.length) {
      startPolling(meta.runId, meta.services, meta.generationId);
    }
  }, [startPolling, stopStagingPoll]);

  // ── Move to Staging ───────────────────────────────────────────────────────

  const handleMoveToStaging = async (args: {
    services: string[];
    stagingServerId: string;
    stagingServerName: string;
    routingSourcePath?: string;
    searchSourcePath?: string;
    tileSourcePath?: string;
    destinationSourcePath: string;
    backupEnabled: boolean;
    isNotify: boolean;
  }) => {
    if (!devGeneration) { toast.error("No active generation found"); return; }

    // Use the actual runId (stored in generation.name after our fix)
    const moveRunId = runState?.runId || devGeneration.name || devGeneration._id;
    if (!moveRunId) { toast.error("No runId available"); return; }

    setStagingLoading(true);
    try {
      const fromServer = devServerName || devGeneration.devServerName || "dev";
      const sourcePathValue = sourcePath || devGeneration.outputPath || "";
      const transferMeta = serviceTransfers.length ? serviceTransfers : devGeneration.serviceTransfers ?? [];
      const matchesService = (metaService: string | undefined, service: string) => {
        if (!metaService) return false;
        return metaService === service || (service === "tile" && metaService === "tiles") || (service === "tiles" && metaService === "tile");
      };

      // Group transfers by (from, source) to avoid redundant rsync calls
      const transfersByKey = new Map<string, {
        from: string; to: string; source: string; destination: string; services: string[];
      }>();

      for (const service of args.services) {
        const meta = transferMeta.find((item) => matchesService(item.service, service));
        const generatedService = devGeneration.services.find((item) => matchesService(item.service, service));
        const from = meta?.from || getServiceTargetFromGeneration(devGeneration, service) || fromServer;
        const generatedSource = generatedService?.sourcePath || "";

        let source = sourcePathValue;
        if (service === "routing") source = args.routingSourcePath || meta?.source || generatedSource || sourcePathValue;
        else if (service === "search") source = args.searchSourcePath || meta?.source || generatedSource || sourcePathValue;
        else if (service === "tile") source = args.tileSourcePath || meta?.source || generatedSource || sourcePathValue;
        else source = meta?.source || generatedSource || sourcePathValue;

        const key = `${from}::${source}`;
        if (!transfersByKey.has(key)) {
          transfersByKey.set(key, {
            from,
            to: args.stagingServerName,
            source,
            destination: args.destinationSourcePath,
            services: [],
          });
        }
        // tile → tiles in the payload
        transfersByKey.get(key)!.services.push(service === "tile" ? "tiles" : service);
      }

      const shouldSendBackupPath = Boolean(args.backupEnabled);
      const backupPath = args.destinationSourcePath.trim();
      const transfers = Array.from(transfersByKey.values()).map((transfer) => ({
        ...transfer,
        ...(shouldSendBackupPath ? { backupPath } : {}),
      }));
      const movePayload: MovePayload & { runId: string } = {
        target_env: args.stagingServerName,
        runId: moveRunId,
        backup: shouldSendBackupPath,
        isnotify: args.isNotify,
        moveto: "STAGING",
        version: currentVersion || undefined,
        transfers,
      };

      console.log("[DataPipeline] Move to staging payload:", JSON.stringify(movePayload, null, 2));

      const r = await callMoveApi(movePayload);
      if (!r.ok) { toast.error(r.message ?? "Move API failed"); return; }

      // Optimistically clear dev, set staging server name
      setStagingServerName(args.stagingServerName);
      setStagingGeneration(null);

      // Don't clear devGeneration yet — wait for polling to confirm each service moved
      // Start polling immediately
      startStagingMovePolling(moveRunId, args.services);

      // Clear moved services from dev card immediately
      setDevGeneration((prev) => {
        if (!prev) return null;
        const remaining = prev.services.filter((s) => !args.services.includes(s.service));
        return remaining.length > 0 ? { ...prev, services: remaining } : null;
      });

      // Also clear runState if all dev services are moving
      setRunState((prev) => {
        if (!prev) return null;
        const remaining = prev.services.filter((s) => !args.services.includes(s.service));
        return remaining.length > 0 ? { ...prev, services: remaining } : null;
      });

      toast.success(`Move request sent to staging (${args.stagingServerName})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to move to staging");
    } finally {
      setStagingLoading(false);
    }
  };

  // ── Move to Production ────────────────────────────────────────────────────

  const handleMoveToProduction = async (serverId: string, services: string[], destination: string, backupEnabled: boolean, backupPath: string, isNotify: boolean) => {
    if (!stagingGeneration) { toast.error("No generation in staging"); return; }

    // Fallback for runId if runState was cleared after all services moved to staging
    const moveRunId = runState?.runId || stagingGeneration.name;
    if (!moveRunId) { toast.error("No runId available"); return; }

    setProdLoading(true);
    try {
      const target = prodServers.find((s) => s.id === serverId);
      if (!target) { toast.error("Production server not found"); return; }

      // Group transfers by (from, source) to avoid redundant calls and use specific staging paths
      const transfersByKey = new Map<string, {
        from: string; to: string; source: string; destination: string; services: string[];
      }>();

      for (const service of services) {
        const svcData = stagingGeneration.services.find(s => s.service === service);
        if (!svcData) continue;

        const transfers: any[] = Array.isArray(svcData.transfers) ? svcData.transfers : [];
        // Find the completed staging transfer for this service
        // (enriched transfer entries have moveto set from the doc)
        const stagingTransfer = transfers.find(
          (t: any) => String(t.moveto ?? "").toUpperCase() === "STAGING"
        ) ?? transfers[transfers.length - 1];

        if (!stagingTransfer) continue;

        // "from value take the staging targetEnv" — actual field is doc.targetEnv
        const from = stagingTransfer.targetEnv || stagingServerName || "staging";
        // "source path take the staging destination path of each service" — per-service entry destination
        const source = stagingTransfer.destination || sourcePath || stagingGeneration.outputPath || "";

        const key = `${from}::${source}`;
        if (!transfersByKey.has(key)) {
          transfersByKey.set(key, {
            from,
            to: target.name,
            source,
            destination,
            services: [],
          });
        }
        // Normalize service name: tile -> tiles
        transfersByKey.get(key)!.services.push(service === "tile" ? "tiles" : service);
      }

      const transfers = Array.from(transfersByKey.values()).map((t) => ({
        ...t,
        ...(backupEnabled ? { backupPath: destination } : {}),
      }));

      const movePayload: MovePayload & { runId: string } = {
        target_env: target.name,
        runId: moveRunId,
        backup: backupEnabled,
        isnotify: isNotify,
        moveto: "PRODUCTION",
        version: currentVersion || undefined,
        transfers,
      };

      console.log("[DataPipeline] Move to production payload:", JSON.stringify(movePayload, null, 2));

      const r = await callMoveApi(movePayload);
      if (!r.ok) { toast.error(r.message ?? "Move API failed"); return; }

      const transferDocs = await fetchTransferDocsByRunId(runState?.runId ?? moveRunId);
      const productionTransferDoc = findTransferDocForMove(transferDocs, "PRODUCTION");
      const promotedFromTransfers = productionTransferDoc
        ? buildGenerationFromTransferDoc(productionTransferDoc, "PRODUCTION", services)
        : null;

      if (promotedFromTransfers) {
        setProdGenerations([promotedFromTransfers]);
      } else {
        setProdGenerations([{
          ...stagingGeneration,
          _id: `${moveRunId}-production`,
          name: moveRunId,
          status: "production",
          services: stagingGeneration.services.filter((item) => services.includes(item.service)),
          outputPath: destination,
          createdAt: Date.now(),
        }]);
      }

      // Always clear staging services that were moved, regardless of transfer doc
      const remainingStagingServices = stagingGeneration.services.filter(
        (item) => !services.includes(item.service)
      );
      setStagingGeneration(
        remainingStagingServices.length > 0
          ? { ...stagingGeneration, services: remainingStagingServices }
          : null
      );

      // Also clear sourcePath and stagingServerName if staging is now empty
      if (remainingStagingServices.length === 0) {
        setStagingServerName("");
        setSourcePath("");
      }

      if (!promotedFromTransfers) {
        toast.info("Production transfer requested. Refresh will show updated status.");
      } else {
        toast.info("Production transfer requested. Refresh will show it after transfer details are available.");
      }
      stopStagingPoll();

      toast.success(`Generation promoted to production on ${target.name} 🚀`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to move to production");
    } finally {
      setProdLoading(false);
    }
  };

  // ── Refresh ───────────────────────────────────────────────────────────────

  const hasCompletedSearchTilesDownload = downloadStatuses.some(
    (status: any) => status?.workflow === "searchTiles" && status?.summary?.validatedStatus === "completed",
  );
  const hasFailedSearchTilesDownload = downloadStatuses.some(
    (status: any) =>
      status?.workflow === "searchTiles" &&
      (status?.summary?.validatedStatus === "failed" || status?.status === "failed"),
  );
  const canOpenCreateGeneration =
    hasCompletedSearchTilesDownload ||
    (allowFailedDownloadGeneration && hasFailedSearchTilesDownload);

  useEffect(() => {
    if (!downloadStatusesLoaded) return;
    if (!createOpen || canOpenCreateGeneration) return;

    setCreateOpen(false);
    setAllowFailedDownloadGeneration(false);
    if (searchParams.get("createGeneration") === "true") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("createGeneration");
      nextParams.delete("allowFailedDownload");
      setSearchParams(nextParams, { replace: true });
    }
    toast.error("Download is not completed. Please wait until validatedStatus is completed before moving to Generation.");
  }, [createOpen, canOpenCreateGeneration, downloadStatusesLoaded, searchParams, setSearchParams]);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([loadServers(), loadPOI(), loadCurrentDevelopmentGeneration(), loadDownloadStatuses()]);
  }, [loadServers, loadPOI, loadCurrentDevelopmentGeneration, loadDownloadStatuses]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage data generation from development through production</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {currentVersion && (
            <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border/50 font-mono">
              Version <span className="font-semibold text-foreground">{currentVersion}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshDashboard}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />Refresh
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("setupDownload", "true");
                if (currentVersion) params.set("version", currentVersion);
                navigate(`/pipeline/download?${params.toString()}`);
              }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />Create Generation
            </button>
          </div>
        </div>
      </div>

      {/* POI banner */}
      {!poiLoading && approvedPOICount > 0 && (
        <ApprovedPOISection count={approvedPOICount} loading={poiLoading} onStart={() => setCreateOpenForContrib(true)} />
      )}

      {/* Download Servers Banner */}
      {(() => {
        const searchTilesSrv = downloadStatuses.find(s => s.workflow === "searchTiles" && s.status === "completed")?.targetServer?.name;
        const routingSrv = downloadStatuses.find(s => s.workflow === "routing" && s.status === "completed")?.targetServer?.name;
        if (!searchTilesSrv && !routingSrv) return null;
        return (
          <div className="bg-card border border-blue-500/20 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Server className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Active Download Servers</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {searchTilesSrv && (
                    <span>Search & Tiles: <span className="font-semibold text-blue-600 dark:text-blue-400">{searchTilesSrv}</span></span>
                  )}
                  {searchTilesSrv && routingSrv && <span className="mx-2">|</span>}
                  {routingSrv && (
                    <span>Routing: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{routingSrv}</span></span>
                  )}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pipeline cards */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-mono mb-4 flex items-center gap-2">
          <Zap className="w-3 h-3" />Pipeline Dashboard
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <DevelopmentCard
            generation={devGeneration}
            runState={runState}
            sourcePath={sourcePath}
            devServerName={devServerName}
            currentVersion={currentVersion}
            emptyVersion={emptyPipelineVersion}
            stagingServers={stagingServers}
            stagingServersLoading={stagingServersLoading}
            onMoveToStaging={handleMoveToStaging}
            loading={stagingLoading}
          />
          <StagingCard
            generation={stagingGeneration}
            prodServers={prodServers}
            prodServersLoading={prodServersLoading}
            stagingServerName={stagingServerName}
            sourcePath={sourcePath}
            currentVersion={currentVersion}
            emptyVersion={emptyPipelineVersion}
            onMoveToProduction={handleMoveToProduction}
            loading={prodLoading}
            movingServices={stagingMoveRemaining}
          />
          <ProductionCard generations={prodGenerations} loading={false} emptyVersion={emptyPipelineVersion} />
        </div>
      </div>
      {/* Dialogs */}
      {downloadSetup.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {downloadSetup.step === "version"
                    ? "Select pipeline version"
                    : downloadSetup.step === "server"
                      ? "Select download server"
                      : "Select download service"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {downloadSetup.step === "version"
                    ? "Choose the config version for this download."
                    : downloadSetup.step === "server"
                      ? "Choose the target server for the selected version."
                      : "Choose which service should open on the Download page."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDownloadSetup}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close download setup"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span className={downloadSetup.step === "version" ? "text-primary" : ""}>Version</span>
                <ChevronRight className="h-3 w-3" />
                <span className={downloadSetup.step === "server" ? "text-primary" : ""}>Server</span>
                <ChevronRight className="h-3 w-3" />
                <span className={downloadSetup.step === "service" ? "text-primary" : ""}>Service</span>
              </div>

              {downloadSetup.step === "version" && (
                <div className="space-y-3">
                  <label htmlFor="download-setup-version" className="text-xs font-medium text-foreground">Version</label>
                  <select
                    id="download-setup-version"
                    value={downloadSetup.selectedVersion}
                    onChange={(event) => setDownloadSetup((current) => ({ ...current, selectedVersion: event.target.value }))}
                    disabled={downloadSetup.loadingVersions || downloadSetup.addingVersion}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{downloadSetup.loadingVersions ? "Loading versions..." : "Select version"}</option>
                    {downloadSetup.versions.map((version) => (
                      <option key={version} value={version}>{version}</option>
                    ))}
                  </select>
                  {downloadSetup.addingVersion ? (
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <label htmlFor="download-setup-new-version" className="text-xs font-medium text-foreground">New version</label>
                      <div className="mt-2 flex gap-2">
                        <input
                          id="download-setup-new-version"
                          value={downloadSetup.newVersion}
                          onChange={(event) => setDownloadSetup((current) => ({ ...current, newVersion: event.target.value }))}
                          placeholder="v1.2"
                          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => void createDownloadSetupVersion()}
                          disabled={downloadSetup.creatingVersion}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                        >
                          {downloadSetup.creatingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Add
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDownloadSetup((current) => ({ ...current, addingVersion: false, newVersion: "" }))}
                        className="mt-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        Use existing version
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDownloadSetup((current) => ({ ...current, addingVersion: true, newVersion: "" }))}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-primary transition hover:text-primary/80"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add new version
                    </button>
                  )}
                </div>
              )}

              {downloadSetup.step === "server" && (
                <div className="space-y-2">
                  <label htmlFor="download-setup-server" className="text-xs font-medium text-foreground">Server</label>
                  <select
                    id="download-setup-server"
                    value={downloadSetup.selectedServerId}
                    onChange={(event) => setDownloadSetup((current) => ({ ...current, selectedServerId: event.target.value }))}
                    disabled={allServersLoading}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{allServersLoading ? "Loading servers..." : "Select server"}</option>
                    {allServers.map((server) => {
                      const serverId = String((server as any)._id || server.id || "");
                      return (
                        <option key={serverId} value={serverId}>
                          {server.name}{server.ipAddress ? ` - ${server.ipAddress}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {downloadSetup.step === "service" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "searchTiles" as DownloadWorkflowKey, label: "Search & Tiles", description: "Open Search & Tiles download config." },
                    { value: "routing" as DownloadWorkflowKey, label: "Routing", description: "Open Routing download config." },
                  ].map((service) => {
                    const selected = downloadSetup.selectedService === service.value;
                    return (
                      <button
                        key={service.value}
                        type="button"
                        onClick={() => setDownloadSetup((current) => ({ ...current, selectedService: service.value }))}
                        className={`rounded-xl border px-4 py-3 text-left transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"}`}
                      >
                        <span className="block text-sm font-semibold">{service.label}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{service.description}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  if (downloadSetup.step === "service") setDownloadSetup((current) => ({ ...current, step: "server" }));
                  else if (downloadSetup.step === "server") setDownloadSetup((current) => ({ ...current, step: "version" }));
                  else closeDownloadSetup();
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                {downloadSetup.step === "version" ? "Cancel" : "Back"}
              </button>
              <button
                type="button"
                onClick={continueDownloadSetup}
                disabled={downloadSetup.loadingVersions || downloadSetup.creatingVersion || (downloadSetup.step === "version" && downloadSetup.addingVersion) || allServersLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {downloadSetup.loadingVersions ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {downloadSetup.step === "service" ? "Open Download" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
      <CreateGeneration
        open={createOpen && downloadStatusesLoaded && canOpenCreateGeneration}
        servers={allServers}
        loadingServers={allServersLoading}
        onClose={(meta) => {
          setCreateOpen(false);
          setAllowFailedDownloadGeneration(false);
          if (meta?.runId || meta?.generationId) handleGenerationCreated(meta as GenerationCreationMeta);
        }}
      />
      <CreateGeneration
        open={createOpenForContrib}
        preSelectContribution
        servers={allServers}
        loadingServers={allServersLoading}
        onClose={(meta) => {
          setCreateOpenForContrib(false);
          if (meta?.runId || meta?.generationId) handleGenerationCreated(meta as GenerationCreationMeta);
          loadPOI();
        }}
      />
    </div>
  );
}

async function fetchTransferDocsByRunId(runId: string): Promise<any[]> {
  try {
    const url = `${FETCH_TRANSFERS_URL}?runId=${encodeURIComponent(runId)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const docs = extractTransferDocs(data);
    return docs.filter((doc) => doc?.runId === runId || doc?._id === runId);
  } catch {
    return [];
  }
}

async function fetchTransferDocByRunId(runId: string): Promise<any | null> {
  const docs = await fetchTransferDocsByRunId(runId);
  return docs[0] ?? null;
}

