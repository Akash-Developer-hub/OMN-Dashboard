import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mockSearchTilesLog from "@/utils/st_z60j63_mpqprzhh.log.txt";
import osmJson from "@/utils/osm.json";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  folderName: string;
  logPath: string;
  scriptPath: string;
  addMaxspeedAndTurnlanesToOsm: boolean;
  maxspeedAndTurnlanesPath: string;
};

type ServerPathEntry = {
  targetServerId?: string;
  serverId?: string;
  outputPath?: string;
  folder?: string;
  logPath?: string;
  scriptPath?: string;
  maxspeedscriptpath?: string;
};

type DownloadJob = {
  id: string;
  runId: string;
  sId: string;
  workflow: WorkflowKey;
  workflowLabel: string;
  serverName: string;
  outputPath: string;
  logPath: string;
  status: JobStatus;
  requestedAt: string;
  lastError?: string;
};

type JobLogState = {
  lines: string[];
  complete: boolean;
  lastError?: string;
  offset: number;
  source: "static" | "remote" | "empty";
};

type WorkflowSummary = {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  processingCount: number;
  pendingCount: number;
  completedSubRegionCount: number;
  totalSubRegionCount: number;
  downloadCompleted: boolean;
  processingLabel?: string;
  source: "static" | "remote" | "empty";
  validatedStatus: JobStatus;
  statusFiles: {
    completed: string[];
    failed: string[];
    processing: string[];
    pending: string[];
  };
};

type SummaryStatusKey = "completed" | "failed" | "processing" | "pending";

type SummaryCardSelection = {
  workflow: WorkflowKey;
  status: SummaryStatusKey;
};

type BrowserField = "outputPath" | "logPath" | "scriptPath" | "maxspeedAndTurnlanesPath";

type BrowserState = {
  open: boolean;
  workflow: WorkflowKey;
  field: BrowserField;
  basePath: string;
  items: string[];
  loading: boolean;
  error?: string;
  search: string;
};

type PersistedWorkflowEntry = {
  workflow?: WorkflowKey;
  runId?: string;
  sId?: string;
  outputPath?: string;
  logPath?: string;
  status?: JobStatus;
  requestedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  summary?: Partial<WorkflowSummary>;
  logState?: Partial<JobLogState>;
  targetServer?: {
    name?: string;
  };
  job?: Partial<DownloadJob> & {
    runId?: string;
    sId?: string;
    outputPath?: string;
    logPath?: string;
    serverName?: string;
    requestedAt?: string;
    status?: JobStatus;
    targetServer?: {
      name?: string;
    };
  };
};

const DOWNLOAD_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/download";
const LIST_FOLDERS_URL = "https://sandbox.vmmaps.com/n8n/webhook/list-files";
const RUN_ID_LOGS_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn/runId-logs";
const MAX_LOG_LINES = 25000;
const STATUS_DETAIL_REGIONS_PER_PAGE = 12;
const LOG_POLL_INTERVAL_MS = 3000;
const LOG_REQUEST_TIMEOUT_MS = 60000;
const DOWNLOAD_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_LOG_POLL_DURATION_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SEARCH_TILES_SCRIPT_PATH = "/home/gaaya/Projects/pipeline";

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
  folderName: "",
  logPath: "/home",
  scriptPath: "/home",
  addMaxspeedAndTurnlanesToOsm: true,
  maxspeedAndTurnlanesPath: "",
});

const DEFAULT_MAXSPEED_SCRIPT_PATH = "/home/gaaya/Projects/pipeline/maxspeedlogs";

const defaultForms = (): Record<WorkflowKey, WorkflowFormState> => ({
  searchTiles: emptyForm(),
  routing: emptyForm(),
});

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

const stripAnsi = (value: string) => value.replace(ANSI_PATTERN, "");

const sanitizeLogLine = (line: string) => stripAnsi(line).replace(/\s+/g, " ").trim();

const buildStaticLogLines = (rawLog: string) => {
  const seenProgressPrefixes = new Set<string>();

  return rawLog
    .split(/\r?\n/)
    .map(sanitizeLogLine)
    .filter(Boolean)
    .filter((line) => !/^[?2004hl]+$/i.test(line))
    .filter((line) => !/^[a-z0-9_-]+@.+:\/.+\$$/i.test(line))
    .filter((line) => {
      const progressMatch = line.match(/^(.*?\.osm\.pbf(?:\.\d+)?)\s+\d+%/i);
      if (!progressMatch) return true;
      const key = progressMatch[1];
      if (seenProgressPrefixes.has(key)) return false;
      seenProgressPrefixes.add(key);
      return true;
    })
    .slice(-MAX_LOG_LINES);
};

const STATIC_SEARCH_TILES_LOG_LINES = buildStaticLogLines(mockSearchTilesLog);

const buildEmptyLogState = (): JobLogState => ({
  lines: [],
  complete: false,
  offset: 0,
  source: "empty",
});

const buildStaticLogStateForWorkflow = (workflow: WorkflowKey): JobLogState => {
  if (workflow === "searchTiles") {
    return {
      lines: STATIC_SEARCH_TILES_LOG_LINES,
      complete: false,
      offset: STATIC_SEARCH_TILES_LOG_LINES.length,
      source: "static",
    };
  }

  return buildEmptyLogState();
};

const buildHydratedJob = (entry: PersistedWorkflowEntry, workflow: WorkflowKey): DownloadJob | null => {
  const runId = String(entry?.runId || entry?.job?.runId || "").trim();
  if (!runId) return null;

  const serverName = String(
    entry?.job?.serverName || entry?.targetServer?.name || entry?.job?.targetServer?.name || "",
  ).trim();
  const requestedAt = String(entry?.job?.requestedAt || entry?.updatedAt || entry?.createdAt || new Date().toISOString()).trim();
  const status = (entry?.status || entry?.summary?.validatedStatus || entry?.job?.status || "queued") as JobStatus;

  return {
    id: String(entry?.job?.id || entry?.sId || entry?.job?.sId || runId),
    runId,
    sId: String(entry?.sId || entry?.job?.sId || runId),
    workflow,
    workflowLabel: String(entry?.job?.workflowLabel || workflowCopy[workflow].label),
    serverName,
    outputPath: String(entry?.outputPath || entry?.job?.outputPath || "").trim(),
    logPath: String(entry?.logPath || entry?.job?.logPath || "").trim(),
    status,
    requestedAt,
    lastError: typeof entry?.logState?.lastError === "string" ? entry.logState.lastError : undefined,
  };
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

const buildWorkflowLogPath = (basePath: string, sId: string) => {
  const value = String(basePath || "").trim();
  if (!value) return `${sId}.log`;
  if (/\.log$/i.test(value)) return value;
  return `${value.replace(/\/+$/, "")}/${sId}.log`;
};
const normalizeOutputPath = (path: string) => String(path || "").trim() || "/home";
const normalizeOptionalPath = (path: string) => {
  const value = String(path || "").trim();
  return value || null;
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

const canonicalizeOsmFileName = (rawFileName: string, parent?: string) => {
  const normalizedFileName = rawFileName.replace(/\.\d+$/g, "");
  const stem = normalizedFileName.replace(/\.osm\.pbf$/i, "");

  if (!parent || !Array.isArray(osmJson[parent])) return `${stem}.osm.pbf`;

  const parentEntries = osmJson[parent] as string[];
  if (parentEntries.includes(stem)) return `${stem}.osm.pbf`;

  const latestCandidate = stem.replace(/-\d{6,8}$/i, "-latest");
  if (parentEntries.includes(latestCandidate)) return `${latestCandidate}.osm.pbf`;

  return `${stem}.osm.pbf`;
};

const normalizeOsmFilePath = (rawValue: string): string | null => {
  const cleaned = String(rawValue || "")
    .trim()
    .replace(/[‘’“”'"\u2018\u2019\u201c\u201d]/g, "")
    .replace(/\\/g, "/")
    .replace(/\.osm\.pbf\.\d+$/i, ".osm.pbf");
  const urlMatch = cleaned.match(/https?:\/\/[^/]+(\/.*)/i);
  const pathValue = urlMatch ? urlMatch[1] : cleaned;
  const segments = pathValue.split("/").filter(Boolean);
  const fileIndex = segments.findIndex((segment) => segment.toLowerCase().includes(".osm.pbf"));
  if (fileIndex < 0) return null;
  const parent = fileIndex === 0 ? undefined : segments[fileIndex - 1];
  const fileName = canonicalizeOsmFileName(segments[fileIndex], parent);
  if (!parent) return `/${fileName}`;
  return `/${parent}/${fileName}`;
};

const extractOsmFilePathFromLog = (line: string): string | null => {
  const downloadingMatch = line.match(/Downloading:\s*(\S+)/i);
  if (downloadingMatch) return normalizeOsmFilePath(downloadingMatch[1]);

  const savedMatch = line.match(/[‘“"']?(.+?\.osm\.pbf(?:\.\d+)?)[’”"']?\s*saved/i);
  if (savedMatch) return normalizeOsmFilePath(savedMatch[1]);

  const anyPathMatch = line.match(/([\w\-/.]+\.osm\.pbf(?:\.\d+)?)/i);
  if (anyPathMatch) return normalizeOsmFilePath(anyPathMatch[1]);

  return null;
};

const extractReferenceKeys = (lines: string[]) => {
  const keys = new Set<string>();

  lines.forEach((line) => {
    const txtMatch = line.match(/\/([a-z-]+)\.txt/i);
    if (txtMatch && osmJson[txtMatch[1]]) keys.add(txtMatch[1]);

    const saveMatch = line.match(/Saving downloads to:\s*\S+\/([a-z-]+)/i);
    if (saveMatch && osmJson[saveMatch[1]]) keys.add(saveMatch[1]);

    const urlMatch = line.match(/download\.geofabrik\.de\/[\w-/]+\/([a-z-]+)\/[a-z0-9-]+\.osm\.pbf/i);
    if (urlMatch && osmJson[urlMatch[1]]) keys.add(urlMatch[1]);
  });

  return Array.from(keys);
};

const extractCompletedSubRegions = (lines: string[]) => {
  const completed = new Set<string>();

  lines.forEach((line) => {
    const match = line.match(/Completed processing for:\s*([a-z-]+)/i);
    if (match) completed.add(match[1].toLowerCase());
  });

  return completed;
};

const hasDownloadCompletedLine = (lines: string[]) => lines.some((line) => /All downloads complete\./i.test(line));

const extractObservedOsmFilePaths = (lines: string[]) => {
  const paths = new Set<string>();

  lines.forEach((line) => {
    const normalizedPath = extractOsmFilePathFromLog(line);
    if (normalizedPath) paths.add(normalizedPath);
  });

  return paths;
};

const extractReferenceKeysFromObservedPaths = (paths: Iterable<string>) => {
  const keys = new Set<string>();

  Array.from(paths).forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return;

    const parentKey = parts[parts.length - 2]?.toLowerCase();
    if (parentKey && osmJson[parentKey]) keys.add(parentKey);
  });

  return Array.from(keys);
};

const buildAllConfiguredExpectedFilePaths = () =>
  new Set(
    Object.entries(osmJson).flatMap(([key, fileNames]) =>
      (Array.isArray(fileNames) ? fileNames : []).map((fileName) => `/${key}/${String(fileName)}.osm.pbf`),
    ),
  );

const buildExpectedFilePaths = (lines: string[]) => {
  const configuredPaths = buildAllConfiguredExpectedFilePaths();
  if (configuredPaths.size > 0) return configuredPaths;

  const observedPaths = extractObservedOsmFilePaths(lines);
  const keys = Array.from(new Set([...extractReferenceKeys(lines), ...extractReferenceKeysFromObservedPaths(observedPaths)]));

  if (keys.length > 0) {
    return new Set(keys.flatMap((key) => (osmJson[key] ?? []).map((fileName) => `/${key}/${fileName}.osm.pbf`)));
  }

  return observedPaths;
};

const normalizeLogLines = (payload: unknown): string[] => {
  const body = (payload as { data?: unknown })?.data ?? payload;
  const record = body as Record<string, unknown>;
  const candidates = [record?.logs, record?.lines, record?.logLines, (record?.data as Record<string, unknown> | undefined)?.logs, (record?.data as Record<string, unknown> | undefined)?.lines, Array.isArray(body) ? body : null];
  const raw = candidates.find((candidate) => Array.isArray(candidate) || typeof candidate === "string");

  if (Array.isArray(raw)) {
    return buildStaticLogLines(
      raw
        .map((item) => (typeof item === "string" ? item : typeof item === "object" && item ? String((item as Record<string, unknown>).message ?? (item as Record<string, unknown>).line ?? (item as Record<string, unknown>).log ?? JSON.stringify(item)) : String(item)))
        .join("\n"),
    );
  }

  if (typeof raw === "string") return buildStaticLogLines(raw);
  if (typeof record?.log === "string") return buildStaticLogLines(record.log);
  if (typeof record?.message === "string") return buildStaticLogLines(record.message);
  return [];
};

const parseRunIdLogsResponse = async (response: Response): Promise<unknown> => {
  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();

  if (!trimmedBody) return null;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(trimmedBody) as unknown;
    } catch {
      return rawBody;
    }
  }

  try {
    return JSON.parse(trimmedBody) as unknown;
  } catch {
    return rawBody;
  }
};

const extractResponseMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : undefined;
};

const extractNewOffset = (payload: unknown): number | null => {
  const body = (payload as { data?: unknown })?.data ?? payload;
  const record = body as Record<string, unknown>;
  const nested = record?.data as Record<string, unknown> | undefined;
  const value = record?.newOffset ?? nested?.newOffset ?? record?.offset ?? nested?.offset;
  const nextOffset = Number(value);
  return Number.isFinite(nextOffset) ? nextOffset : null;
};

const extractLogCompleted = (payload: unknown): boolean => {
  const body = (payload as { data?: unknown })?.data ?? payload;
  const record = body as Record<string, unknown>;
  const nested = record?.data as Record<string, unknown> | undefined;
  const value = record?.completed ?? record?.complete ?? record?.done ?? record?.finished ?? record?.isComplete ?? nested?.completed ?? nested?.complete ?? nested?.done ?? nested?.finished ?? nested?.isComplete;
  return value === true || String(value).toLowerCase() === "true";
};

const pathToFileKey = (path: string) => path.split("/").filter(Boolean).pop()?.replace(/\.osm\.pbf$/i, "") ?? path;

const pathToRegionKey = (path: string) => path.split("/").filter(Boolean).at(-2) ?? "-";

const resolvePathAgainstExpectedSet = (path: string, expectedPaths: Set<string>) => {
  if (!path || expectedPaths.size === 0) return path;
  if (expectedPaths.has(path)) return path;

  const fileKey = pathToFileKey(path);
  const matchingExpectedPaths = Array.from(expectedPaths).filter((expectedPath) => pathToFileKey(expectedPath) === fileKey);
  return matchingExpectedPaths.length === 1 ? matchingExpectedPaths[0] : path;
};

const sortPathsByFileKey = (paths: Iterable<string>) =>
  Array.from(new Set(paths)).sort((left, right) => pathToFileKey(left).localeCompare(pathToFileKey(right)));

const groupPathsByRegion = (paths: string[]) => {
  const grouped = paths.reduce<Record<string, string[]>>((accumulator, path) => {
    const region = pathToRegionKey(path);
    accumulator[region] = accumulator[region] ? [...accumulator[region], path] : [path];
    return accumulator;
  }, {});

  return Object.entries(grouped)
    .map(([region, regionPaths]) => ({ region, paths: sortPathsByFileKey(regionPaths) }))
    .sort((left, right) => left.region.localeCompare(right.region));
};

const isFailureLogLine = (line: string): boolean => {
  const normalized = line.trim();
  if (!normalized) return false;

  return /(\bfailed\b|\berror\b|\babort(?:ed)?\b|\btimeout\b|\bnot found\b|\bpermission\b|\bdenied\b|\b(?:http|status|response|code)\b[^\n]*\b(?:403|404|500)\b|\b(?:403|404|500)\b\s+(?:forbidden|not found|internal server error)\b)/i.test(
    normalized,
  );
};

const getSearchTilesSummary = (job: DownloadJob | null, logState?: JobLogState, fallbackSummary?: WorkflowSummary | null): WorkflowSummary => {
  if (!job) {
    return {
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      processingCount: 0,
      pendingCount: 0,
      completedSubRegionCount: 0,
      totalSubRegionCount: 0,
      downloadCompleted: false,
      source: "empty",
      validatedStatus: "queued",
      statusFiles: {
        completed: [],
        failed: [],
        processing: [],
        pending: [],
      },
    };
  }

  if (!logState || logState.lines.length === 0) {
    if (fallbackSummary && fallbackSummary.totalCount > 0) {
      return fallbackSummary;
    }

    const configuredPendingPaths = sortPathsByFileKey(buildAllConfiguredExpectedFilePaths());
    if (configuredPendingPaths.length > 0) {
      return {
        totalCount: configuredPendingPaths.length,
        completedCount: 0,
        failedCount: 0,
        processingCount: 0,
        pendingCount: configuredPendingPaths.length,
        completedSubRegionCount: 0,
        totalSubRegionCount: Object.keys(osmJson).length,
        downloadCompleted: false,
        source: logState?.source ?? "empty",
        validatedStatus: job.status,
        statusFiles: {
          completed: [],
          failed: [],
          processing: [],
          pending: configuredPendingPaths,
        },
      };
    }

    return {
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      processingCount: 0,
      pendingCount: 0,
      completedSubRegionCount: 0,
      totalSubRegionCount: 0,
      downloadCompleted: false,
      source: "empty",
      validatedStatus: job?.status ?? "queued",
      statusFiles: {
        completed: [],
        failed: [],
        processing: [],
        pending: [],
      },
    };
  }

  const completedPaths = new Set<string>();
  const failedPaths = new Set<string>();
  const downloadingPaths = new Set<string>();

  logState.lines.forEach((line) => {
    const normalizedPath = extractOsmFilePathFromLog(line);
    if (!normalizedPath) {
      if (isFailureLogLine(line)) failedPaths.add("__unknown__");
      return;
    }

    if (/Downloading:/i.test(line)) downloadingPaths.add(normalizedPath);
    if (/saved/i.test(line)) completedPaths.add(normalizedPath);
    if (isFailureLogLine(line)) failedPaths.add(normalizedPath);
  });

  const referenceKeys = extractReferenceKeys(logState.lines);
  const completedSubRegions = extractCompletedSubRegions(logState.lines);
  const downloadCompleted = hasDownloadCompletedLine(logState.lines);
  const expectedPaths = buildExpectedFilePaths(logState.lines);
  const resolvedCompletedPaths = new Set(Array.from(completedPaths).map((path) => resolvePathAgainstExpectedSet(path, expectedPaths)));
  const resolvedFailedPaths = new Set(Array.from(failedPaths).map((path) => path === "__unknown__" ? path : resolvePathAgainstExpectedSet(path, expectedPaths)));
  const resolvedDownloadingPaths = new Set(Array.from(downloadingPaths).map((path) => resolvePathAgainstExpectedSet(path, expectedPaths)));
  const completedFilePaths = sortPathsByFileKey(
    expectedPaths.size > 0 ? Array.from(resolvedCompletedPaths).filter((path) => expectedPaths.has(path)) : resolvedCompletedPaths,
  );
  const failedFilePaths = sortPathsByFileKey(
    expectedPaths.size > 0 ? Array.from(resolvedFailedPaths).filter((path) => path !== "__unknown__" && expectedPaths.has(path)) : Array.from(resolvedFailedPaths).filter((path) => path !== "__unknown__"),
  );
  const processingPaths = sortPathsByFileKey(
    Array.from(resolvedDownloadingPaths).filter((path) => !resolvedCompletedPaths.has(path) && !resolvedFailedPaths.has(path) && (!expectedPaths.size || expectedPaths.has(path))),
  );
  const pendingPaths = sortPathsByFileKey(
    expectedPaths.size
      ? Array.from(expectedPaths).filter((path) => !resolvedCompletedPaths.has(path) && !resolvedFailedPaths.has(path) && !processingPaths.includes(path))
      : [],
  );
  const pendingCount = pendingPaths.length;
  const failedCount = failedFilePaths.length;
  const totalCount = expectedPaths.size;

  let validatedStatus: JobStatus = "queued";
  if (failedCount > 0) validatedStatus = "failed";
  else if (downloadCompleted) validatedStatus = "completed";
  else if (totalCount > 0 && completedFilePaths.length >= totalCount) validatedStatus = "completed";
  else if (processingPaths.length > 0 || completedFilePaths.length > 0) validatedStatus = "running";

  return {
    totalCount,
    completedCount: completedFilePaths.length,
    failedCount,
    processingCount: processingPaths.length,
    pendingCount,
    completedSubRegionCount: completedSubRegions.size,
    totalSubRegionCount: referenceKeys.length,
    downloadCompleted,
    processingLabel: processingPaths[processingPaths.length - 1],
    source: logState.source,
    validatedStatus,
    statusFiles: {
      completed: completedFilePaths,
      failed: failedFilePaths,
      processing: processingPaths,
      pending: pendingPaths,
    },
  };
};

const getRoutingSummary = (job: DownloadJob | null, logState?: JobLogState): WorkflowSummary => {
  const status = job?.status ?? "queued";
  return {
    totalCount: job ? 1 : 0,
    completedCount: status === "completed" ? 1 : 0,
    failedCount: status === "failed" ? 1 : 0,
    processingCount: status === "running" ? 1 : 0,
    pendingCount: status === "queued" ? 1 : 0,
    completedSubRegionCount: 0,
    totalSubRegionCount: 0,
    downloadCompleted: status === "completed",
    processingLabel: status === "running" ? `Run ${job?.runId}` : undefined,
    source: logState?.source ?? "empty",
    validatedStatus: status,
    statusFiles: {
      completed: status === "completed" && job ? [job.runId] : [],
      failed: status === "failed" && job ? [job.runId] : [],
      processing: status === "running" && job ? [job.runId] : [],
      pending: status === "queued" && job ? [job.runId] : [],
    },
  };
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

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

function FolderBrowserModal({
  browserState,
  onClose,
  onNavigate,
  onConfirm,
  onSearch,
  onSelect,
}: {
  browserState: BrowserState | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onConfirm: () => void;
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
          <button type="button" title="Close browser" aria-label="Close browser" onClick={onClose} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
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
          <Button onClick={onConfirm}>Use {browserState.basePath}</Button>
        </div>
      </div>
    </div>
  );
}

export default function Download() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [forms, setForms] = useState<Record<WorkflowKey, WorkflowFormState>>(() => defaultForms());
  const [jobs, setJobs] = useState<Record<WorkflowKey, DownloadJob | null>>({ searchTiles: null, routing: null });
  const [jobLogs, setJobLogs] = useState<Record<WorkflowKey, JobLogState>>({
    searchTiles: buildEmptyLogState(),
    routing: buildEmptyLogState(),
  });
  const [submitting, setSubmitting] = useState<Record<WorkflowKey, boolean>>({ searchTiles: false, routing: false });
  const [refreshing, setRefreshing] = useState(false);
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [selectedSummaryCard, setSelectedSummaryCard] = useState<SummaryCardSelection | null>(null);
  const [selectedSummaryPage, setSelectedSummaryPage] = useState(1);
  const [currentVersion, setCurrentVersion] = useState("");
  const [storedSummaries, setStoredSummaries] = useState<Record<WorkflowKey, WorkflowSummary | null>>({ searchTiles: null, routing: null });
  const [autoPollEnabled, setAutoPollEnabled] = useState<Record<WorkflowKey, boolean>>({ searchTiles: false, routing: false });
  const persistSignatureRef = useRef<Record<WorkflowKey, string>>({ searchTiles: "", routing: "" });
  const logPollInFlightRef = useRef<Record<WorkflowKey, boolean>>({ searchTiles: false, routing: false });
  const lastLogPollAtRef = useRef<Record<WorkflowKey, number>>({ searchTiles: 0, routing: 0 });

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

  useEffect(() => {
    const hydrateDownloadStatuses = async () => {
      try {
        const versionResponse = await api.get("/admin-dashboard/pipeline-config/current-version");
        const version = String(versionResponse.data?.data?.version || versionResponse.data?.version || "v1.0");
        setCurrentVersion(version);

        const statusResponse = await api.get("/admin-dashboard/download-status", { params: { version } });
        const statuses = statusResponse.data?.data?.statuses ?? statusResponse.data?.statuses ?? [];
        if (!Array.isArray(statuses) || statuses.length === 0) return;

        const nextJobs: Record<WorkflowKey, DownloadJob | null> = { searchTiles: null, routing: null };
        const nextSummaries: Record<WorkflowKey, WorkflowSummary | null> = { searchTiles: null, routing: null };
        const nextLogs: Record<WorkflowKey, JobLogState> = { searchTiles: buildEmptyLogState(), routing: buildEmptyLogState() };
        const nextAutoPollEnabled: Record<WorkflowKey, boolean> = { searchTiles: false, routing: false };

        statuses.forEach((entry) => {
          const workflow = entry?.workflow as WorkflowKey | undefined;
          if (!workflow || (workflow !== "searchTiles" && workflow !== "routing")) return;

          nextJobs[workflow] = buildHydratedJob(entry as PersistedWorkflowEntry, workflow);
          if (entry?.summary) nextSummaries[workflow] = entry.summary as WorkflowSummary;
          if (entry?.logState) {
            nextLogs[workflow] = {
              ...buildEmptyLogState(),
              complete: Boolean(entry.logState.complete),
              lastError: typeof entry.logState.lastError === "string" ? entry.logState.lastError : undefined,
              offset: Number(entry.logState.offset) || 0,
              source: entry.logState.source === "remote" ? "remote" : entry.logState.source === "static" ? "static" : "empty",
            };
          }

          if (nextJobs[workflow]?.runId && !nextLogs[workflow].complete) {
            nextAutoPollEnabled[workflow] = true;
          }
        });

        setJobs((current) => ({
          searchTiles: current.searchTiles ?? nextJobs.searchTiles,
          routing: current.routing ?? nextJobs.routing,
        }));
        setStoredSummaries(nextSummaries);
        setJobLogs((current) => ({
          searchTiles: current.searchTiles.lines.length > 0 ? current.searchTiles : nextLogs.searchTiles,
          routing: current.routing.lines.length > 0 ? current.routing : nextLogs.routing,
        }));
        setAutoPollEnabled((current) => ({
          searchTiles: current.searchTiles || nextAutoPollEnabled.searchTiles,
          routing: current.routing || nextAutoPollEnabled.routing,
        }));
      } catch (error) {
        console.error("Failed to hydrate download statuses", error);
      }
    };

    void hydrateDownloadStatuses();
  }, []);

  const searchTilesSummary = useMemo(
    () => getSearchTilesSummary(jobs.searchTiles, jobLogs.searchTiles, storedSummaries.searchTiles),
    [jobs.searchTiles, jobLogs.searchTiles, storedSummaries.searchTiles],
  );

  const routingSummary = useMemo(
    () => getRoutingSummary(jobs.routing, jobLogs.routing),
    [jobs.routing, jobLogs.routing],
  );

  const pollWorkflowLogs = useCallback(async (workflow: WorkflowKey, force = false) => {
    const job = jobs[workflow];
    if (!job?.runId) return;

    if (logPollInFlightRef.current[workflow]) return;

    const now = Date.now();
    if (!force && now - lastLogPollAtRef.current[workflow] < LOG_POLL_INTERVAL_MS) return;

    const currentLogState = jobLogs[workflow];
    const sId = job.sId || job.runId;
    const logPath = job.logPath || buildWorkflowLogPath("/home/logs", sId);
    logPollInFlightRef.current[workflow] = true;
    lastLogPollAtRef.current[workflow] = now;

    try {
      const response = await fetch(RUN_ID_LOGS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetServer: job.serverName,
          sId,
          offset: currentLogState.offset,
          logPath,
        }),
        signal: AbortSignal.timeout(LOG_REQUEST_TIMEOUT_MS),
      });

      const data = await parseRunIdLogsResponse(response);
      if (!response.ok) {
        const message = extractResponseMessage(data) ?? `Failed to fetch ${workflowCopy[workflow].label} logs.`;
        throw new Error(message);
      }

      const newLines = normalizeLogLines(data);
      const nextOffset = extractNewOffset(data);
      const mergedLines = nextOffset !== null && nextOffset >= currentLogState.offset
        ? buildStaticLogLines([...currentLogState.lines, ...newLines].join("\n"))
        : newLines.length > 0
          ? buildStaticLogLines(newLines.join("\n"))
          : currentLogState.lines;
      const completed = extractLogCompleted(data) || hasDownloadCompletedLine(mergedLines);

      setJobLogs((current) => ({
        ...current,
        [workflow]: {
          lines: mergedLines,
          complete: completed,
          offset: nextOffset ?? current[workflow].offset,
          lastError: undefined,
          source: "remote",
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch logs.";
      setJobLogs((current) => ({
        ...current,
        [workflow]: {
          ...current[workflow],
          lastError: message,
          source: current[workflow].source === "empty" ? "remote" : current[workflow].source,
        },
      }));
    } finally {
      logPollInFlightRef.current[workflow] = false;
    }
  }, [jobLogs, jobs]);

  useEffect(() => {
    const activeWorkflows = (["searchTiles", "routing"] as WorkflowKey[]).filter((workflow) => {
      const job = jobs[workflow];
      const logState = jobLogs[workflow];
      if (!autoPollEnabled[workflow] || !job?.runId || logState.complete) return false;

      const requestedAt = new Date(job.requestedAt).getTime();
      if (Number.isNaN(requestedAt)) return true;

      const isWithinPollingWindow = Date.now() - requestedAt <= MAX_LOG_POLL_DURATION_MS;
      if (!isWithinPollingWindow) {
        setJobLogs((current) => ({
          ...current,
          [workflow]: {
            ...current[workflow],
            complete: true,
            lastError: "Log polling stopped after the maximum execution window. Use Refresh logs to fetch the latest output.",
          },
        }));
      }

      return isWithinPollingWindow;
    });

    if (activeWorkflows.length === 0) return;

    activeWorkflows.forEach((workflow) => {
      void pollWorkflowLogs(workflow);
    });

    const intervalId = window.setInterval(() => {
      activeWorkflows.forEach((workflow) => {
        void pollWorkflowLogs(workflow);
      });
    }, LOG_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [autoPollEnabled, jobs, jobLogs, pollWorkflowLogs]);

  useEffect(() => {
    if (!currentVersion) return;

    const persistStatuses = async () => {
      const summaries: Record<WorkflowKey, WorkflowSummary> = {
        searchTiles: searchTilesSummary,
        routing: routingSummary,
      };

      for (const workflow of ["searchTiles", "routing"] as WorkflowKey[]) {
        const job = jobs[workflow];
        if (!job) continue;

        const payload = {
          version: currentVersion,
          workflow,
          runId: job.runId,
          status: summaries[workflow].validatedStatus,
          job,
          summary: summaries[workflow],
          logState: {
            complete: jobLogs[workflow].complete,
            lastError: jobLogs[workflow].lastError,
            offset: jobLogs[workflow].offset,
            source: jobLogs[workflow].source,
          },
          ...(workflow === "routing"
            ? {
              addMaxspeedAndTurnlanesToOsm: forms.routing.addMaxspeedAndTurnlanesToOsm,
              maxspeedAndTurnlanesPath: normalizeOptionalPath(forms.routing.maxspeedAndTurnlanesPath),
            }
            : {}),
        };

        const signature = JSON.stringify(payload);
        if (persistSignatureRef.current[workflow] === signature) continue;

        persistSignatureRef.current[workflow] = signature;
        setStoredSummaries((current) => ({ ...current, [workflow]: summaries[workflow] }));

        try {
          await api.put("/admin-dashboard/download-status", payload);
        } catch (error) {
          console.error(`Failed to persist ${workflow} download status`, error);
        }
      }
    };

    void persistStatuses();
  }, [currentVersion, forms, jobs, jobLogs, searchTilesSummary, routingSummary]);

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

  const fetchDownloadPathForServer = async (serverId: string) => {
    const version = currentVersion || (await fetchCurrentConfigVersion());
    const response = await api.post("/admin-dashboard/pipeline-config/download-path-config", {
      version,
    });
    const downloadPaths = response.data?.data?.downloadPaths || response.data?.downloadPaths || {};
    return flattenServerPaths(downloadPaths).find((path) => (path.targetServerId || path.serverId) === serverId);
  };

  const handleServerSelection = async (workflow: WorkflowKey, serverId: string) => {
    updateForm(workflow, { targetServerId: serverId });

    if (!serverId) {
      updateForm(workflow, { outputPath: "/home", folderName: "", logPath: "/home", scriptPath: "/hom", maxspeedAndTurnlanesPath: "" });
      return;
    }

    try {
      const pathInfo = await fetchDownloadPathForServer(serverId);
      const nextOutputPath = normalizeBrowsePath(pathInfo?.outputPath || "/home");
      const nextLogPath = normalizeBrowsePath(pathInfo?.logPath || "/home");
      const nextScriptPath = String(pathInfo?.scriptPath || DEFAULT_SEARCH_TILES_SCRIPT_PATH).trim();
      const nextMaxspeedPath = String(pathInfo?.maxspeedscriptpath || DEFAULT_MAXSPEED_SCRIPT_PATH).trim();

      updateForm(workflow, {
        outputPath: nextOutputPath,
        folderName: String(pathInfo?.folder || "").trim(),
        logPath: nextLogPath,
        scriptPath: nextScriptPath,
        ...(workflow === "routing" ? { maxspeedAndTurnlanesPath: nextMaxspeedPath } : {}),
      });

      if (!pathInfo) {
        toast.info("No download path config found for the selected server. Using default /home paths.");
      }
    } catch (error) {
      console.error("Failed to load download path config", error);
      updateForm(workflow, { outputPath: "/home", folderName: "", logPath: "/home", scriptPath: "", maxspeedAndTurnlanesPath: "" });
      toast.error("Failed to load download path config.");
    }
  };

  const fetchServerPathForServer = async (serverId: string) => {
    const version = await fetchCurrentConfigVersion();
    const response = await api.post("/admin-dashboard/pipeline-config/server-path", { version });
    const serverPaths = response.data?.data?.serverPaths || response.data?.serverPaths || {};
    return flattenServerPaths(serverPaths).find((path) => (path.targetServerId || path.serverId) === serverId);
  };

  const fetchServerFolders = async (server: Server, path: string) => {
    const copyServerUser = String(server.name || "").trim().toUpperCase();
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

  const openBrowser = async (workflow: WorkflowKey, field: BrowserField) => {
    const server = getServer(forms[workflow].targetServerId);
    if (!server) {
      toast.error("Select a server before browsing.");
      return;
    }

    const fieldValue = String(forms[workflow][field] || "").trim();
    const basePath = normalizeBrowsePath(fieldValue || "/home");
    setBrowserState({ open: true, workflow, field, basePath, items: [], loading: true, search: "" });

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
    setBrowserState((current) => current ? { ...current, basePath, items: [], loading: true, error: undefined, search: "" } : null);

    try {
      const items = await fetchServerFolders(server, basePath);
      setBrowserState((current) => current ? { ...current, basePath, items, loading: false, error: undefined } : null);
    } catch (error) {
      console.error("Failed to navigate folders", error);
      setBrowserState((current) => current ? { ...current, items: [], loading: false, error: "Unable to load folders." } : null);
    }
  };

  const confirmBrowserSelection = () => {
    if (!browserState) return;
    updateForm(browserState.workflow, { [browserState.field]: browserState.basePath });
    setBrowserState(null);
  };

  const selectBrowserItem = async (item: string) => {
    if (!browserState) return;
    await navigateBrowser(buildBrowserPath(browserState.basePath, item));
  };

  const refreshLogs = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        (["searchTiles", "routing"] as WorkflowKey[])
          .filter((workflow) => Boolean(jobs[workflow]?.runId))
          .map((workflow) => pollWorkflowLogs(workflow, true)),
      );
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

    if (!form.logPath.trim()) {
      toast.error("Select a log path.");
      return;
    }

    const runId = makeRunId(workflow);
    const sId = runId;
    const logPath = buildWorkflowLogPath(form.logPath, sId);
    const provisionalJob: DownloadJob = {
      id: runId,
      runId,
      sId,
      workflow,
      workflowLabel: workflowCopy[workflow].label,
      serverName: server.name,
      outputPath: normalizeOutputPath(form.outputPath),
      logPath,
      status: workflow === "searchTiles" ? "running" : "queued",
      requestedAt: new Date().toISOString(),
    };

    setSubmitting((current) => ({ ...current, [workflow]: true }));
    setAutoPollEnabled((current) => ({ ...current, [workflow]: true }));
    lastLogPollAtRef.current[workflow] = 0;
    setJobs((current) => ({ ...current, [workflow]: provisionalJob }));
    setStoredSummaries((current) => ({ ...current, [workflow]: null }));
    setJobLogs((current) => ({
      ...current,
      [workflow]: workflow === "searchTiles"
        ? { ...buildEmptyLogState(), source: "remote" }
        : { ...buildEmptyLogState(), source: "remote" },
    }));

    try {
      const pathInfo = await fetchDownloadPathForServer(server._id || server.id);
      const scriptPath = String(pathInfo?.scriptPath || form.scriptPath || "").trim();

      if (!scriptPath) {
        throw new Error("No script path is configured for the selected server.");
      }

      const payload = {
        type: "osm-download",
        workflow,
        workflowLabel: workflowCopy[workflow].label,
        runId,
        sId,
        outputPath: workflow === "searchTiles" ? (form.folderName.trim() || provisionalJob.outputPath) : provisionalJob.outputPath,
        logPath,
        downloadType: workflow === "searchTiles" ? "search_tiles" : "routing",
        scriptPath,
        ...(workflow === "routing"
          ? {
            addMaxspeedAndTurnlanesToOsm: form.addMaxspeedAndTurnlanesToOsm,
            maxspeedAndTurnlanesPath: form.maxspeedAndTurnlanesPath.trim(),
          }
          : {}),
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
        signal: AbortSignal.timeout(DOWNLOAD_REQUEST_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const responseMessage = data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined;
        const message = typeof responseMessage === "string" ? responseMessage : `Failed to start ${workflowCopy[workflow].label}.`;
        throw new Error(message);
      }

      setJobs((current) => ({
        ...current,
        [workflow]: current[workflow] ? { ...current[workflow], status: "running", lastError: undefined } : current[workflow],
      }));
      toast.success(`${workflowCopy[workflow].label} download started.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start download.";
      setAutoPollEnabled((current) => ({ ...current, [workflow]: false }));
      setJobs((current) => ({
        ...current,
        [workflow]: current[workflow] ? { ...current[workflow], status: "failed", lastError: message } : current[workflow],
      }));
      setJobLogs((current) => ({
        ...current,
        [workflow]: {
          ...current[workflow],
          lastError: message,
        },
      }));
      toast.error(message);
    } finally {
      setSubmitting((current) => ({ ...current, [workflow]: false }));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-3xl p-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Search & Tiles and Routing downloads</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Select a server, browse the destination folder, start the download, and validate the output against the static log and static OSM configuration.
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
                    onChange={(event) => void handleServerSelection(workflow, event.target.value)}
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

                {workflow === "searchTiles" ? (
                  <div className="space-y-2">
                    <Label htmlFor={`${workflow}-folder`}>Folder</Label>
                    <Input
                      id={`${workflow}-folder`}
                      value={form.folderName}
                      onChange={(event) => updateForm(workflow, { folderName: event.target.value })}
                      placeholder="Select a server to load folder"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor={`${workflow}-output`}>Output path</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`${workflow}-output`}
                        value={form.outputPath}
                        onChange={(event) => updateForm(workflow, { outputPath: event.target.value })}
                        placeholder="/home/output"
                      />
                      <Button type="button" variant="outline" onClick={() => void openBrowser(workflow, "outputPath")}>
                        <Folder className="mr-2 h-4 w-4" /> Browse
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor={`${workflow}-log`}>Log path</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`${workflow}-log`}
                      value={form.logPath}
                      onChange={(event) => updateForm(workflow, { logPath: event.target.value })}
                      placeholder="/home/logs"
                    />
                    <Button type="button" variant="outline" onClick={() => void openBrowser(workflow, "logPath")}>
                      <Folder className="mr-2 h-4 w-4" /> Browse
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${workflow}-script`}>Script path</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`${workflow}-script`}
                      value={form.scriptPath}
                      onChange={(event) => updateForm(workflow, { scriptPath: event.target.value })}
                      placeholder={DEFAULT_SEARCH_TILES_SCRIPT_PATH}
                    />
                    <Button type="button" variant="outline" onClick={() => void openBrowser(workflow, "scriptPath")}>
                      <Folder className="mr-2 h-4 w-4" /> Browse
                    </Button>
                  </div>
                </div>

                {workflow === "routing" ? (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${workflow}-maxspeed-path`}>Maxspeed and turnlanes path</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`${workflow}-maxspeed-path`}
                          value={form.maxspeedAndTurnlanesPath}
                          onChange={(event) => updateForm(workflow, { maxspeedAndTurnlanesPath: event.target.value })}
                          placeholder="/home/maxspeed-turnlanes"
                        />
                        <Button type="button" variant="outline" onClick={() => void openBrowser(workflow, "maxspeedAndTurnlanesPath")}>
                          <Folder className="mr-2 h-4 w-4" /> Browse
                        </Button>
                      </div>
                    </div>
                    <label htmlFor={`${workflow}-maxspeed-toggle`} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-3 text-sm transition hover:border-primary/40">
                      <Checkbox
                        id={`${workflow}-maxspeed-toggle`}
                        checked={form.addMaxspeedAndTurnlanesToOsm}
                        onCheckedChange={(checked) => updateForm(workflow, { addMaxspeedAndTurnlanesToOsm: checked === true })}
                      />
                      <div className="space-y-0.5">
                        <span className="block font-medium">Add maxspeed and turnlanes to OSM</span>
                      </div>
                    </label>
                  </div>
                ) : null}

                <Button type="button" className="w-full" size="lg" onClick={() => void triggerWorkflow(workflow)} disabled={isBusy}>
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {config.buttonLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-1">
        {([
          ["searchTiles", jobs.searchTiles, searchTilesSummary],
          // ["routing", jobs.routing, routingSummary],
        ] as const).map(([workflow, latestJob, summary]) => (
          <Card key={`${workflow}-summary`} className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{workflowCopy[workflow].label} activity</CardTitle>
                  <CardDescription>{latestJob ? `Latest run ${latestJob.runId}` : "No run started yet."}</CardDescription>
                </div>
                {summary.source === "static" ? <Badge variant="secondary">Static log</Badge> : null}
                {summary.source === "remote" ? <Badge variant="secondary">Live log</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              {latestJob ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  {([
                    ["completed", "Completed", summary.completedCount, undefined],
                    ["failed", "Failed", summary.failedCount, undefined],
                    ["processing", "Processing", summary.processingCount, summary.processingLabel ?? "No active item"],
                    ["pending", "Pending", summary.pendingCount, undefined],
                  ] as const).map(([statusKey, label, value, helperText]) => {
                    const isSelected = selectedSummaryCard?.workflow === workflow && selectedSummaryCard.status === statusKey;
                    const hasFiles = summary.statusFiles[statusKey].length > 0;

                    return (
                      <button
                        key={`${workflow}-${statusKey}`}
                        type="button"
                        onClick={() => {
                          setSelectedSummaryCard(isSelected ? null : { workflow, status: statusKey });
                          setSelectedSummaryPage(1);
                        }}
                        className={`rounded-2xl border border-border/70 bg-slate-950/80 p-4 text-left transition ${hasFiles ? "hover:border-primary/50 hover:bg-slate-900" : "cursor-default"} ${isSelected ? "border-primary/60 ring-1 ring-primary/40" : ""}`}
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
                        <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
                        <p className="mt-1 break-words text-xs text-slate-300">{helperText ?? (hasFiles ? "Click to inspect files" : "No files in this state")}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                  No summary available yet.
                </div>
              )}
              {latestJob && selectedSummaryCard?.workflow === workflow ? (
                (() => {
                  const groupedFiles = groupPathsByRegion(summary.statusFiles[selectedSummaryCard.status]);
                  const totalPages = Math.max(1, Math.ceil(groupedFiles.length / STATUS_DETAIL_REGIONS_PER_PAGE));
                  const currentPage = Math.min(selectedSummaryPage, totalPages);
                  const pageStart = (currentPage - 1) * STATUS_DETAIL_REGIONS_PER_PAGE;
                  const visibleGroups = groupedFiles.slice(pageStart, pageStart + STATUS_DETAIL_REGIONS_PER_PAGE);

                  return (
                    <div className="mt-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium capitalize">{selectedSummaryCard.status} files</p>
                          <p className="text-xs text-muted-foreground">Grouped by region with paginated results.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Files: {summary.statusFiles[selectedSummaryCard.status].length}</Badge>
                          <Badge variant="outline">Regions: {groupedFiles.length}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-background">
                        <ScrollArea className="h-[32rem]">
                          {visibleGroups.length > 0 ? (
                            <div className="divide-y divide-border/50">
                              {visibleGroups.map((group) => (
                                <div key={`${selectedSummaryCard.status}-${group.region}`} className="p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <p className="font-medium">{group.region}</p>
                                      <p className="text-xs text-muted-foreground">{group.paths.length} files</p>
                                    </div>
                                    <Badge variant="secondary">{group.paths.length}</Badge>
                                  </div>
                                  <table className="w-full text-left text-sm">
                                    <thead>
                                      <tr className="border-b border-border/60">
                                        <th className="px-4 py-3 font-medium text-muted-foreground">File</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Path</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.paths.map((path) => (
                                        <tr key={`${group.region}-${path}`} className="border-b border-border/40 last:border-b-0">
                                          <td className="px-4 py-3 align-top font-medium">{pathToFileKey(path)}</td>
                                          <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">{path}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No files in this state.</div>
                          )}
                        </ScrollArea>
                      </div>
                      {groupedFiles.length > STATUS_DETAIL_REGIONS_PER_PAGE ? (
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedSummaryPage((page) => Math.max(1, page - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedSummaryPage((page) => Math.min(totalPages, page + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}
              {/* {latestJob ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">Log status: {summary.validatedStatus}</Badge>
                  {summary.totalCount > 0 ? <Badge variant="outline">Expected files: {summary.totalCount}</Badge> : null}
                  {workflow === "searchTiles" ? <Badge variant="outline">Completed files: {summary.completedCount}</Badge> : null}
                  {workflow === "searchTiles" && summary.totalSubRegionCount > 0 ? <Badge variant="outline">Sub-regions: {summary.completedSubRegionCount}/{summary.totalSubRegionCount}</Badge> : null}
                  {workflow === "searchTiles" && summary.downloadCompleted ? <Badge variant="outline">Download completed</Badge> : null}
                </div>
              ) : null} */}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Run logs</h2>
          <p className="text-sm text-muted-foreground">Only the latest run per workflow is shown. Logs are polled from the runId log webhook.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshLogs()} disabled={refreshing || !jobs.searchTiles}>
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh logs
        </Button>
      </section>

      <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-2">
          {(["searchTiles", "routing"] as WorkflowKey[]).map((workflow) => {
            const job = jobs[workflow];
            const logState = jobLogs[workflow];
            const displayStatus = workflow === "searchTiles" ? searchTilesSummary.validatedStatus : routingSummary.validatedStatus;

            return (
              <Card key={`${workflow}-logs`} className="border-border/60 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                    <CardTitle>{workflowCopy[workflow].label} logs</CardTitle>
                  </div>
                  <CardDescription>Latest run only.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!job ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                      No run started yet.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border/60 bg-background">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{job.runId}</Badge>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(displayStatus)}`}>
                            {displayStatus}
                          </span>
                          {logState.source === "static" ? <Badge variant="secondary">Static</Badge> : null}
                          {logState.source === "remote" ? <Badge variant="secondary">Live</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {job.serverName} · {formatTime(job.requestedAt)}
                        </div>
                      </div>
                      <ScrollArea className="h-64 bg-slate-950 text-slate-100">
                        <div className="space-y-2 p-4 font-mono text-xs leading-6">
                          {logState.lines.length === 0 ? (
                            <p className="text-slate-400">No log output available for this workflow yet.</p>
                          ) : (
                            logState.lines.map((line, index) => (
                              <p key={`${workflow}-${index}`} className="break-words text-slate-200">{line}</p>
                            ))
                          )}
                          {job.lastError ? <p className="text-rose-300">{job.lastError}</p> : null}
                          {logState.lastError ? <p className="text-rose-300">{logState.lastError}</p> : null}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <FolderBrowserModal
        browserState={browserState}
        onClose={() => setBrowserState(null)}
        onNavigate={(path) => void navigateBrowser(path)}
        onConfirm={confirmBrowserSelection}
        onSearch={(value) => setBrowserState((current) => current ? { ...current, search: value } : null)}
        onSelect={(item) => void selectBrowserItem(item)}
      />
    </div>
  );
}
