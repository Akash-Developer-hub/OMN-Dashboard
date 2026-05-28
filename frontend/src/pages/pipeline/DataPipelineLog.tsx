import React, { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { api } from "@/utils/api";
import {
  Loader2, Copy, Download, CheckCircle2, AlertCircle,
  Clock, Eye, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, X,
} from "lucide-react";

const SERVICE_TAG_COLOR: Record<string, string> = {
  search: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  routing: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  tile: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

const RUNS_PER_PAGE = 10;
const RUN_ID_LOGS_URL = "https://sandbox.vmmaps.com/n8n/webhook/runId-logs";
const LOG_POLL_DELAY = 1000;
const LOG_REQUEST_TIMEOUT = 3000;
const MAX_LOG_RETRIES = 3;
const MAX_IDLE_POLLS_WHILE_RUNNING = 600;
const MAX_IDLE_POLLS_AFTER_FINISH = 3;

type PipelinePayload = Record<string, any>;
type ServiceLogState = {
  log: string;
  loading: boolean;
  error: string | null;
};

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
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object") {
    return Object.keys(run.services);
  }
  if (Array.isArray(run.services)) {
    return run.services
      .map((item: any) => item?.service ?? item?.name)
      .filter(Boolean);
  }
  return ["search", "routing", "tile"];
}

function statusFor(service: string, payload: PipelinePayload) {
  const svcData = payload?.services?.[service];
  const raw = svcData?.status;
  const log = svcData?.log ?? "";
  if (!raw) return { status: "pending", log };
  const v = String(raw).toLowerCase();
  if (v === "success" || v === "completed") return { status: "success", log };
  if (v === "failed" || v === "error") return { status: "failed", log };
  return { status: "pending", log };
}

function getServiceData(run: PipelinePayload | null, service: string | null) {
  if (!run || !service) return null;
  if (run.services && !Array.isArray(run.services) && typeof run.services === "object") {
    return run.services[service] ?? null;
  }
  if (Array.isArray(run.services)) {
    return run.services.find((item: any) => item?.service === service || item?.name === service) ?? null;
  }
  return run[service] ?? null;
}

function pickFirstString(...values: any[]) {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return found ? String(found).trim() : "";
}

function targetServerFor(run: PipelinePayload | null, service: string | null) {
  const svcData = getServiceData(run, service);
  return pickFirstString(
    svcData?.targetServer,
    svcData?.target_server,
    svcData?.targetServerName,
    svcData?.devServerName,
    svcData?.server,
    run?.targetServer,
    run?.target_server,
    run?.targetServerName,
    run?.devServerName,
    run?.server,
  );
}

function sIdFor(run: PipelinePayload | null, service: string | null) {
  const svcData = getServiceData(run, service);
  return pickFirstString(
    svcData?.sId,
    svcData?.sid,
    svcData?.sessionId,
    svcData?.executionId,
    run?.[`${service}SId`],
    run?.[`${service}_sId`],
  );
}

function normalizeLogLines(payload: any): string[] {
  const body = payload?.data ?? payload;
  const candidates = [
    body?.logs,
    body?.lines,
    body?.logLines,
    body?.data?.logs,
    body?.data?.lines,
    Array.isArray(body) ? body : null,
  ];
  const raw = candidates.find((item) => Array.isArray(item) || typeof item === "string");

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.message) return String(item.message);
        if (item?.line) return String(item.line);
        if (item?.log) return String(item.log);
        return JSON.stringify(item);
      })
      .filter(Boolean);
  }

  if (typeof raw === "string") return raw ? [raw] : [];
  if (typeof body?.log === "string") return [body.log];
  if (typeof body?.message === "string") return [body.message];
  return [];
}

function extractNewOffset(payload: any): number | null {
  const body = payload?.data ?? payload;
  const value =
    body?.newOffset ??
    body?.data?.newOffset ??
    body?.offset ??
    body?.data?.offset;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function extractLogCompleted(payload: any): boolean {
  const body = payload?.data ?? payload;
  const value =
    body?.completed ??
    body?.complete ??
    body?.done ??
    body?.finished ??
    body?.isComplete ??
    body?.data?.completed ??
    body?.data?.complete ??
    body?.data?.done ??
    body?.data?.finished ??
    body?.data?.isComplete;

  return value === true || String(value).toLowerCase() === "true";
}

function StatusPill({ status }: { status: string }) {
  if (status === "success")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-emerald-600 border border-emerald-500/20 bg-emerald-500/10">
        <CheckCircle2 className="w-3 h-3" /> Success
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-destructive border border-destructive/20 bg-destructive/10">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-amber-600 border border-amber-500/20 bg-amber-500/10">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

export default function DataPipelineLog({ runId }: { runId?: string }) {
  const location = useLocation();
  const queryRunId = new URLSearchParams(location.search).get("runId") ?? undefined;
  const effectiveRunId = runId ?? queryRunId;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [runs, setRuns] = useState<PipelinePayload[] | null>(null);
  const [selectedRun, setSelectedRun] = useState<PipelinePayload | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showPayloadPage, setShowPayloadPage] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [payloadCopySuccess, setPayloadCopySuccess] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [emptyVersion, setEmptyVersion] = useState<string | null>(null);
  const [serviceLogs, setServiceLogs] = useState<Record<string, ServiceLogState>>({});
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const logBottomRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const fetchCurrentVersion = useCallback(async () => {
    try {
      const res = await api.get("http://localhost:3000/api/v1/admin-dashboard/pipeline-config/current-version");
      const version = res.data?.data?.version || res.data?.currentVersion || res.data?.version || "Unknown";
      setCurrentVersion(version);
      return version;
    } catch (err) {
      console.error("Failed to fetch current version:", err);
      setCurrentVersion("Error");
      return null;
    }
  }, []);

  const fetchData = useCallback(async (isRefresh = false, version?: string | null) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const FETCH_URL = "http://localhost:3000/api/v1/admin-dashboard/data-pipeline/fetch-pipeline";
      const params = version && version !== "Unknown" && version !== "Error"
        ? { version }
        : undefined;

      if (effectiveRunId) {
        const res = await api.get(FETCH_URL, { params: { ...params, runId: effectiveRunId } });
        const arr = extractPipelineRuns(res.data ?? res);
        const body =
          arr.find((item) => item?.runId === effectiveRunId || item?._id === effectiveRunId || item?.id === effectiveRunId) ??
          arr[0] ??
          null;
        setRuns(body ? [body] : []);
        setSelectedRun(body);
        const services = servicesFor(body);
        setSelectedService(services[0] ?? null);
        setEmptyVersion(!body && params?.version ? params.version : null);
      } else {
        const res = await api.get(FETCH_URL, { params });
        const arr = extractPipelineRuns(res.data ?? res);
        arr.sort((a: any, b: any) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
        });
        setRuns(arr);
        setEmptyVersion(arr.length === 0 && params?.version ? params.version : null);
        if (arr.length > 0) {
          // On refresh, keep the same run selected if it still exists; else fallback to first
          setSelectedRun((prev) => {
            const prevId = prev?.runId ?? prev?.id;
            const found = prevId ? arr.find((r) => (r?.runId ?? r?.id) === prevId) : null;
            return found ?? arr[0];
          });
          setSelectedService((prevSvc) => {
            if (prevSvc) return prevSvc;
            const services = servicesFor(arr[0]);
            return services[0] ?? null;
          });
        } else {
          setSelectedRun(null);
          setSelectedService(null);
        }
      }
    } catch (err) {
      if (!isRefresh) {
        setRuns(null);
        setSelectedRun(null);
      }
      setEmptyVersion(null);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [effectiveRunId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPipelineRuns() {
      const version = await fetchCurrentVersion();
      if (!cancelled) {
        fetchData(false, version);
      }
    }

    loadPipelineRuns();

    return () => {
      cancelled = true;
    };
  }, [fetchData, fetchCurrentVersion]);

  // Reset to page 1 when runs list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [runs?.length]);

  useEffect(() => {
    if (!selectedRun || !selectedService) return;

    const runKey = String(selectedRun?.runId ?? selectedRun?.id ?? selectedRun?._id ?? "");
    const logKey = `${runKey}:${selectedService}`;
    const targetServer = targetServerFor(selectedRun, selectedService);
    const sId = sIdFor(selectedRun, selectedService);

    if (!targetServer || !sId) {
      setServiceLogs((prev) => ({
        ...prev,
        [logKey]: {
          log: "",
          loading: false,
          error: !targetServer
            ? "Target server is missing for this service."
            : "sId is missing for this service.",
        },
      }));
      return;
    }

    const controller = new AbortController();
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    const waitForNextPoll = () =>
      new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, LOG_POLL_DELAY);
        pendingTimeouts.push(timeoutId);
      });

    async function fetchRunIdLogs() {
      setServiceLogs((prev) => ({
        ...prev,
        [logKey]: { log: "", loading: true, error: null },
      }));

      const lines: string[] = [];
      let offset = 0;
      let retryCount = 0;
      let idlePollCount = 0;
      const serviceStatus = statusFor(selectedService, selectedRun).status;

      try {
        while (!controller.signal.aborted) {
          try {
            const res = await axios.post(
              RUN_ID_LOGS_URL,
              {
                targetServer,
                sId,
                offset,
              },
              {
                signal: controller.signal,
                timeout: LOG_REQUEST_TIMEOUT,
              }
            );

            const data = res.data;
            const newLogs = normalizeLogLines(data);
            if (newLogs.length > 0) {
              lines.push(...newLogs);
            }
            retryCount = 0;

            setServiceLogs((prev) => ({
              ...prev,
              [logKey]: {
                log: lines.join("\n"),
                loading: true,
                error: null,
              },
            }));

            const newOffset = extractNewOffset(data);
            const completed =
              extractLogCompleted(data) ||
              serviceStatus === "success" ||
              serviceStatus === "failed";

            if (newOffset !== null && newOffset !== offset) {
              offset = newOffset;
              idlePollCount = 0;
            } else {
              idlePollCount += 1;
            }

            const maxIdlePolls = completed
              ? MAX_IDLE_POLLS_AFTER_FINISH
              : MAX_IDLE_POLLS_WHILE_RUNNING;

            if (idlePollCount >= maxIdlePolls) {
              break;
            }

            if (!controller.signal.aborted) {
              await waitForNextPoll();
            }
          } catch (pollErr: any) {
            if (pollErr?.name === "AbortError" || pollErr?.code === "ERR_CANCELED") {
              break;
            }

            retryCount++;
            if (retryCount >= MAX_LOG_RETRIES) {
              throw pollErr;
            }

            console.warn(
              `API call failed (attempt ${retryCount}/${MAX_LOG_RETRIES}):`,
              pollErr?.message
            );

            await waitForNextPoll();
          }
        }

        setServiceLogs((prev) => ({
          ...prev,
          [logKey]: {
            log: lines.join("\n"),
            loading: false,
            error: null,
          },
        }));
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setServiceLogs((prev) => ({
          ...prev,
          [logKey]: {
            log: lines.join("\n"),
            loading: false,
            error: err?.message || "Failed to fetch run logs.",
          },
        }));
      }
    }

    // Call fetchRunIdLogs immediately when effect runs
    fetchRunIdLogs();

    return () => {
      controller.abort();
      // Clean up all pending timeouts
      pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [selectedRun, selectedService]);

  const activeRunKey = String(selectedRun?.runId ?? selectedRun?.id ?? selectedRun?._id ?? "");
  const activeLogState =
    selectedService ? serviceLogs[`${activeRunKey}:${selectedService}`] : null;
  const activeLogText =
    activeLogState?.log ??
    (selectedService ? statusFor(selectedService, selectedRun || {}).log : "");

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      logBottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, [activeRunKey, selectedService]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      logBottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, [activeLogText]);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading logs…
      </div>
    );
  if (!runs || runs.length === 0)
    return (
      <div className="h-full min-h-[320px] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No pipeline runs found
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {emptyVersion ? (
              <>
                There is no pipeline run for this particular version{" "}
                <span className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
                  {emptyVersion}
                </span>
                .
              </>
            ) : (
              "No pipeline runs are available right now."
            )}
          </p>
        </div>
      </div>
    );

  const formatDate = (ts?: number | string) => {
    if (!ts) return "—";
    const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
    return d.toLocaleString();
  };

  const timeAgo = (ts?: number | string) => {
    if (!ts) return "—";
    const d = typeof ts === "number" ? new Date(ts) : new Date(String(ts));
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
    const st = (run?.services?.[s]?.status ?? "") as string;
    const v = String(st).toLowerCase();
    if (v === "failed" || v === "error") return "failed";
    if (!v || v === "pending") hasPending = true;
  }
  return hasPending ? "pending" : "success";
};

  const downloadLog = (name: string, log: string) => {
    try {
      const rid = selectedRun?.runId ?? selectedRun?.id ?? "run";
      const blob = new Blob([log || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${rid}_${name}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const copyLog = (log: string) => {
    try {
      navigator.clipboard
        .writeText(log || "")
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        })
        .catch((err) => console.error("Copy failed:", err));
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  // ── Pagination logic ──────────────────────────────────────────────────────
  const totalPages = Math.ceil(runs.length / RUNS_PER_PAGE);
  const paginatedRuns = runs.slice(
    (currentPage - 1) * RUNS_PER_PAGE,
    currentPage * RUNS_PER_PAGE,
  );

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Build page number buttons (show up to 5 pages around current)
  const pageButtons = () => {
    const delta = 2;
    const range: number[] = [];
    for (
      let i = Math.max(1, currentPage - delta);
      i <= Math.min(totalPages, currentPage + delta);
      i++
    ) {
      range.push(i);
    }
    return range;
  };
  // ─────────────────────────────────────────────────────────────────────────

  const services = selectedRun
    ? servicesFor(selectedRun)
    : [];
  const selectedServiceData = selectedService
    ? statusFor(selectedService, selectedRun || {})
    : null;
  const selectedRunKey = activeRunKey;
  const selectedLogState =
    selectedService ? serviceLogs[`${selectedRunKey}:${selectedService}`] : null;
  const selectedLogText = activeLogText;

  const getServicePayload = (run: PipelinePayload | null, svc: string | null) => {
    if (!run || !svc) return null;
    if (run.services && !Array.isArray(run.services) && typeof run.services === "object") {
      const svcPayload = run.services[svc];
      if (svcPayload !== undefined) return svcPayload;
    }
    if (Array.isArray(run.services)) {
      const svcPayload = run.services.find((item: any) => item?.service === svc || item?.name === svc);
      if (svcPayload !== undefined) return svcPayload;
    }
    if (run[svc] !== undefined) return run[svc];
    const lowerSvc = svc.toLowerCase();
    const result: Record<string, any> = {};
    const commonSuffixes = ["payload", "request", "response", "data", "body"];
    for (const k of Object.keys(run)) {
      const kl = k.toLowerCase();
      if (
        kl.startsWith(lowerSvc) ||
        commonSuffixes.some(
          (suf) =>
            kl === `${lowerSvc}${suf}` ||
            (kl.endsWith(suf) && kl.includes(lowerSvc)),
        )
      ) {
        result[k] = run[k];
      }
      if (
        k === "services" &&
        run[k] &&
        typeof run[k] === "object" &&
        run[k][svc] !== undefined
      ) {
        result["services"] = { [svc]: run[k][svc] };
      }
    }
    for (const suf of commonSuffixes) {
      const key = `${svc}${suf}`;
      if (run[key] !== undefined) result[key] = run[key];
    }
    return Object.keys(result).length ? result : null;
  };

  const selectedServicePayload = getServicePayload(selectedRun, selectedService);

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Logs</h2>
          <p className="text-xs text-muted-foreground">View runs and their service logs</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Current Version Display */}
          {currentVersion && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Version:</span> 
              <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">
                {currentVersion}
              </span>
            </div>
          )}
          
          {/* ── Refresh Button ── */}
          <button
            type="button"
            onClick={() => {
              fetchCurrentVersion().then((version) => fetchData(true, version));
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Left: Runs List */}
        <aside className="w-72 border border-border rounded-lg overflow-hidden flex flex-col bg-card">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Pipeline Runs</h3>
              <p className="text-xs text-muted-foreground">
                {runs.length} total · page {currentPage}/{totalPages}
              </p>
            </div>
          </div>

          {/* Run items */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-1 p-2">
              {paginatedRuns.map((run) => {
                const rid = run?.runId ?? run?.id ?? "-";
                const created = run?.createdAt ?? run?.created_at ?? null;
                const isSelected = selectedRun === run;

                return (
                  <button
                    key={rid}
                    onClick={() => {
                      setSelectedRun(run);
                      const svcList = Array.isArray(run?.servicesList)
                        ? run.servicesList
                        : ["search", "routing", "tile"];
                      setSelectedService(svcList[0] ?? null);
                    }}
                    className={
                      (isSelected
                        ? "bg-muted border-primary"
                        : "bg-card border-border hover:bg-muted/50") +
                      " w-full text-left p-3 rounded-md border transition-colors"
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{rid}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-bold text-foreground">{formatDate(created)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{timeAgo(created)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Pagination Controls ── */}
          {totalPages > 1 && (
            <div className="border-t border-border px-2 py-2 flex items-center justify-between gap-1">
              {/* Prev */}
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-md hover:bg-muted border border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {currentPage > 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => goToPage(1)}
                      className="min-w-[28px] h-7 px-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors"
                    >
                      1
                    </button>
                    {currentPage > 4 && (
                      <span className="text-xs text-muted-foreground px-0.5">…</span>
                    )}
                  </>
                )}

                {pageButtons().map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    className={
                      "min-w-[28px] h-7 px-1.5 rounded-md text-xs border transition-colors " +
                      (p === currentPage
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted")
                    }
                  >
                    {p}
                  </button>
                ))}

                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && (
                      <span className="text-xs text-muted-foreground px-0.5">…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => goToPage(totalPages)}
                      className="min-w-[28px] h-7 px-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              {/* Next */}
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-md hover:bg-muted border border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </aside>

        {/* Right: Run Details */}
        <section className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Service Tabs */}
          {selectedRun && (
            <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">
                  {selectedRun?.runId ?? selectedRun?.id ?? "Run"} — Services
                </h3>
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">
                    {formatDate(selectedRun?.createdAt ?? selectedRun?.created_at)}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 p-3 overflow-y-auto">
                {services.map((svc: string) => {
                  const { status } = statusFor(svc, selectedRun);
                  const tag =
                    SERVICE_TAG_COLOR[svc] ?? "bg-muted text-muted-foreground";
                  const isActive = selectedService === svc;

                  return (
                    <button
                      key={svc}
                      onClick={() => setSelectedService(svc)}
                      className={
                        (isActive ? "ring-2 ring-primary shadow-md" : "") +
                        " px-3 py-2 rounded-md text-sm font-medium border transition-all " +
                        tag
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span>{svc}</span>
                        <StatusPill status={status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Log Viewer */}
          {selectedService && selectedServiceData && (
            <div className="border border-border rounded-lg bg-card overflow-hidden flex flex-col flex-1">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{selectedService} Log</h3>
                  <p className="text-xs text-muted-foreground">
                    Status: {selectedServiceData.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPayloadPage(true)}
                    className="text-xs px-2 py-1 rounded-md hover:bg-muted border border-border transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 inline-block mr-1" /> View Payload
                  </button>
                  <button
                    type="button"
                    onClick={() => copyLog(selectedLogText)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      copySuccess
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                        : "hover:bg-muted border-border"
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 inline-block mr-1" />
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadLog(selectedService, selectedLogText)}
                    className="text-xs px-2 py-1 rounded-md hover:bg-muted border border-border transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 inline-block mr-1" /> Download
                  </button>
                </div>
              </div>
              <div
                ref={logScrollRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  shouldStickToBottomRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="flex-1 overflow-auto p-4 flex flex-col"
              >
                <div className="rounded bg-black/5 p-3 text-xs font-mono whitespace-pre-wrap break-words text-foreground flex-1">
                  {selectedLogState?.loading && !selectedLogText ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching logs...
                    </span>
                  ) : selectedLogState?.error ? (
                    <span className="text-destructive">{selectedLogState.error}</span>
                  ) : selectedLogText ? (
                    selectedLogText
                  ) : (
                    <span className="text-muted-foreground">No log available.</span>
                  )}
                </div>
                {selectedLogState?.loading && selectedLogText && (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Polling for more logs...</span>
                  </div>
                )}
                <div ref={logBottomRef} />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Full-page Payload View */}
      {showPayloadPage && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background">
          {/* Payload Page Header */}
          <div className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPayloadPage(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Logs
              </button>
              <div className="h-5 w-px bg-border" />
              <div>
                <h2 className="text-lg font-semibold leading-none">
                  Payload — <span className="text-primary">{selectedService}</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run: {selectedRun?.runId ?? selectedRun?.id ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Copy payload */}
              <button
                type="button"
                onClick={() => {
                  const text = selectedServicePayload
                    ? JSON.stringify(selectedServicePayload, null, 2)
                    : JSON.stringify({ message: `No payload keys found for ${selectedService}`, fullRun: selectedRun }, null, 2);
                  navigator.clipboard.writeText(text).then(() => {
                    setPayloadCopySuccess(true);
                    setTimeout(() => setPayloadCopySuccess(false), 2000);
                  });
                }}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  payloadCopySuccess
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                {payloadCopySuccess ? "Copied!" : "Copy JSON"}
              </button>

              {/* Download payload */}
              <button
                type="button"
                onClick={() => {
                  const text = selectedServicePayload
                    ? JSON.stringify(selectedServicePayload, null, 2)
                    : JSON.stringify({ message: `No payload keys found for ${selectedService}`, fullRun: selectedRun }, null, 2);
                  const rid = selectedRun?.runId ?? selectedRun?.id ?? "run";
                  const blob = new Blob([text], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${rid}_${selectedService}_payload.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>

              {/* Close X */}
              <button
                type="button"
                onClick={() => setShowPayloadPage(false)}
                className="p-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Service tab strip (read-only context) */}
          <div className="border-b border-border px-6 py-2 flex gap-2 shrink-0">
            {(selectedRun
              ? servicesFor(selectedRun)
              : []
            ).map((svc: string) => {
              const tag = SERVICE_TAG_COLOR[svc] ?? "bg-muted text-muted-foreground border-border";
              const isActive = selectedService === svc;
              return (
                <button
                  key={svc}
                  type="button"
                  onClick={() => setSelectedService(svc)}
                  className={
                    "px-3 py-1 rounded-md text-xs font-medium border transition-all " +
                    tag +
                    (isActive ? " ring-2 ring-primary" : "")
                  }
                >
                  {svc}
                </button>
              );
            })}
          </div>

          {/* JSON Content — fills remaining height, no page scroll */}
          <div className="flex-1 overflow-hidden p-6">
            <div className="h-full rounded-lg border border-border bg-black/[0.03] dark:bg-white/[0.03] overflow-auto">
              <pre className="p-5 text-xs font-mono leading-relaxed text-foreground whitespace-pre break-words">
                {selectedServicePayload
                  ? JSON.stringify(selectedServicePayload, null, 2)
                  : JSON.stringify(
                      {
                        message: `No payload keys found for ${selectedService}`,
                        fullRun: selectedRun,
                      },
                      null,
                      2,
                    )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
