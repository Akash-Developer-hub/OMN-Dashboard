import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Route,
  Search,
  Server,
  TerminalSquare,
  ChevronRight,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

type PipelineRun = Record<string, any>;
type ServicePayload = Record<string, any>;
type DetailIcon = LucideIcon;
type CountStatus = "completed" | "pending" | "failed";

const FETCH_PIPELINE_URL = "/admin-dashboard/data-pipeline/fetch-pipeline";

const serviceMeta: Record<string, { label: string; icon: DetailIcon; accent: string; dot: string }> = {
  routing: {
    label: "Routing",
    icon: Route,
    accent: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  search: {
    label: "Search",
    icon: Search,
    accent: "text-blue-600",
    dot: "bg-blue-500",
  },
  tile: {
    label: "Tile",
    icon: Search,
    accent: "text-violet-600",
    dot: "bg-violet-500",
  },
  tiles: {
    label: "Tiles",
    icon: Search,
    accent: "text-violet-600",
    dot: "bg-violet-500",
  },
  searchTiles: {
    label: "Search & Tiles",
    icon: Search,
    accent: "text-blue-600",
    dot: "bg-blue-500",
  },
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

function getObjectId(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.$oid === "string") return value.$oid;
  return String(value);
}

function getRunId(run: PipelineRun | null) {
  return String(run?.runId || getObjectId(run?._id) || run?.id || "");
}

function getCreatedAt(run: PipelineRun | null) {
  return run?.createdAt ?? run?.created_at ?? run?.updatedAt ?? run?.updated_at ?? null;
}

function createdAtTime(run: PipelineRun | null) {
  const value = new Date(getCreatedAt(run) ?? 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function latestGenerationRun(runs: PipelineRun[]) {
  return [...runs].sort((left, right) => createdAtTime(right) - createdAtTime(left))[0] ?? null;
}

function servicesFor(run: PipelineRun | null) {
  if (!run) return [];
  const rawServices = run.services;
  if (Array.isArray(run.servicesList)) return run.servicesList.map(String);
  if (rawServices && !Array.isArray(rawServices) && typeof rawServices === "object")
    return Object.keys(rawServices);
  if (Array.isArray(rawServices)) {
    return rawServices
      .map((item: any) => item?.service ?? item?.name)
      .filter(Boolean)
      .map(String);
  }
  return ["routing", "search", "tile", "tiles", "searchTiles"].filter((service) =>
    Boolean(run[service])
  );
}

function getServiceData(run: PipelineRun | null, service: string): ServicePayload | null {
  if (!run || !service) return null;
  const rawServices = run.services;
  if (rawServices && !Array.isArray(rawServices) && typeof rawServices === "object") {
    return rawServices[service] ?? null;
  }
  if (Array.isArray(rawServices)) {
    return (
      rawServices.find((item: any) => String(item?.service ?? item?.name ?? "") === service) ?? null
    );
  }
  return run[service] ?? null;
}

function formatLabel(service: string) {
  if (serviceMeta[service]) return serviceMeta[service].label;
  return service
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    ["success", "completed", "complete", "done", "generation_completed", "all_completed"].includes(
      status
    )
  )
    return "completed";
  if (["failed", "failure", "error", "generation_failed"].includes(status)) return "failed";
  if (
    ["running", "processing", "in-progress", "in_progress", "queued", "pending", "generating"].includes(
      status
    )
  )
    return status;
  return status || "unknown";
}

function statusConfig(status: string) {
  if (status === "completed")
    return {
      badge: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
      icon: CheckCircle2,
      dot: "bg-emerald-500",
    };
  if (status === "failed")
    return {
      badge: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
      icon: AlertCircle,
      dot: "bg-red-500",
    };
  if (
    ["running", "processing", "queued", "pending", "generating", "in-progress", "in_progress"].includes(
      status
    )
  )
    return {
      badge: "border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
      icon: Activity,
      dot: "bg-sky-500",
    };
  return {
    badge: "border-border bg-muted text-muted-foreground",
    icon: Clock,
    dot: "bg-muted-foreground",
  };
}

function formatDate(value: unknown) {
  if (!value) return "Not available";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
function asCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) return value.length;
  return null;
}

function getStatusCount(payload: ServicePayload | null, status: CountStatus) {
  if (!payload) return 0;

  const keysByStatus: Record<CountStatus, string[]> = {
    completed: ["completedCount", "successCount", "completed", "success", "passedCount", "passed"],
    pending: ["pendingCount", "runningCount", "queuedCount", "pending", "running", "queued"],
    failed: ["failedCount", "failureCount", "errorCount", "failed", "failure", "errors"],
  };

  const sources = [
    payload,
    payload.counts,
    payload.summary,
    payload.statusCounts,
    payload.statusSummary,
    payload.validationSummary,
    payload.result,
    payload.result?.counts,
    payload.result?.summary,
  ];

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keysByStatus[status]) {
      const count = asCount((source as Record<string, unknown>)[key]);
      if (count !== null) return count;
    }
  }

  const files = payload.statusFiles ?? payload.filesByStatus;
  if (files && typeof files === "object") {
    for (const key of keysByStatus[status]) {
      const count = asCount((files as Record<string, unknown>)[key]);
      if (count !== null) return count;
    }
  }

  return 0;
}

function countCardsForStatus(status: string): CountStatus[] {
  if (["running", "processing", "queued", "pending", "generating", "in-progress", "in_progress"].includes(status)) {
    return ["completed", "pending"];
  }
  if (status === "completed" || status === "success") return ["completed", "failed"];
  return ["completed", "failed"];
}

const countCardStyles: Record<
  CountStatus,
  { label: string; icon: DetailIcon; card: string; iconWrap: string; text: string }
> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    card: "border-emerald-500/25 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100",
    iconWrap: "bg-emerald-500 text-white",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    card: "border-amber-500/25 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100",
    iconWrap: "bg-amber-500 text-white",
    text: "text-amber-700 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    card: "border-red-500/25 bg-red-50 text-red-950 dark:bg-red-500/10 dark:text-red-100",
    iconWrap: "bg-red-500 text-white",
    text: "text-red-700 dark:text-red-300",
  },
};

function StatusCountCard({
  status,
  count,
  expanded,
  onClick,
}: {
  status: CountStatus;
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  const style = countCardStyles[status];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[104px] rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${
        style.card
      } ${expanded ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconWrap}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </div>
      <div className="mt-4">
        <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
          {style.label} Status Count
        </p>
        <p className="mt-1 text-3xl font-bold leading-none">{count}</p>
      </div>
    </button>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────
function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: DetailIcon;
  label: string;
  value: unknown;
  mono?: boolean;
}) {
  const text = displayValue(value);
  const isEmpty = text === "—";

  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-border/60 last:border-0">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={`text-right text-sm font-medium break-all ${
            isEmpty
              ? "text-muted-foreground/50"
              : mono
              ? "font-mono text-foreground"
              : "text-foreground"
          }`}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

// ─── Sidebar Service Item ─────────────────────────────────────────────────────
function ServiceItem({
  service,
  run,
  active,
  onClick,
}: {
  service: string;
  run: PipelineRun;
  active: boolean;
  onClick: () => void;
}) {
  const itemData = getServiceData(run, service);
  const status = normalizeStatus(itemData?.status ?? itemData?.state);
  const meta = serviceMeta[service];
  const Icon = meta?.icon ?? TerminalSquare;
  const cfg = statusConfig(status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-lg px-3 py-3 text-left transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-muted/60"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
            active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground"
          } ${!active && meta?.accent ? meta.accent : ""}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${active ? "text-primary-foreground" : ""}`}>
            {formatLabel(service)}
          </p>
          <p
            className={`truncate text-xs ${
              active ? "text-primary-foreground/60" : "text-muted-foreground"
            }`}
          >
            {displayValue(itemData?.targetServer)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {active && <ChevronRight className="h-3.5 w-3.5 text-primary-foreground/60" />}
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GenerationValidation() {
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);
  const [selectedService, setSelectedService] = useState("");
  const [expandedCountCard, setExpandedCountCard] = useState<CountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatestGeneration = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await api.get(FETCH_PIPELINE_URL);
      const latestRun = latestGenerationRun(extractPipelineRuns(response.data));
      setSelectedRun(latestRun);

      const nextServices = servicesFor(latestRun);
      setSelectedService((current) =>
        current && nextServices.includes(current) ? current : nextServices[0] ?? ""
      );

      if (isRefresh) toast.success("Latest generation refreshed");
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || "Failed to load latest generation.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLatestGeneration();
  }, [loadLatestGeneration]);

  const services = useMemo(() => servicesFor(selectedRun), [selectedRun]);
  const serviceData = useMemo(
    () => getServiceData(selectedRun, selectedService),
    [selectedRun, selectedService]
  );

  const serviceStatus = normalizeStatus(
    serviceData?.status ?? serviceData?.state ?? selectedRun?.status
  );
  const showStatusCountCards = ["search", "tile", "tiles", "searchTiles"].includes(selectedService);
  const visibleCountCards = useMemo(
    () => (showStatusCountCards ? countCardsForStatus(serviceStatus) : []),
    [serviceStatus, showStatusCountCards]
  );
  const statusCounts = useMemo(
    () =>
      visibleCountCards.reduce<Record<CountStatus, number>>(
        (counts, status) => ({ ...counts, [status]: getStatusCount(serviceData, status) }),
        { completed: 0, pending: 0, failed: 0 }
      ),
    [serviceData, visibleCountCards]
  );
  const statusCfg = statusConfig(serviceStatus);
  const StatusIcon = statusCfg.icon;
  const ServiceIcon = serviceMeta[selectedService]?.icon ?? TerminalSquare;

  const version =
    serviceData?.version ??
    selectedRun?.version ??
    selectedRun?.pipelineVersion ??
    selectedRun?.configVersion;
  const command = serviceData?.command ?? selectedRun?.[`${selectedService}Command`];
  const scriptPath =
    serviceData?.scriptPath ?? selectedRun?.[`${selectedService}ScriptPath`];
  const scriptFile =
    serviceData?.scriptFile ?? selectedRun?.[`${selectedService}ScriptFile`];
  const targetServer =
    serviceData?.targetServer ??
    serviceData?.targetServerName ??
    selectedRun?.[`${selectedService}TargetServer`];

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>Loading latest generation…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Generation Validation
          </h1>
          <p className="text-sm text-muted-foreground">
            Latest pipeline run details, broken down by service.
          </p>
        </div>
        <Button
          onClick={() => loadLatestGeneration(true)}
          disabled={refreshing}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Empty ── */}
      {!selectedRun ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No generation data found from the latest pipeline response.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">

          {/* ── Sidebar ── */}
          <aside className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Services
            </p>

            {services.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No services found.
              </p>
            ) : (
              services.map((service) => (
                <ServiceItem
                  key={service}
                  service={service}
                  run={selectedRun}
                  active={selectedService === service}
                  onClick={() => setSelectedService(service)}
                />
              ))
            )}

            {/* Run meta at the bottom of sidebar */}
            <div className="mt-auto border-t border-border/60 px-3 pt-3 pb-1 text-[11px] text-muted-foreground space-y-1">
              <p className="truncate">
                <span className="font-medium text-foreground/70">Run ID</span>{" "}
                {getRunId(selectedRun) || "—"}
              </p>
              <p>
                <span className="font-medium text-foreground/70">Created</span>{" "}
                {formatDate(getCreatedAt(selectedRun))}
              </p>
            </div>
          </aside>

          {/* ── Detail Panel ── */}
          <main className="flex flex-col gap-4 min-w-0">

            {/* Service header strip */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${
                    serviceMeta[selectedService]?.accent ?? "text-muted-foreground"
                  }`}
                >
                  <ServiceIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground leading-tight">
                    {selectedService ? formatLabel(selectedService) : "Select a service"}
                  </p>
                  <p className="text-xs text-muted-foreground">Service details</p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.badge}`}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {serviceStatus}
              </span>
            </div>

            {/* Detail rows */}
            <div className="rounded-xl border border-border bg-card px-5">
              <DetailRow icon={Server} label="Target Server" value={targetServer} />
              <DetailRow icon={FileCode2} label="Script Path" value={scriptPath} mono />
              <DetailRow icon={FileCode2} label="Script File" value={scriptFile} mono />
              <DetailRow icon={TerminalSquare} label="Version" value={version} mono />
              <DetailRow icon={Play} label="Command" value={command} mono />
            </div>

            {showStatusCountCards ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleCountCards.map((status) => (
                  <StatusCountCard
                    key={status}
                    status={status}
                    count={statusCounts[status]}
                    expanded={expandedCountCard === status}
                    onClick={() => setExpandedCountCard((current) => (current === status ? null : status))}
                  />
                ))}
              </div>
            ) : null}

            {showStatusCountCards && expandedCountCard && (
              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {countCardStyles[expandedCountCard].label} Status Count
                    </p>
                    <p className="text-xs text-muted-foreground">Expanded count card</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{statusCounts[expandedCountCard]}</p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}