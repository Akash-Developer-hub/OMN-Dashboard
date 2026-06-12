import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { api } from "@/utils/api";
import { resolveSelectedPipelineVersion, storeSelectedPipelineVersion } from "./pipelineVersion";
import {
  Loader2, Copy, Download, CheckCircle2, AlertCircle,
  Clock, Eye, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, X,
  Search, ChevronsUpDown, ChevronDown, ChevronUp, Server, Terminal,
  Moon, Sun,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICE_COLORS: Record<string, { tab: string; badge: string }> = {
  search:  { tab: "text-blue-600",   badge: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  routing: { tab: "text-emerald-600", badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  tile:    { tab: "text-purple-600",  badge: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

const RUNS_PER_PAGE              = 10;
const RUN_ID_LOGS_URL            = "https://sandbox.vmmaps.com/n8n/webhook/omn/runId-logs";
const REMOVE_LOG_URL             = "https://sandbox.vmmaps.com/n8n/webhook/omn/remove-log";
const LOG_POLL_DELAY             = 500;
const LOG_REQUEST_TIMEOUT        = 3000;
const MAX_LOG_RETRIES            = 3;
const MAX_IDLE_POLLS_WHILE_RUNNING = 600;
const MAX_IDLE_POLLS_AFTER_FINISH  = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

type PipelinePayload  = Record<string, any>;
type ServiceLogState  = { log: string; loading: boolean; error: string | null };
type ServerPathEntry  = { targetServerId?: string; serverId?: string; logPath?: string };

// ─── Log-line parser ─────────────────────────────────────────────────────────
//
// Tries to detect a log level in every line so we can colour it.
// Pattern accepted: anything like "INFO", "[WARN]", "ERROR:" etc.
//

type LogLevel = "info" | "warn" | "error" | "debug" | "plain";

interface ParsedLine {
  timestamp: string;
  level: LogLevel;
  message: string;
  raw: string;
}

const LEVEL_RE = /\b(ERROR|ERR|FATAL|WARN|WARNING|INFO|DEBUG|TRACE)\b/i;

function parseLogLine(raw: string): ParsedLine {
  // Grab leading timestamp-like token (up to first space after date/time chars)
  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*/);
  let timestamp = "";
  let rest = raw;
  if (tsMatch) {
    // Shorten to HH:MM:SS for display
    const full = tsMatch[1];
    const timeOnly = full.match(/(\d{2}:\d{2}:\d{2})/);
    timestamp = timeOnly ? timeOnly[1] : full.slice(0, 8);
    rest = raw.slice(tsMatch[0].length);
  }

  const lvlMatch = rest.match(LEVEL_RE);
  let level: LogLevel = "plain";
  if (lvlMatch) {
    const v = lvlMatch[1].toUpperCase();
    if (v === "ERROR" || v === "ERR" || v === "FATAL") level = "error";
    else if (v === "WARN" || v === "WARNING")           level = "warn";
    else if (v === "INFO")                              level = "info";
    else if (v === "DEBUG" || v === "TRACE")            level = "debug";
  }

  return { timestamp, level, message: rest.trim() || raw, raw };
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  error: "text-red-400",
  warn:  "text-amber-400",
  info:  "text-blue-400",
  debug: "text-zinc-500",
  plain: "text-zinc-400",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: "ERR",
  warn:  "WRN",
  info:  "INF",
  debug: "DBG",
  plain: "   ",
};

// ─── Pipeline-data helpers (unchanged logic) ─────────────────────────────────

function extractPipelineRuns(payload: any): PipelinePayload[] {
  const body = payload?.data ?? payload;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.runs)) return body.runs;
  if (Array.isArray(body?.pipelineRuns)) return body.pipelineRuns;
  return body && typeof body === "object" ? [body] : [];
}

function servicesFor(run?: PipelinePayload | null) {
  if (!run) return [];
  if (Array.isArray(run.servicesList)) return run.servicesList;
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object")
    return Object.keys(run.services);
  if (Array.isArray(run.services))
    return run.services.map((i: any) => i?.service ?? i?.name).filter(Boolean);
  return ["search", "routing", "tile"];
}

function statusFor(service: string, payload: PipelinePayload) {
  const svcData = payload?.services?.[service];
  const raw = svcData?.status;
  const log = svcData?.log ?? "";
  if (!raw) return { status: "pending", log };
  const v = String(raw).toLowerCase();
  if (v === "success" || v === "completed") return { status: "success", log };
  if (v === "failed"  || v === "error")     return { status: "failed",  log };
  return { status: "pending", log };
}

function getServiceData(run: PipelinePayload | null, service: string | null) {
  if (!run || !service) return null;
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object")
    return run.services[service] ?? null;
  if (Array.isArray(run.services))
    return run.services.find((i: any) => i?.service === service || i?.name === service) ?? null;
  return run[service] ?? null;
}

function pickFirstString(...values: any[]) {
  const found = values.find((v) => typeof v === "string" && v.trim());
  return found ? String(found).trim() : "";
}

function targetServerFor(run: PipelinePayload | null, service: string | null) {
  const d = getServiceData(run, service);
  return pickFirstString(d?.targetServer, d?.target_server, d?.targetServerName,
    d?.devServerName, d?.server, run?.targetServer, run?.target_server,
    run?.targetServerName, run?.devServerName, run?.server);
}

function sIdFor(run: PipelinePayload | null, service: string | null) {
  const d = getServiceData(run, service);
  return pickFirstString(d?.sId, d?.sid, d?.sessionId, d?.executionId,
    run?.[`${service}SId`], run?.[`${service}_sId`]);
}

function targetServerIdFor(run: PipelinePayload | null, service: string | null) {
  const d = getServiceData(run, service);
  return pickFirstString(d?.targetServerId, d?.target_server_id, d?.serverId,
    run?.[`${service}TargetServerId`], run?.[`${service}_targetServerId`],
    run?.targetServerId, run?.target_server_id, run?.serverId);
}

function flattenServerPaths(serverPaths: Record<string, ServerPathEntry[]> | ServerPathEntry[] | undefined): ServerPathEntry[] {
  if (!serverPaths) return [];
  if (Array.isArray(serverPaths)) return serverPaths;
  return Object.values(serverPaths).flat();
}

function joinLogPath(basePath: string, fileName: string) {
  return `${basePath.trim().replace(/\/+$/, "")}/${fileName}`;
}

async function fetchServerLogBasePath(targetServerId: string, version?: string | null) {
  const params = version ? { version } : undefined;
  const res = await api.get("/admin-dashboard/pipeline-config/server-path", { params });
  const serverPaths = res.data?.data?.serverPaths || res.data?.serverPaths || {};
  const pathInfo = flattenServerPaths(serverPaths).find((p) => (p.targetServerId || p.serverId) === targetServerId);
  return pathInfo?.logPath?.trim() ?? null;
}

function normalizeLogLines(payload: any): string[] {
  const body = payload?.data ?? payload;
  const candidates = [body?.logs, body?.lines, body?.logLines, body?.data?.logs, body?.data?.lines, Array.isArray(body) ? body : null];
  const raw = candidates.find((i) => Array.isArray(i) || typeof i === "string");
  if (Array.isArray(raw))
    return raw.map((i) => typeof i === "string" ? i : i?.message ? String(i.message) : i?.line ? String(i.line) : i?.log ? String(i.log) : JSON.stringify(i)).filter(Boolean);
  if (typeof raw === "string") return raw ? [raw] : [];
  if (typeof body?.log === "string") return [body.log];
  if (typeof body?.message === "string") return [body.message];
  return [];
}

function extractNewOffset(payload: any): number | null {
  const body = payload?.data ?? payload;
  const value = body?.newOffset ?? body?.data?.newOffset ?? body?.offset ?? body?.data?.offset;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractLogCompleted(payload: any): boolean {
  const body = payload?.data ?? payload;
  const value = body?.completed ?? body?.complete ?? body?.done ?? body?.finished ?? body?.isComplete
    ?? body?.data?.completed ?? body?.data?.complete ?? body?.data?.done ?? body?.data?.finished ?? body?.data?.isComplete;
  return value === true || String(value).toLowerCase() === "true";
}

// ─── Small UI components ─────────────────────────────────────────────────────

function StatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const px = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  if (status === "success")
    return (
      <span className={`inline-flex items-center gap-1 ${px} rounded-full font-medium text-emerald-600 border border-emerald-500/20 bg-emerald-500/10`}>
        <CheckCircle2 className="w-3 h-3" /> Success
      </span>
    );
  if (status === "failed")
    return (
      <span className={`inline-flex items-center gap-1 ${px} rounded-full font-medium text-destructive border border-destructive/20 bg-destructive/10`}>
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 ${px} rounded-full font-medium text-amber-600 border border-amber-500/20 bg-amber-500/10`}>
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "success") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />;
  if (status === "failed")  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />;
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />;
}

// ─── JSON Payload Viewer ─────────────────────────────────────────────────────

function JsonNode({ data, depth = 0 }: { data: any; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null) return <span className="text-zinc-500 font-mono text-xs">null</span>;
  if (typeof data === "boolean") return <span className="text-amber-400 font-mono text-xs">{String(data)}</span>;
  if (typeof data === "number") return <span className="text-blue-400 font-mono text-xs">{data}</span>;
  if (typeof data === "string") return <span className="text-emerald-400 font-mono text-xs">"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-zinc-500 font-mono text-xs">[]</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-zinc-400 hover:text-zinc-200 font-mono text-xs focus:outline-none">
          {collapsed ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
          {collapsed ? ` [ ${data.length} items ]` : " ["}
        </button>
        {!collapsed && (
          <div style={{ marginLeft: 16 }}>
            {data.map((item, i) => (
              <div key={i} className="font-mono text-xs">
                <span className="text-zinc-600">{i}: </span>
                <JsonNode data={item} depth={depth + 1} />
                {i < data.length - 1 && <span className="text-zinc-600">,</span>}
              </div>
            ))}
            <div className="text-zinc-400 font-mono text-xs">]</div>
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="text-zinc-500 font-mono text-xs">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-zinc-400 hover:text-zinc-200 font-mono text-xs focus:outline-none">
          {collapsed ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
          {collapsed ? ` { ${keys.length} keys }` : " {"}
        </button>
        {!collapsed && (
          <div style={{ marginLeft: 16 }}>
            {keys.map((key, i) => (
              <div key={key} className="font-mono text-xs leading-relaxed">
                <span className="text-sky-400">"{key}"</span>
                <span className="text-zinc-500">: </span>
                <JsonNode data={data[key]} depth={depth + 1} />
                {i < keys.length - 1 && <span className="text-zinc-600">,</span>}
              </div>
            ))}
            <div className="text-zinc-400 font-mono text-xs">{"}"}</div>
          </div>
        )}
      </span>
    );
  }

  return <span className="text-zinc-300 font-mono text-xs">{String(data)}</span>;
}

function PayloadViewer({ data }: { data: any }) {
  const [search, setSearch] = useState("");
  const [collapseAll, setCollapseAll] = useState(false);

  // For search, we fall back to plain JSON string highlighting
  const jsonText = JSON.stringify(data, null, 2);

  const filteredLines = search.trim()
    ? jsonText.split("\n").filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700 bg-zinc-900 shrink-0">
        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys or values…"
          className="flex-1 bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-3 h-3" />
          </button>
        )}
        <div className="w-px h-4 bg-zinc-700" />
        <button
          onClick={() => setCollapseAll(!collapseAll)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <ChevronsUpDown className="w-3 h-3" />
          {collapseAll ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
        {search.trim() ? (
          /* Search results — plain filtered lines */
          filteredLines && filteredLines.length > 0 ? (
            <div>
              <p className="text-xs text-zinc-500 mb-3">{filteredLines.length} matching lines</p>
              <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                {filteredLines.map((line, i) => {
                  const idx = line.toLowerCase().indexOf(search.toLowerCase());
                  if (idx === -1) return <span key={i}>{line}{"\n"}</span>;
                  return (
                    <span key={i}>
                      {line.slice(0, idx)}
                      <mark className="bg-amber-400/30 text-amber-200 rounded-sm">{line.slice(idx, idx + search.length)}</mark>
                      {line.slice(idx + search.length)}
                      {"\n"}
                    </span>
                  );
                })}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 mt-4 text-center">No results for "{search}"</p>
          )
        ) : (
          /* Interactive tree */
          <div key={String(collapseAll)} className="font-mono text-xs text-zinc-300 leading-relaxed">
            <JsonNode data={data} depth={0} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Terminal Log Viewer ──────────────────────────────────────────────────────

function TerminalLog({
  logText,
  loading,
  error,
  theme,
}: {
  logText: string;
  loading: boolean;
  error: string | null;
  theme: "dark" | "light";
}) {
  const lines: ParsedLine[] = logText
    ? logText.split("\n").map(parseLogLine)
    : [];
  const isDark = theme === "dark";
  const shellClass = isDark ? "bg-[#0d1117] text-zinc-300" : "bg-white text-slate-800";
  const mutedClass = isDark ? "text-zinc-500" : "text-slate-500";
  const emptyClass = isDark ? "text-zinc-600" : "text-slate-400";
  const timestampClass = isDark ? "text-zinc-600" : "text-slate-400";
  const rowClass = isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-100";
  const lineTextClass = (level: LogLevel) =>
    level === "plain"
      ? isDark ? "text-zinc-300" : "text-slate-700"
      : isDark ? "text-zinc-200" : "text-slate-800";

  return (
    <div className={`min-h-full font-mono text-xs leading-relaxed p-3 rounded-b-lg ${shellClass}`}>
      {loading && !logText ? (
        <span className={`inline-flex items-center gap-2 ${mutedClass}`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching logs…
        </span>
      ) : error ? (
        <span className="text-red-400">{error}</span>
      ) : lines.length > 0 ? (
        lines.map((line, i) => (
          <div key={i} className={`flex gap-2 px-1 rounded group ${rowClass}`}>
            {line.timestamp && (
              <span className={`shrink-0 select-none w-16 ${timestampClass}`}>{line.timestamp}</span>
            )}
            <span className={`shrink-0 w-7 font-semibold ${LEVEL_STYLES[line.level]}`}>
              {LEVEL_LABEL[line.level]}
            </span>
            <span className={lineTextClass(line.level)}>
              {line.message}
            </span>
          </div>
        ))
      ) : (
        <span className={emptyClass}>No log output yet.</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataPipelineLog({ runId }: { runId?: string }) {
  const location      = useLocation();
  const queryRunId    = new URLSearchParams(location.search).get("runId") ?? undefined;
  const effectiveRunId = runId ?? queryRunId;

  const [loading,           setLoading]           = useState(false);
  const [refreshing,        setRefreshing]        = useState(false);
  const [runs,              setRuns]              = useState<PipelinePayload[] | null>(null);
  const [selectedRun,       setSelectedRun]       = useState<PipelinePayload | null>(null);
  const [selectedService,   setSelectedService]   = useState<string | null>(null);
  const [showPayloadPage,   setShowPayloadPage]   = useState(false);
  const [copySuccess,       setCopySuccess]       = useState(false);
  const [payloadCopySuccess,setPayloadCopySuccess]= useState(false);
  const [selectedVersion,   setSelectedVersion]   = useState<string | null>(null);
  const [emptyVersion,      setEmptyVersion]      = useState<string | null>(null);
  const [serviceLogs,       setServiceLogs]       = useState<Record<string, ServiceLogState>>({});
  const [currentPage,       setCurrentPage]       = useState(1);
  const [runsCollapsed,     setRunsCollapsed]     = useState(false);
  const [logTheme,          setLogTheme]          = useState<"dark" | "light">("dark");

  const logScrollRef              = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef    = useRef(true);
  const removeLogCallsRef         = useRef<Set<string>>(new Set());
  const selectedRunRef            = useRef<PipelinePayload | null>(null);

  useEffect(() => {
    selectedRunRef.current = selectedRun;
  }, [selectedRun]);

  // ── Version + data fetch ──────────────────────────────────────────────────

  const fetchData = useCallback(async (isRefresh = false, version?: string | null) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = version ? { version } : undefined;

      if (effectiveRunId) {
        const res = await api.get("/admin-dashboard/data-pipeline/fetch-pipeline", { params: { ...params, runId: effectiveRunId } });
        const arr = extractPipelineRuns(res.data ?? res);
        const body = arr.find((i) => i?.runId === effectiveRunId || i?._id === effectiveRunId || i?.id === effectiveRunId) ?? arr[0] ?? null;
        setRuns(body ? [body] : []);
        setSelectedRun(body);
        setSelectedService(servicesFor(body)[0] ?? null);
        setEmptyVersion(!body && version ? version : null);
      } else {
        const res = await api.get("/admin-dashboard/data-pipeline/fetch-pipeline", { params });
        const arr = extractPipelineRuns(res.data ?? res);
        arr.sort((a: any, b: any) => {
          const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        setRuns(arr);
        setEmptyVersion(arr.length === 0 && version ? version : null);
        if (arr.length > 0) {
          const prevId = selectedRunRef.current?.runId ?? selectedRunRef.current?.id;
          const nextRun = prevId ? (arr.find((r) => (r?.runId ?? r?.id) === prevId) ?? arr[0]) : arr[0];
          setSelectedRun(nextRun);
          setSelectedService(servicesFor(nextRun)[0] ?? null);
        } else {
          setSelectedRun(null);
          setSelectedService(null);
        }
      }
    } catch {
      if (!isRefresh) { setRuns(null); setSelectedRun(null); }
      setEmptyVersion(null);
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, [effectiveRunId]);

  // ── Remove-log helper ─────────────────────────────────────────────────────

  const removeSuccessfulServiceLog = useCallback(async (
    run: PipelinePayload, service: string, runKey: string, targetServer: string, sId: string,
  ) => {
    if (statusFor(service, run).status !== "success") return;
    const targetServerId = targetServerIdFor(run, service);
    if (!targetServerId) return;
    const removeKey = `${runKey}:${service}:${targetServerId}:${sId}`;
    if (removeLogCallsRef.current.has(removeKey)) return;
    removeLogCallsRef.current.add(removeKey);
    try {
      const logBasePath = await fetchServerLogBasePath(targetServerId, selectedVersion);
      if (!logBasePath) return;
      await axios.post(REMOVE_LOG_URL, { server: targetServer, sId, logPath: joinLogPath(logBasePath, `${sId}.log`) }, { timeout: LOG_REQUEST_TIMEOUT });
    } catch {
      removeLogCallsRef.current.delete(`${runKey}:${service}:${targetServerId}:${sId}`);
    }
  }, [selectedVersion]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const selectedPipelineVersion = resolveSelectedPipelineVersion(new URLSearchParams(location.search));
    setSelectedVersion(selectedPipelineVersion || null);
    if (selectedPipelineVersion) storeSelectedPipelineVersion(selectedPipelineVersion);
    fetchData(false, selectedPipelineVersion || null);
  }, [fetchData, location.search]);

  useEffect(() => { setCurrentPage(1); }, [runs?.length]);

  // ── Log polling ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedRun || !selectedService) return;
    const runKey        = String(selectedRun?.runId ?? selectedRun?.id ?? selectedRun?._id ?? "");
    const logKey        = `${runKey}:${selectedService}`;
    const targetServer  = targetServerFor(selectedRun, selectedService);
    const targetServerId = targetServerIdFor(selectedRun, selectedService);
    const sId           = sIdFor(selectedRun, selectedService);

    if (!targetServer || !sId || !targetServerId) {
      setServiceLogs((prev) => ({
        ...prev,
        [logKey]: { log: "", loading: false, error: !targetServer ? "Target server is missing." : !sId ? "sId is missing." : "Target server id is missing." },
      }));
      return;
    }

    const controller = new AbortController();
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    const wait = () => new Promise<void>((res) => { const id = setTimeout(res, LOG_POLL_DELAY); pendingTimeouts.push(id); });

    async function poll() {
      setServiceLogs((prev) => ({ ...prev, [logKey]: { log: "", loading: true, error: null } }));
      const lines: string[] = [];
      let offset = 0, retryCount = 0, idlePollCount = 0;
      const svcStatus  = statusFor(selectedService!, selectedRun!).status;
      const fallbackLog = statusFor(selectedService!, selectedRun!).log;

      try {
        const logBasePath = await fetchServerLogBasePath(targetServerId, selectedVersion);
        if (!logBasePath) throw new Error("Server log path is not configured for the selected server.");
        const logPath = joinLogPath(logBasePath, `${sId}.log`);

        void api.post("/admin-dashboard/data-pipeline/monitor-logs", {
          runId: runKey,
          service: selectedService,
          targetServer,
          sId,
          offset: 0,
          logPath,
          version: selectedVersion,
        }).catch((e: any) => {
          console.warn("Failed to start backend generation log monitor", e?.response?.data ?? e?.message ?? e);
        });

        while (!controller.signal.aborted) {
          try {
            const res = await axios.post(RUN_ID_LOGS_URL, { targetServer, sId, offset, logPath }, { signal: controller.signal, timeout: LOG_REQUEST_TIMEOUT });
            const newLogs = normalizeLogLines(res.data);
            if (newLogs.length > 0) lines.push(...newLogs);
            retryCount = 0;
            setServiceLogs((prev) => ({ ...prev, [logKey]: { log: lines.join("\n"), loading: true, error: null } }));
            const newOffset = extractNewOffset(res.data);
            const completed = extractLogCompleted(res.data) || svcStatus === "success" || svcStatus === "failed";
            if (newOffset !== null && newOffset !== offset) { offset = newOffset; idlePollCount = 0; } else idlePollCount++;
            if (idlePollCount >= (completed ? MAX_IDLE_POLLS_AFTER_FINISH : MAX_IDLE_POLLS_WHILE_RUNNING)) break;
            if (!controller.signal.aborted) await wait();
          } catch (e: any) {
            if (e?.name === "AbortError" || e?.code === "ERR_CANCELED") break;
            if (++retryCount >= MAX_LOG_RETRIES) throw e;
            await wait();
          }
        }
        const finalLog = lines.length > 0 ? lines.join("\n") : fallbackLog;
        setServiceLogs((prev) => ({ ...prev, [logKey]: { log: finalLog, loading: false, error: null } }));
        if (!controller.signal.aborted)
          await removeSuccessfulServiceLog(selectedRun!, selectedService!, runKey, targetServer, sId);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        const finalLog = lines.length > 0 ? lines.join("\n") : fallbackLog;
        setServiceLogs((prev) => ({ ...prev, [logKey]: { log: finalLog, loading: false, error: finalLog ? null : e?.message || "Failed to fetch logs." } }));
      }
    }

    poll();
    return () => { controller.abort(); pendingTimeouts.forEach(clearTimeout); };
  }, [removeSuccessfulServiceLog, selectedRun, selectedService, selectedVersion]);

  // ── Scroll-to-bottom ──────────────────────────────────────────────────────

  const activeRunKey   = String(selectedRun?.runId ?? selectedRun?.id ?? selectedRun?._id ?? "");
  const activeLogState = selectedService ? serviceLogs[`${activeRunKey}:${selectedService}`] : null;
  const activeLogText  = activeLogState?.log ?? (selectedService ? statusFor(selectedService, selectedRun || {}).log : "");

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      const el = logScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [activeRunKey, selectedService]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      const el = logScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [activeLogText, activeLogState?.loading]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const formatDate = (ts?: number | string) => {
    if (!ts) return "—";
    const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
    return d.toLocaleString();
  };

  const timeAgo = (ts?: number | string) => {
    if (!ts) return "—";
    const d    = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const overallStatus = (run: PipelinePayload) => {
    const services = servicesFor(run);
    let hasPending = false;
    for (const s of services) {
      const v = String(run?.services?.[s]?.status ?? "").toLowerCase();
      if (v === "failed" || v === "error") return "failed";
      if (!v || v === "pending") hasPending = true;
    }
    return hasPending ? "pending" : "success";
  };

  const downloadLog = (name: string, log: string) => {
    const rid  = selectedRun?.runId ?? selectedRun?.id ?? "run";
    const blob = new Blob([log || ""], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${rid}_${name}.log`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyLog = (log: string) => {
    navigator.clipboard.writeText(log || "").then(() => {
      setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const getServicePayload = (run: PipelinePayload | null, svc: string | null): any => {
    if (!run || !svc) return null;
    if (run.services && !Array.isArray(run.services)) return run.services[svc] ?? null;
    if (Array.isArray(run.services)) return run.services.find((i: any) => i?.service === svc || i?.name === svc) ?? null;
    return run[svc] ?? null;
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages    = Math.ceil((runs?.length ?? 0) / RUNS_PER_PAGE);
  const paginatedRuns = (runs ?? []).slice((currentPage - 1) * RUNS_PER_PAGE, currentPage * RUNS_PER_PAGE);
  const goToPage      = (p: number) => { if (p >= 1 && p <= totalPages) setCurrentPage(p); };
  const pageButtons   = () => {
    const out: number[] = [];
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) out.push(i);
    return out;
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const services              = selectedRun ? servicesFor(selectedRun) : [];
  const selectedServiceData   = selectedService ? statusFor(selectedService, selectedRun || {}) : null;
  const selectedLogState      = selectedService ? serviceLogs[`${activeRunKey}:${selectedService}`] : null;
  const selectedServicePayload = getServicePayload(selectedRun, selectedService);
  const targetServer          = targetServerFor(selectedRun, selectedService);

  // ─── Loading / empty states ───────────────────────────────────────────────

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading logs…
      </div>
    );

  if (!runs || runs.length === 0)
    return (
      <div className="h-full min-h-[320px] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Terminal className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No logs found</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {emptyVersion ? (
              <>
                No logs found for version{" "}
                <span className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
                  {emptyVersion}
                </span>.
              </>
            ) : "No logs are available right now."}
          </p>
          <button
            onClick={() => fetchData(true, selectedVersion)}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>
    );

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col relative">

      {/* ── Top header ── */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-semibold leading-tight">Pipeline Logs</h2>
          <p className="text-xs text-muted-foreground">View runs and their service logs</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedVersion && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <span>Version</span>
              <span className="font-mono font-medium text-foreground">{selectedVersion}</span>
            </span>
          )}
          <button
            onClick={() => fetchData(true, selectedVersion)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        {/* ── Left: run list ── */}
        <aside className={`${runsCollapsed ? "w-11" : "w-72"} border border-border rounded-lg overflow-hidden flex flex-col bg-card shrink-0 transition-all duration-200`}>
          <div className={`${runsCollapsed ? "px-2 py-3" : "px-4 py-3"} border-b border-border flex items-start justify-between gap-2`}>
            {!runsCollapsed && (
              <div className="min-w-0">
            <h3 className="font-semibold text-sm">Pipeline Runs</h3>
            <p className="text-xs text-muted-foreground">{runs.length} total · page {currentPage}/{totalPages || 1}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setRunsCollapsed((value) => !value)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={runsCollapsed ? "Show pipeline runs" : "Hide pipeline runs"}
              aria-label={runsCollapsed ? "Show pipeline runs" : "Hide pipeline runs"}
            >
              {runsCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!runsCollapsed && (
          <>
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-1 p-2">
              {paginatedRuns.map((run) => {
                const rid     = run?.runId ?? run?.id ?? "-";
                const created = run?.createdAt ?? run?.created_at ?? null;
                const status  = overallStatus(run);
                const isSelected = selectedRun === run;

                return (
                  <button
                    key={rid}
                    onClick={() => {
                      setSelectedRun(run);
                      const svcList = servicesFor(run);
                      setSelectedService(svcList[0] ?? null);
                    }}
                    className={
                      "w-full text-left p-3 rounded-md border transition-colors " +
                      (isSelected ? "bg-muted border-primary" : "bg-card border-border hover:bg-muted/50")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{rid}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{formatDate(created)}</div>
                        <div className="text-xs text-muted-foreground">{timeAgo(created)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border px-2 py-2 flex items-center justify-between gap-1">
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
                className="p-1.5 rounded-md hover:bg-muted border border-border disabled:opacity-40 transition-colors" aria-label="Previous">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1">
                {currentPage > 3 && (
                  <>
                    <button onClick={() => goToPage(1)} className="min-w-[28px] h-7 px-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors">1</button>
                    {currentPage > 4 && <span className="text-xs text-muted-foreground px-0.5">…</span>}
                  </>
                )}
                {pageButtons().map((p) => (
                  <button key={p} onClick={() => goToPage(p)}
                    className={"min-w-[28px] h-7 px-1.5 rounded-md text-xs border transition-colors " + (p === currentPage ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                    {p}
                  </button>
                ))}
                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && <span className="text-xs text-muted-foreground px-0.5">…</span>}
                    <button onClick={() => goToPage(totalPages)} className="min-w-[28px] h-7 px-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors">{totalPages}</button>
                  </>
                )}
              </div>
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}
                className="p-1.5 rounded-md hover:bg-muted border border-border disabled:opacity-40 transition-colors" aria-label="Next">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          </>
          )}
        </aside>

        {/* ── Right: detail panel ── */}
        <section className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">

          {selectedRun && (
            <>
              {/* ★ Idea 5: Run summary bar */}
              <div className="border border-border rounded-lg bg-card px-4 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
                <span className="font-mono text-sm font-medium truncate max-w-[200px]">
                  {selectedRun?.runId ?? selectedRun?.id ?? "—"}
                </span>
                <span className="text-muted-foreground text-xs hidden sm:block">·</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDate(selectedRun?.createdAt ?? selectedRun?.created_at)} · {timeAgo(selectedRun?.createdAt ?? selectedRun?.created_at)}
                </span>
                {targetServer && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Server className="w-3 h-3" />
                    {targetServer}
                  </span>
                )}
                <div className="ml-auto">
                  <StatusPill status={overallStatus(selectedRun)} />
                </div>
              </div>

              {/* ★ Idea 2: underline service tabs */}
              <div className="border border-border rounded-lg bg-card overflow-hidden shrink-0">
                <div className="flex overflow-x-auto border-b border-border">
                  {services.map((svc: string) => {
                    const { status } = statusFor(svc, selectedRun);
                    const colors     = SERVICE_COLORS[svc];
                    const isActive   = selectedService === svc;
                    return (
                      <button
                        key={svc}
                        onClick={() => setSelectedService(svc)}
                        className={
                          "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all " +
                          (isActive
                            ? `border-primary ${colors?.tab ?? "text-foreground"} bg-muted/40`
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20")
                        }
                      >
                        <StatusDot status={status} />
                        {svc}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ★ Ideas 3 & 4: dark terminal viewer + consolidated toolbar */}
          {selectedService && selectedServiceData && (
            <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col flex-1 min-h-0">

              {/* ★ Idea 4: toolbar — context left, icon actions right */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${SERVICE_COLORS[selectedService]?.badge ?? "bg-muted text-muted-foreground border-border"}`}>
                    {selectedService}
                  </span>
                  <StatusPill status={selectedServiceData.status} size="sm" />
                  {selectedLogState?.loading && activeLogText && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLogTheme((theme) => theme === "dark" ? "light" : "dark")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors text-muted-foreground"
                    title={`Switch log section to ${logTheme === "dark" ? "light" : "dark"} mode`}
                  >
                    {logTheme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    {logTheme === "dark" ? "Light" : "Dark"}
                  </button>
                  <button onClick={() => setShowPayloadPage(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors text-muted-foreground"
                    title="View payload">
                    <Eye className="w-3.5 h-3.5" /> Payload
                  </button>
                  <button onClick={() => copyLog(activeLogText)}
                    className={`p-1.5 rounded-md border transition-colors ${copySuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "border-border hover:bg-muted text-muted-foreground"}`}
                    title="Copy log">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => downloadLog(selectedService, activeLogText)}
                    className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
                    title="Download log">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ★ Idea 3: dark terminal log */}
              <div
                ref={logScrollRef}
                className={`flex-1 overflow-auto ${logTheme === "dark" ? "bg-[#0d1117]" : "bg-white"}`}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                <TerminalLog
                  logText={activeLogText}
                  loading={selectedLogState?.loading ?? false}
                  error={selectedLogState?.error ?? null}
                  theme={logTheme}
                />
                {selectedLogState?.loading && activeLogText && (
                  <div className={`${logTheme === "dark" ? "bg-[#0d1117]" : "bg-white"} px-3 pb-2`}>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${logTheme === "dark" ? "text-zinc-500" : "text-slate-500"}`}>
                      <Loader2 className="w-3 h-3 animate-spin" /> Polling for more output…
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Full-page Payload View ── */}
      {showPayloadPage && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background">

          {/* Payload header */}
          <div className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPayloadPage(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="h-5 w-px bg-border" />
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Payload — <span className="text-primary">{selectedService}</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run: {selectedRun?.runId ?? selectedRun?.id ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const text = selectedServicePayload
                    ? JSON.stringify(selectedServicePayload, null, 2)
                    : JSON.stringify({ message: `No payload for ${selectedService}`, fullRun: selectedRun }, null, 2);
                  navigator.clipboard.writeText(text).then(() => { setPayloadCopySuccess(true); setTimeout(() => setPayloadCopySuccess(false), 2000); });
                }}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${payloadCopySuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "border-border bg-card hover:bg-muted"}`}>
                <Copy className="w-3.5 h-3.5" /> {payloadCopySuccess ? "Copied!" : "Copy JSON"}
              </button>
              <button
                onClick={() => {
                  const text = selectedServicePayload ? JSON.stringify(selectedServicePayload, null, 2) : JSON.stringify({ fullRun: selectedRun }, null, 2);
                  const rid  = selectedRun?.runId ?? selectedRun?.id ?? "run";
                  const blob = new Blob([text], { type: "application/json" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href = url; a.download = `${rid}_${selectedService}_payload.json`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button onClick={() => setShowPayloadPage(false)}
                className="p-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Service tab strip */}
          <div className="border-b border-border flex shrink-0">
            {services.map((svc: string) => {
              const isActive = selectedService === svc;
              const { status } = statusFor(svc, selectedRun || {});
              return (
                <button key={svc} onClick={() => setSelectedService(svc)}
                  className={
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all " +
                    (isActive
                      ? `border-primary ${SERVICE_COLORS[svc]?.tab ?? "text-foreground"} bg-muted/40`
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20")
                  }>
                  <StatusDot status={status} />
                  {svc}
                </button>
              );
            })}
          </div>

          {/* ★ Idea 6: interactive JSON viewer */}
          <div className="flex-1 overflow-hidden">
            <PayloadViewer
              data={selectedServicePayload ?? { message: `No payload keys found for ${selectedService}`, fullRun: selectedRun }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
