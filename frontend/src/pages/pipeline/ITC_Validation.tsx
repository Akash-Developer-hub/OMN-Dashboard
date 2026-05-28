import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  FileArchive,
  FileCheck2,
  FileUp,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type ValidatorMode = "osm" | "sqlite";
type ValidationStatus = "idle" | "ready" | "running" | "completed" | "failed";
type ValidationRecord = Record<string, unknown>;

interface ValidationResponsePayload extends ValidationRecord {
  report?: unknown;
  details?: unknown;
  comparison?: unknown;
  reportPath?: string;
  log?: string;
  logs?: string;
  status?: string;
  state?: string;
}

interface OsmFinding {
  id: string;
  tag: string;
  severity: "error" | "warning" | "info";
  issue: string;
  expectedValue: string;
  actualValue: string;
  location: string;
}

interface OsmValidationResult {
  runId: string;
  fileName: string;
  fileSize: number;
  status: "completed" | "failed" | "running";
  startedAt: string;
  completedAt: string;
  uploadProgress: number;
  summary: {
    missingRequiredTags: number;
    invalidTagValues: number;
    totalFindings: number;
  };
  findings: OsmFinding[];
}

interface SQLiteRuleResult {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn";
  details: string;
}

interface SQLiteFileResult {
  id: string;
  fileName: string;
  status: ValidationStatus;
  ruleCount: number;
  rules: SQLiteRuleResult[];
}

interface SQLiteValidationResult {
  runId: string;
  fileName: string;
  fileSize: number;
  status: ValidationStatus;
  startedAt: string;
  completedAt: string;
  uploadProgress: number;
  files: SQLiteFileResult[];
}

const API_BASE_URL = "https://sandbox.vmmaps.com/osmValidator";
const API_ENDPOINTS = {
  upload: `${API_BASE_URL}/upload`,
  validation: (jobId: string) => `${API_BASE_URL}/validation/${jobId}`,
  validationDetails: (jobId: string) => `${API_BASE_URL}/validation/${jobId}/details`,
  validations: `${API_BASE_URL}/validations`,
  health: `${API_BASE_URL}/health`,
  referenceData: `${API_BASE_URL}/reference/data`,
  referenceUpload: `${API_BASE_URL}/upload/reference`,
  referenceClear: `${API_BASE_URL}/reference/clear`,
  rulesOsm: `${API_BASE_URL}/rules/osm`,
  rulesSqlite: `${API_BASE_URL}/rules/sqlite`,
};

const modeConfig: Record<
  ValidatorMode,
  {
    title: string;
    eyebrow: string;
    description: string;
    acceptedTypes: string;
    fileHint: string;
    disclaimer?: string;
    icon: typeof FileArchive;
    accent: string;
  }
> = {
  osm: {
    title: "OSM Validation",
    eyebrow: "OSM / PBF FILE CHECK",
    description: "Upload or choose an OSM or PBF map extract and run validation checks.",
    acceptedTypes: ".osm,.pbf,application/octet-stream",
    fileHint: ".osm or .pbf file",
    icon: FileArchive,
    accent: "bg-sky-500",
  },
  sqlite: {
    title: "SQLite Validator",
    eyebrow: "SQLITE BUNDLE CHECK",
    description: "Upload a compressed SQLite validation bundle and inspect the bundle rules.",
    acceptedTypes: ".zip,application/zip,application/x-zip-compressed",
    fileHint: ".zip file only",
    disclaimer: "SQLite Validator accepts ZIP bundles only. Please compress the SQLite database and required rule files into one .zip file before upload.",
    icon: Database,
    accent: "bg-emerald-500",
  },
};

const STORAGE_KEY = "itc_validation_running_job";

interface PersistedJobState {
  currentJobId?: string | null;
  mode: ValidatorMode;
  uploadedStoredFilename: string | null;
  fileName: string;
  fileSize: number;
}

/** Read the persisted job state synchronously. Called inside lazy useState initializers. */
function readPersistedJob(): PersistedJobState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as PersistedJobState) : null;
  } catch {
    return null;
  }
}

/** Queries the /validations list and returns the most recent running job's ID. */
async function findLatestRunningJobId(): Promise<string | null> {
  try {
    const resp = await axios.get(API_ENDPOINTS.validations);
    const data = resp?.data?.data || resp?.data || {};
    const items: ValidationRecord[] = Array.isArray(data)
      ? data
      : Array.isArray(data.validations)
        ? data.validations
        : Array.isArray(data.jobs)
          ? data.jobs
          : [];
    if (!items.length) return null;
    const priority = ["RUNNING", "STARTED", "PENDING"];
    const running = items.find((j) => priority.includes(String(j.status || j.state || "").toUpperCase())) ?? items[0];
    const id = String(running?.jobId || running?.job_id || running?.id || "");
    return id.length > 2 ? id : null;
  } catch {
    return null;
  }
}

/** Exhaustively searches a shallow object (up to 2 levels) for a job-ID-like string field. */
function extractJobId(obj: ValidationRecord): string | null {
  const keys = ["jobId", "job_id", "id", "taskId", "task_id"];
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string" && v.length > 2) return v;
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = extractJobId(val as ValidationRecord);
      if (nested) return nested;
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object") {
          const nested = extractJobId(item as ValidationRecord);
          if (nested) return nested;
        }
      }
    }
  }
  return null;
}

const workflowSteps = ["File received", "Reading validation rules", "Running checks", "Preparing summary"];

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getReportPayload = (raw: unknown): ValidationRecord => {
  if (!raw || typeof raw !== "object") return {};
  const payload = raw as ValidationRecord;
  return (payload.report && typeof payload.report === "object" ? payload.report : payload) as ValidationRecord;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fetchCurrentPipelineConfigVersion = async (): Promise<string> => {
  const res = await api.get("/admin-dashboard/pipeline-config/current-version");
  return String(res.data?.data?.version ?? res.data?.version ?? "v1.0");
};

const mapOsmValidationResult = (raw: unknown, originalFile: File): OsmValidationResult => {
  const report = getReportPayload(raw);
  const errors = Array.isArray(report.errors) ? (report.errors as ValidationRecord[]) : [];
  const warnings = Array.isArray(report.warnings) ? (report.warnings as ValidationRecord[]) : [];
  const summary = (report.summary && typeof report.summary === "object" ? report.summary : {}) as ValidationRecord;

  const findings: OsmFinding[] = [
    ...errors.map((item: ValidationRecord, index: number) => ({
      id: String(item.id ?? `error-${index}`),
      tag: String(item.tag ?? item.type ?? item.rule ?? "error"),
      severity: "error" as const,
      issue: String(item.message ?? item.issue ?? item.detail ?? "Validation error"),
      expectedValue: String(item.expectedValue ?? item.expected ?? "n/a"),
      actualValue: String(item.actualValue ?? item.actual ?? "n/a"),
      location: String(item.location ?? item.node_id ?? item.element_id ?? "unknown"),
    })),
    ...warnings.map((item: ValidationRecord, index: number) => ({
      id: String(item.id ?? `warning-${index}`),
      tag: String(item.tag ?? item.type ?? item.rule ?? "warning"),
      severity: "warning" as const,
      issue: String(item.message ?? item.issue ?? item.detail ?? "Validation warning"),
      expectedValue: String(item.expectedValue ?? item.expected ?? "n/a"),
      actualValue: String(item.actualValue ?? item.actual ?? "n/a"),
      location: String(item.location ?? item.node_id ?? item.element_id ?? "unknown"),
    })),
  ];

  const checked = toNumber(summary.checked, findings.length);
  const errorCount = toNumber(summary.errors, errors.length);
  const warningCount = toNumber(summary.warnings, warnings.length);
  const missingNodeCount = toNumber(summary.missing_node_count, 0);
  const newNodeCount = toNumber(summary.new_node_count, 0);

  return {
    runId: String(report.runId ?? report.run_id ?? report.jobId ?? `OSM-${Date.now()}`),
    fileName: String(report.fileName ?? report.file_name ?? originalFile.name),
    fileSize: toNumber(report.fileSize ?? report.file_size, originalFile.size),
    status: String(report.status ?? (errorCount > 0 || missingNodeCount > 0 ? "failed" : "completed")).toLowerCase() === "failed"
      ? "failed"
      : "completed",
    startedAt: String(report.startedAt ?? report.started_at ?? new Date().toISOString()),
    completedAt: String(report.completedAt ?? report.completed_at ?? new Date().toISOString()),
    uploadProgress: toNumber(report.uploadProgress ?? report.upload_progress, 100),
    summary: {
      missingRequiredTags: errorCount,
      invalidTagValues: warningCount,
      totalFindings: findings.length,
    },
    findings,
    checked,
    errors: errorCount,
    warnings: warningCount,
    missingNodeCount,
    newNodeCount,
  } as OsmValidationResult & {
    checked?: number;
    errors?: number;
    warnings?: number;
    missingNodeCount?: number;
    newNodeCount?: number;
  };
};

const mapSQLiteValidationResult = (raw: unknown, originalFile: File): SQLiteValidationResult => {
  const report = getReportPayload(raw);
  const files = Array.isArray(report.files) ? report.files : [];

  const mappedFiles: SQLiteFileResult[] = files.map((file: ValidationRecord, index: number) => {
    const fileName = String(file.file ?? file.fileName ?? file.name ?? `file-${index}.sqlite`);
    const ruleItems = Array.isArray(file.rules) ? (file.rules as ValidationRecord[]) : [];
    const failedDetails = Array.isArray(file.failedDetails) ? (file.failedDetails as ValidationRecord[]) : [];

    const rules: SQLiteRuleResult[] = ruleItems.length
      ? ruleItems.map((rule: ValidationRecord, ruleIndex: number) => ({
          id: String(rule.id ?? `${fileName}-${ruleIndex}`),
          name: String(rule.name ?? rule.rule ?? rule.type ?? `rule-${ruleIndex + 1}`),
          status: String(rule.status ?? "warn").toLowerCase() === "pass" ? "pass" : String(rule.status ?? "warn").toLowerCase() === "fail" ? "fail" : "warn",
          details: String(rule.details ?? rule.message ?? rule.error ?? ""),
        }))
      : failedDetails.map((detail: ValidationRecord, detailIndex: number) => ({
          id: `${fileName}-failed-${detailIndex}`,
          name: String(detail.type ?? `failed-${detailIndex + 1}`),
          status: "fail" as const,
          details: String(detail.error ?? detail.message ?? "Validation failed"),
        }));

    const ruleCount = toNumber(file.ruleCount ?? file.totalRules ?? rules.length, rules.length);
    return {
      id: String(file.id ?? `${fileName}-${index}`),
      fileName,
      status: String(file.status ?? (file.failed ? "failed" : "completed")).toLowerCase() === "failed" ? "failed" : "completed",
      ruleCount,
      rules,
    };
  });

  const completedCount = mappedFiles.filter((item) => item.status === "completed").length;
  const failedCount = mappedFiles.length - completedCount;

  return {
    runId: String(report.runId ?? report.run_id ?? report.jobId ?? `SQLITE-${Date.now()}`),
    fileName: String(report.zip ?? report.fileName ?? originalFile.name),
    fileSize: toNumber(report.fileSize ?? report.file_size, originalFile.size),
    status: String(report.status ?? (report.overall_passed === false ? "failed" : "completed")).toLowerCase() === "failed"
      ? "failed"
      : "completed",
    startedAt: String(report.startedAt ?? report.started_at ?? new Date().toISOString()),
    completedAt: String(report.completedAt ?? report.completed_at ?? new Date().toISOString()),
    uploadProgress: toNumber(report.uploadProgress ?? report.upload_progress, 100),
    files: mappedFiles,
    completedCount,
    failedCount,
    overallPassed: report.overall_passed !== false,
  } as SQLiteValidationResult & {
    completedCount?: number;
    failedCount?: number;
    overallPassed?: boolean;
  };
};

const mapComparisonData = (report: ValidationRecord) => {
  if (!report || typeof report !== "object") return null;

  const summary = (report.summary && typeof report.summary === "object" ? report.summary : {}) as ValidationRecord;

  if (Array.isArray(report.missing_node_ids) || Array.isArray(report.new_node_ids)) {
    return {
      matchingNodes: Math.max(0, toNumber(summary.checked, 0) - toNumber(summary.missing_node_count, 0) - toNumber(summary.new_node_count, 0)),
      newNodes: toNumber(summary.new_node_count, Array.isArray(report.new_node_ids) ? report.new_node_ids.length : 0),
      missingNodes: toNumber(summary.missing_node_count, Array.isArray(report.missing_node_ids) ? report.missing_node_ids.length : 0),
      missingNodeIds: report.missing_node_ids ?? [],
      newNodeIds: report.new_node_ids ?? [],
    };
  }

  if (report.comparison && typeof report.comparison === "object") {
    return report.comparison;
  }

  return null;
};

export default function ITCValidation() {
  const navigate = useNavigate();
  // Lazy initializers read localStorage once during the very first render so that
  // the persist effect never sees status="idle" while a saved job exists.
  const [mode, setMode] = useState<ValidatorMode>(() => readPersistedJob()?.mode ?? "osm");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ValidationStatus>(() => readPersistedJob() ? "running" : "idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workflowProgress, setWorkflowProgress] = useState(() => readPersistedJob() ? 10 : 0);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  // ── states from sample ──
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadComplete, setUploadComplete] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(() => readPersistedJob()?.currentJobId ?? null);
  const [validationLog, setValidationLog] = useState("");
  const [reportData, setReportData] = useState<ValidationRecord | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [fetchingReport, setFetchingReport] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [referenceStatus, setReferenceStatus] = useState<"none" | "uploaded" | "processing" | "error">("none");
  const [referenceStats, setReferenceStats] = useState<{ totalNodes: number; lastUpdated: string } | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ValidationRecord | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [uploadedStoredFilename, setUploadedStoredFilename] = useState<string | null>(() => readPersistedJob()?.uploadedStoredFilename ?? null);
  const [result, setResult] = useState<OsmValidationResult | SQLiteValidationResult | null>(null);
  const [isAddingToConfig, setIsAddingToConfig] = useState(false);
  const [pipelineConfigAdded, setPipelineConfigAdded] = useState(false);
  const [version, setVersion] = useState<string>(() => {
    try { return localStorage.getItem("itc_validation_version") ?? ""; } catch { return ""; }
  });
  const [osmValidationResult, setOsmValidationResult] = useState<OsmValidationResult | null>(null);
  const [sqliteValidationResult, setSqliteValidationResult] = useState<SQLiteValidationResult | null>(null);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [generationAcknowledged, setGenerationAcknowledged] = useState(false);
  const [fetchedReport, setFetchedReport] = useState<{
    version: string;
    osmReport?: { report: ValidationRecord; meta: ValidationRecord; savedAt: string };
    sqliteReport?: { report: ValidationRecord; meta: ValidationRecord; savedAt: string };
  } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [versionFetchStatus, setVersionFetchStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle");
  const [currentVersionLoading, setCurrentVersionLoading] = useState(false);
  const [currentVersionError, setCurrentVersionError] = useState("");
  const versionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOsmDetails, setShowOsmDetails] = useState(false);
  const [showSqliteDetails, setShowSqliteDetails] = useState(false);
  const [restoredFileInfo, setRestoredFileInfo] = useState<{ name: string; size: number } | null>(() => {
    const j = readPersistedJob();
    return j ? { name: j.fileName || "unknown", size: j.fileSize || 0 } : null;
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  // Keeps the latest workflowProgress readable inside the poll closure without
  // making it a reactive dependency (which would restart the effect on every tick).
  const workflowProgressRef = useRef(workflowProgress);
  useEffect(() => { workflowProgressRef.current = workflowProgress; }, [workflowProgress]);

  const config = modeConfig[mode];
  const ModeIcon = config.icon;

  const statusLabel = useMemo(() => {
    if (status === "running") return "Running";
    if (status === "completed") return "Completed";
    if (status === "failed") return "Failed";
    if (selectedFile) return "Ready";
    return "Waiting for file";
  }, [selectedFile, status]);

  const summaryStats = useMemo(() => {
    if (!result) {
      return null;
    }

    if (mode === "osm") {
      const osmResult = result as OsmValidationResult & {
        checked?: number;
        errors?: number;
        warnings?: number;
        missingNodeCount?: number;
        newNodeCount?: number;
      };

      return {
        primary: String(osmResult.checked ?? osmResult.summary.totalFindings),
        secondary: `${osmResult.errors ?? osmResult.summary.missingRequiredTags} errors, ${osmResult.warnings ?? osmResult.summary.invalidTagValues} warnings`,
        tertiary: `Missing nodes: ${osmResult.missingNodeCount ?? 0} · New nodes: ${osmResult.newNodeCount ?? 0}`,
      };
    }

    const sqliteResult = result as SQLiteValidationResult & {
      completedCount?: number;
      failedCount?: number;
      overallPassed?: boolean;
    };

    return {
      primary: `${sqliteResult.files.length} file${sqliteResult.files.length === 1 ? "" : "s"}`,
      secondary: `${sqliteResult.completedCount ?? sqliteResult.files.filter((item) => item.status !== "failed").length} passed, ${sqliteResult.failedCount ?? sqliteResult.files.filter((item) => item.status === "failed").length} failed`,
      tertiary: sqliteResult.overallPassed ? "Overall validation passed" : "Overall validation failed",
    };
  }, [mode, result]);

  const generationHasFailed = useMemo(() => {
    const osm = fetchedReport?.osmReport
      ? (fetchedReport.osmReport.report as unknown as OsmValidationResult)
      : osmValidationResult;
    const sqlite = fetchedReport?.sqliteReport
      ? (fetchedReport.sqliteReport.report as unknown as SQLiteValidationResult)
      : sqliteValidationResult;

    if (osm?.status === "failed") return true;
    if (osm && (osm.summary?.missingRequiredTags ?? 0) > 0) return true;
    if (sqlite?.status === "failed") return true;
    if (sqlite?.files?.some((f) => f.status === "failed")) return true;
    return false;
  }, [fetchedReport, osmValidationResult, sqliteValidationResult]);

  const isValidFileForMode = (file: File) => {
    const fileName = file.name.toLowerCase();
    if (mode === "sqlite") return fileName.endsWith(".zip");
    return fileName.endsWith(".osm") || fileName.endsWith(".pbf");
  };

  const chooseFile = (file?: File) => {
    if (!file) return;

    if (!isValidFileForMode(file)) {
      setSelectedFile(null);
      setStatus("idle");
      setUploadProgress(0);
      setWorkflowProgress(0);
      setActiveWorkflowStep(0);
      setFileError(
        mode === "sqlite"
          ? "SQLite Validator accepts ZIP files only. Please choose a .zip bundle."
          : "OSM Validation accepts .osm or .pbf files only.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    setStatus("ready");
    setUploadProgress(100);
    setWorkflowProgress(0);
    setActiveWorkflowStep(0);
    setFileError("");
    setUploadError("");
    setUploadComplete(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
  };

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleReferenceUpload(file);
  };

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  function webhookResponseToOsmResult(raw: unknown, originalFile: File): OsmValidationResult {
    return mapOsmValidationResult(raw, originalFile);
  }

  function webhookResponseToSqliteResult(raw: unknown, originalFile: File): SQLiteValidationResult {
    return mapSQLiteValidationResult(raw, originalFile);
  }

  const applyValidationPayload = useCallback((payload: ValidationResponsePayload) => {
    const rawReport = getReportPayload(payload?.report ?? payload);
    setReportData(rawReport);
    setValidationLog(payload?.log || payload?.logs || "");

    // Only persist per-mode results when the rawReport has substantive validation data.
    // A status-only polling response (e.g. {status, jobId}) must NOT overwrite real results.
    const reportHasData =
      "errors" in rawReport ||
      "warnings" in rawReport ||
      "files" in rawReport ||
      "summary" in rawReport ||
      "findings" in rawReport;

    // Fallback to restoredFileInfo when selectedFile is null (e.g. after page reload)
    const effectiveFile = (selectedFile ?? { name: restoredFileInfo?.name ?? "unknown", size: restoredFileInfo?.size ?? 0 }) as File;

    if (mode === "osm") {
      const normalized = webhookResponseToOsmResult(rawReport, effectiveFile);
      setResult(normalized);
      if (reportHasData) setOsmValidationResult(normalized);
      setComparisonResults(mapComparisonData(rawReport) as ValidationRecord | null);
    } else {
      const normalized = webhookResponseToSqliteResult(rawReport, effectiveFile);
      setResult(normalized);
      if (reportHasData) setSqliteValidationResult(normalized);
      setComparisonResults(null);
    }
  }, [mode, selectedFile, restoredFileInfo]);

  // Poll for validation status when a job is running
  useEffect(() => {
    if (!currentJobId || status !== "running") {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const statusUrl = API_ENDPOINTS.validation(currentJobId);
        const resp = await axios.get(statusUrl);
        if (cancelled) return;

        // ApiResponse wrapper: payload is in resp.data.data; fall back to resp.data for older shapes
        const payload = resp?.data?.data || resp?.data || {};

        // Normalize status: handle both snake_case (from Python ref) and camelCase (Node)
        const jobStatus = String(payload.status || payload.state || '').toUpperCase();
        const log = payload.log || payload.logs || '';

        // Handle STARTED and RUNNING states - schedule next poll after response
        if (jobStatus === 'STARTED' || jobStatus === 'RUNNING') {
          setValidationLog(log || '');
          setWorkflowProgress((prev) => Math.min(prev + 3, 95));
          const wp = workflowProgressRef.current;
          if (wp > 25 && wp < 50) setActiveWorkflowStep(1);
          if (wp >= 50 && wp < 75) setActiveWorkflowStep(2);
          if (!cancelled) timeoutId = setTimeout(poll, 2000);
        }
        // Handle completion states
        else if (jobStatus === 'DONE' || jobStatus === 'COMPLETED' || jobStatus === 'FINISHED') {
          setStatus('completed');
          setWorkflowProgress(100);
          setActiveWorkflowStep(3);

          // Apply the complete payload including report from the status response
          applyValidationPayload(payload);

          // Fallback: if no report in payload but reportPath exists, include it
          if (!payload.report && payload.reportPath) {
            setReportData({ reportPath: payload.reportPath });
          }

          // Auto-save the report to the backend if a version is set.
          // Normalize the payload the same way applyValidationPayload does so the DB always
          // stores a stable OsmValidationResult / SQLiteValidationResult shape.
          if (version.trim()) {
            const rawForSave = getReportPayload(payload?.report ?? payload);
            const effectiveFileForSave = (selectedFile ?? { name: restoredFileInfo?.name ?? '', size: restoredFileInfo?.size ?? 0 }) as File;
            const normalizedForSave = mode === 'osm'
              ? mapOsmValidationResult(rawForSave, effectiveFileForSave)
              : mapSQLiteValidationResult(rawForSave, effectiveFileForSave);
            api.post('/admin-dashboard/validation/save-validation-report', {
              version: version.trim(),
              mode,
              report: normalizedForSave,
              meta: {
                jobId: currentJobId,
                fileName: selectedFile?.name ?? restoredFileInfo?.name ?? '',
                fileSize: selectedFile?.size ?? restoredFileInfo?.size ?? 0,
                status: jobStatus,
              },
            }).catch(() => { /* non-blocking */ });
          }
          // Terminal state — no next poll scheduled
        }
        // Handle failure states
        else if (jobStatus === 'FAILED' || jobStatus === 'ERROR') {
          setStatus('failed');
          setValidationLog(log || '');
          setUploadError('Validation failed. Check logs below.');

          // Still apply payload to capture any error details
          applyValidationPayload(payload);
          // Terminal state — no next poll scheduled
        }
        // Unknown status - schedule next poll after response
        else {
          setValidationLog(log || '');
          if (!cancelled) timeoutId = setTimeout(poll, 2000);
        }
      } catch {
        // Retry after delay even on network errors
        if (!cancelled) timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentJobId, status, selectedFile, applyValidationPayload, version, mode, restoredFileInfo]);

  // Check for existing reference data on component mount
  useEffect(() => {
    async function checkExistingReference() {
      try {
        const resp = await axios.get(API_ENDPOINTS.referenceData);
        const data = resp?.data;

        if (data && data.total_nodes) {
          // Reference data exists
          setReferenceStatus("uploaded");
          setReferenceStats({
            totalNodes: data.total_nodes,
            lastUpdated: data.extracted_at || new Date().toISOString(),
          });
        } else {
          // No reference data
          setReferenceStatus("none");
        }
      } catch (err) {
        // No reference data or error loading it
        setReferenceStatus("none");
      }
    }

    if (mode === "osm") {
      checkExistingReference();
    }
  }, [mode]);

  useEffect(() => {
    const saved = readPersistedJob();
    if (!saved || saved.currentJobId) return; // nothing async needed
    async function fetchMissingJobId() {
      const found = await findLatestRunningJobId();
      if (found) {
        setCurrentJobId(found);
      }
    }
    fetchMissingJobId();
  }, []); // intentionally runs once on mount

  const loadReportsForVersion = useCallback(async (versionToLoad: string) => {
    const normalizedVersion = versionToLoad.trim();
    if (!normalizedVersion) return;

    setVersionFetchStatus("loading");
    try {
      const resp = await api.get(`/admin-dashboard/validation/report/${encodeURIComponent(normalizedVersion)}`);
      const doc = resp?.data?.data ?? resp?.data ?? null;
      if (doc && (doc.osmReport || doc.sqliteReport)) {
        setOsmValidationResult(null);
        setSqliteValidationResult(null);
        setShowOsmDetails(false);
        setShowSqliteDetails(false);
        setFetchedReport(doc);
        setVersionFetchStatus("found");
        if (doc.osmReport?.report) setOsmValidationResult(doc.osmReport.report as OsmValidationResult);
        if (doc.sqliteReport?.report) setSqliteValidationResult(doc.sqliteReport.report as SQLiteValidationResult);
      } else {
        setFetchedReport(null);
        setVersionFetchStatus("not-found");
      }
    } catch {
      setFetchedReport(null);
      setVersionFetchStatus("not-found");
    }
  }, []);

  // Load the current pipeline config version from the backend and show that version's reports.
  useEffect(() => {
    let cancelled = false;

    async function restoreCurrentVersion() {
      setCurrentVersionLoading(true);
      setCurrentVersionError("");
      try {
        const dbVersion = await fetchCurrentPipelineConfigVersion();
        if (cancelled) return;

        setVersion(dbVersion);
        try {
          localStorage.setItem("itc_validation_version", dbVersion);
        } catch { /* storage unavailable */ }

        await loadReportsForVersion(dbVersion);
      } catch (error) {
        if (cancelled) return;
        setCurrentVersionError("Failed to load current pipeline config version.");
        const savedVersion = (() => {
          try { return localStorage.getItem("itc_validation_version") ?? ""; } catch { return ""; }
        })();
        if (savedVersion.trim()) {
          await loadReportsForVersion(savedVersion);
        }
      } finally {
        if (!cancelled) setCurrentVersionLoading(false);
      }
    }

    restoreCurrentVersion();
    return () => {
      cancelled = true;
    };
  }, [loadReportsForVersion]);

  // Persist running job to localStorage so it survives page reloads.
  // Save as soon as status becomes "running" — do NOT require currentJobId to be set first.
  useEffect(() => {
    if (status === "running") {
      const state: PersistedJobState = {
        currentJobId: currentJobId ?? null,
        mode,
        uploadedStoredFilename,
        fileName: selectedFile?.name ?? restoredFileInfo?.name ?? "",
        fileSize: selectedFile?.size ?? restoredFileInfo?.size ?? 0,
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full */ }
    } else if (status === "completed" || status === "failed") {
      // Only clear on terminal states, NOT on "idle" — switching modes sets status="idle"
      // but must not erase a still-running job that belongs to the previous mode.
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentJobId, status, mode, uploadedStoredFilename, selectedFile, restoredFileInfo]);

  // ── updated handleUpload: calls real API ──
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError("");

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const resp = await axios.post(API_ENDPOINTS.upload, formData, {
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
            setUploadProgress(percent);
          },
        });

        const data = resp?.data;
        try {
          // Prefer full `filePath` returned in the upload response when available
          const fileObj = data?.data?.file || data?.file || null;
          if (fileObj && fileObj.filePath) {
            setUploadedStoredFilename(fileObj.filePath);
          } else {
            // Fallbacks for older response shapes
            const results = (data as ValidationRecord | null)?.results;
            if (Array.isArray(results) && results.length > 0) {
              const firstResult = results[0] as ValidationRecord;
              const storedAs = firstResult.stored_as || firstResult.storedAs || "";
              if (storedAs) {
                setUploadedStoredFilename(String(storedAs));
              } else {
                setUploadedStoredFilename(selectedFile.name);
              }
            } else if (data && typeof data === "object" && (data as ValidationRecord).stored_as) {
              setUploadedStoredFilename(String((data as ValidationRecord).stored_as));
            } else {
              setUploadedStoredFilename(selectedFile.name);
            }
          }
        } catch {
          setUploadedStoredFilename(selectedFile.name);
        }

        setUploadProgress(100);
        setUploadComplete(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed. Please try again.");
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const startValidation = async () => {
    if (!selectedFile || status === "running") return;

    setStatus("running");
    setWorkflowProgress(5);
    setActiveWorkflowStep(0);
    setValidationLog("");
    setUploadError("");

    // Eagerly write to localStorage NOW so a reload during the async steps still restores.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentJobId: null,
        mode,
        uploadedStoredFilename,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      } satisfies PersistedJobState));
    } catch { /* storage full */ }

    let filenameToValidate = uploadedStoredFilename;

    // Auto-upload the file first if it hasn't been sent to the server yet
    if (!filenameToValidate) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const uploadResp = await axios.post(API_ENDPOINTS.upload, formData, {
          onUploadProgress: (e) => {
            setUploadProgress(Math.round((e.loaded * 100) / (e.total || 1)));
          },
        });
        const d = uploadResp?.data;
        const fileObj = d?.data?.file || d?.file || null;
        if (fileObj?.filePath) {
          filenameToValidate = fileObj.filePath;
        } else if (Array.isArray(d?.results) && d.results.length > 0) {
          const storedAs = (d.results[0] as ValidationRecord).stored_as || (d.results[0] as ValidationRecord).storedAs || "";
          filenameToValidate = storedAs ? String(storedAs) : selectedFile.name;
        } else if (d?.stored_as) {
          filenameToValidate = String(d.stored_as);
        } else {
          filenameToValidate = selectedFile.name;
        }
        setUploadedStoredFilename(filenameToValidate);
        setUploadProgress(100);
        setUploadComplete(true);
        // Update localStorage with the resolved filename
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed: PersistedJobState = JSON.parse(stored);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, uploadedStoredFilename: filenameToValidate }));
          }
        } catch { /* ignore */ }
      } catch (uploadErr) {
        setStatus("failed");
        setUploadError(uploadErr instanceof Error ? uploadErr.message : "Upload failed. Please try again.");
        return;
      } finally {
        setIsUploading(false);
      }
    }

    setWorkflowProgress(10);

    // Trigger validation for the uploaded file
    try {
      const resp = await axios.post(API_ENDPOINTS.upload, null, {
        params: {
          mode: 'validate',
          file: filenameToValidate,
        },
      });

      const payloadData = resp?.data?.data || resp?.data || {};
      // Use exhaustive extractor — covers nested structures the server may return
      let jobId = extractJobId(payloadData);

      if (jobId) {
        setCurrentJobId(jobId);
        // Update stored entry with the confirmed jobId
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed: PersistedJobState = JSON.parse(stored);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, currentJobId: jobId }));
          }
        } catch { /* ignore */ }
      } else {
        // console.warn(`[DEBUG] No jobId in validate response, querying /validations fallback. Response was:`, resp?.data);
        jobId = await findLatestRunningJobId();
        if (jobId) {
          // console.log(`[DEBUG] Fallback jobId from /validations: ${jobId}`);
          setCurrentJobId(jobId);
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const parsed: PersistedJobState = JSON.parse(stored);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, currentJobId: jobId }));
            }
          } catch { /* ignore */ }
        } else {
          // console.warn(`[DEBUG] Could not find any running job ID — UI will show running but cannot poll.`);
        }
      }
    } catch (submissionError) {
      // console.error(`[DEBUG] Validation submission error:`, submissionError);
      setStatus('failed');
      setUploadError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger validation');
    }
  };

  async function fetchReport() {
    if (!currentJobId) return;

    setFetchingReport(true);
    try {
      const resp = await axios.get(API_ENDPOINTS.validation(currentJobId));
      const payload = resp?.data?.data || resp?.data || {};

      if (payload.report || payload.reportPath) {
        applyValidationPayload(payload);
        if (!payload.report && payload.reportPath) {
          setReportData({ reportPath: payload.reportPath });
        }
        setShowReport(true);
      } else {
        setUploadError('No report available yet');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to fetch report");
    } finally {
      setFetchingReport(false);
    }
  }

  async function downloadReport() {
    if (!currentJobId) return;

    setDownloadingReport(true);
    try {
      // Direct anchor-click — browser downloads natively via Content-Disposition: attachment.
      // Uses the same base URL as every other validation API call (sandbox.vmmaps.com/osmValidator).
      const link = document.createElement("a");
      link.href = API_ENDPOINTS.validationDetails(currentJobId);
      link.download = `validation_${currentJobId}_report.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to download report");
    } finally {
      setDownloadingReport(false);
    }
  }

  async function handleReferenceUpload(selected: File) {
    setReferenceStatus("processing");
    try {
      const formData = new FormData();
      formData.append("file", selected);

      const resp = await axios.post(API_ENDPOINTS.referenceUpload, formData);

      const data = resp?.data;
      if (data.success) {
        setReferenceFile(selected);
        setReferenceStatus("uploaded");
        setReferenceStats({
          totalNodes: data.totalNodes ?? 0,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        setReferenceStatus("error");
        setUploadError(data.message || "Failed to process reference file");
      }
    } catch (err) {
      setReferenceStatus("error");
      setUploadError(err instanceof Error ? err.message : "Failed to upload reference file");
    }
  }

  async function clearReference() {
    try {
      await axios.post(API_ENDPOINTS.referenceClear);
      setReferenceFile(null);
      setReferenceStatus("none");
      setReferenceStats(null);
      setComparisonResults(null);
      setShowComparison(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to clear reference file");
    }
  }

  async function addToPipelineConfig() {
    if (!selectedFile || status !== "completed") return;

    setIsAddingToConfig(true);
    setUploadError("");

    try {
      await api.post("/admin-dashboard/pipeline-config", {
        mode,
        runId: currentJobId || result?.runId || null,
        status: "added",
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        validationStatus: status,
        workflowProgress,
        metadata: {
          uploadProgress,
          uploadedStoredFilename,
          referenceStatus,
          referenceStats,
          hasReport: Boolean(reportData),
          hasComparison: Boolean(comparisonResults),
        },
      });

      setPipelineConfigAdded(true);
    } catch (err: unknown) {
      const errorMessage =
        typeof err === "object" && err !== null && "response" in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message || "")
          : "";
      setUploadError(errorMessage || (err instanceof Error ? err.message : "Failed to add pipeline config"));
    } finally {
      setIsAddingToConfig(false);
    }
  }

  const handleVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setVersion(val);
    setVersionFetchStatus("idle");
    try {
      if (val.trim()) localStorage.setItem("itc_validation_version", val.trim());
      else localStorage.removeItem("itc_validation_version");
    } catch { /* storage full */ }

    if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);

    if (!val.trim()) {
      setFetchedReport(null);
      setShowOsmDetails(false);
      setShowSqliteDetails(false);
      return;
    }

    versionDebounceRef.current = setTimeout(async () => {
      loadReportsForVersion(val);
    }, 600);
  };

  const resetCurrentFile = () => {
    setSelectedFile(null);
    setReferenceFile(null);
    setStatus("idle");
    setUploadProgress(0);
    setWorkflowProgress(0);
    setActiveWorkflowStep(0);
    setFileError("");
    setIsUploading(false);
    setUploadError("");
    setUploadComplete(false);
    setPipelineConfigAdded(false);
    setResult(null);
    setCurrentJobId(null);
    if (mode === "osm") setOsmValidationResult(null);
    else setSqliteValidationResult(null);
    localStorage.removeItem(STORAGE_KEY);
    setRestoredFileInfo(null);
    if (inputRef.current) inputRef.current.value = "";
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  };

  const switchMode = (nextMode: ValidatorMode) => {
    setMode(nextMode);
    setSelectedFile(null);
    setReferenceFile(null);
    setStatus("idle");
    setUploadProgress(0);
    setWorkflowProgress(0);
    setActiveWorkflowStep(0);
    setFileError("");
    setIsUploading(false);
    setUploadError("");
    setUploadComplete(false);
    setUploadedStoredFilename(null);
    setPipelineConfigAdded(false);
    setResult(null);
    setCurrentJobId(null);
    setReportData(null);
    setShowReport(false);
    setValidationLog("");
    setComparisonResults(null);
    setShowComparison(false);
    // osmValidationResult / sqliteValidationResult intentionally preserved across mode switches
    // Do NOT remove localStorage here — a job may still be running on the server.
    // The persist effect will clear it once the job reaches a terminal state.
    setRestoredFileInfo(null);
    if (inputRef.current) inputRef.current.value = "";
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  };

  // ── loading screen: replaces everything while upload is in-flight ──
  if (isUploading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center animate-slide-in">
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-background p-10 shadow-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-lg font-semibold text-foreground">Uploading file…</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Please wait while{" "}
              <span className="font-medium text-foreground">{selectedFile?.name}</span> is being
              uploaded to the server.
            </p>
          </div>
          <div className="w-full min-w-[280px]">
            <Progress value={null} className="animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // ── original UI (100% unchanged) ──
  return (
    <div className="space-y-6 animate-slide-in">
      {restoredFileInfo && status === "running" && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Validation resumed &mdash; <strong>{restoredFileInfo.name}</strong> is still being processed in the background.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/pipeline")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Pipeline
          </Button>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            ITC Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Validation Control Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a validator mode, upload the source file, and start the validation workflow.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-[390px] lg:items-end">
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
            <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder={currentVersionLoading ? "Loading current version..." : "Version (e.g. v1.0.0)"}
              value={version}
              readOnly
              className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
            {currentVersionLoading && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />}
            {versionFetchStatus === "loading" && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />}
            {versionFetchStatus === "found" && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
            {versionFetchStatus === "not-found" && version && (
              <span className="shrink-0 text-xs text-muted-foreground">New</span>
            )}
            {version && versionFetchStatus !== "loading" && (
              <Badge variant={versionFetchStatus === "found" ? "default" : "secondary"} className="shrink-0 text-xs">
                {versionFetchStatus === "found" ? "Loaded" : "Primary Key"}
              </Badge>
            )}
          </div>
          {currentVersionError && (
            <p className="text-xs text-destructive">{currentVersionError}</p>
          )}
          <div className="grid w-full grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-1">
            {(["osm", "sqlite"] as ValidatorMode[]).map((item) => {
              const itemConfig = modeConfig[item];
              const ItemIcon = itemConfig.icon;
              const active = mode === item;

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => switchMode(item)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <ItemIcon className="h-4 w-4" />
                  {item === "osm" ? "OSM" : "SQLite"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className={cn("mt-1 rounded-lg p-2 text-white", config.accent)}>
                    <ModeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {config.eyebrow}
                    </p>
                    <CardTitle className="mt-2 text-xl">{config.title}</CardTitle>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{config.description}</p>
                    {config.disclaimer && (
                      <div className="mt-3 flex max-w-2xl gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{config.disclaimer}</p>
                      </div>
                    )}
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  <FileUp className="h-4 w-4" />
                  Choose file
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <input
                ref={inputRef}
                type="file"
                accept={config.acceptedTypes}
                title="Choose validation file"
                className="hidden"
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="flex min-h-[260px] flex-col justify-center rounded-lg border border-border bg-muted/20 p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={cn("rounded-lg p-3 text-white", config.accent)}>
                        <FileCheck2 className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {mode === "sqlite" ? "Selected ZIP Folder" : "Selected file"}
                        </p>
                        <h2 className="mt-2 truncate text-xl font-semibold text-foreground" title={selectedFile.name}>
                          {selectedFile.name}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatFileSize(selectedFile.size)} uploaded and ready for validation
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="default"
                        onClick={handleUpload}
                        disabled={isUploading || uploadComplete}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        )}
                        {uploadComplete ? "Uploaded" : "Upload"}
                      </Button>
                      <Button type="button" variant="outline" onClick={resetCurrentFile}>
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                  {uploadError && (
                    <p className="mt-3 text-sm text-destructive">{uploadError}</p>
                  )}
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Upload complete</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40",
                  )}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-background shadow-sm">
                    <UploadCloud className="h-7 w-7 text-primary" />
                  </span>
                  <span className="mt-5 text-base font-semibold text-foreground">
                    {mode === "sqlite" ? "Drop ZIP folder here or choose from disk" : "Drop file here or choose from disk"}
                  </span>
                  <span className="mt-2 text-sm text-muted-foreground">{config.fileHint}</span>
                  {fileError && (
                    <span className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {fileError}
                    </span>
                  )}
                </label>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Validation Status"
              value={statusLabel}
              detail={status === "completed" ? "Validation finished" : "Workflow state"}
              icon={status === "completed" ? CheckCircle2 : ShieldCheck}
              tone={status === "completed" ? "success" : status === "running" ? "active" : "neutral"}
            />
            <InfoCard
              title={mode === "sqlite" ? "Selected ZIP Folder" : "Selected File"}
              value={selectedFile?.name ?? (mode === "sqlite" ? "No ZIP selected" : "No file selected")}
              detail={selectedFile ? formatFileSize(selectedFile.size) : "Awaiting input"}
              icon={FileCheck2}
              tone={selectedFile ? "active" : "neutral"}
            />
            <InfoCard
              title="Upload Progress"
              value={`${uploadProgress}%`}
              detail={selectedFile ? "Ready for validation" : "No upload started"}
              icon={UploadCloud}
              tone={uploadProgress === 100 ? "success" : uploadProgress > 0 ? "active" : "neutral"}
            />
          </div>

          {mode === "osm" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-amber-100 bg-amber-50/70">
                <CardContent className="p-6">
                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept=".osm,.pbf,application/octet-stream"
                    title="Choose reference file"
                    className="hidden"
                    onChange={handleReferenceFileChange}
                  />
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Reference Baseline</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {referenceStatus === "uploaded"
                        ? "Reference data present - baseline established"
                        : "Upload reference file to establish baseline for node tracking."}
                    </p>
                  </div>

                  {referenceStatus === "none" ? (
                    <button
                      type="button"
                      onClick={() => referenceInputRef.current?.click()}
                      className="mt-5 flex min-h-16 w-full items-center justify-center rounded-lg border border-dashed border-amber-400 px-4 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100/70"
                    >
                      Upload Reference File
                    </button>
                  ) : referenceStatus === "processing" ? (
                    <div className="mt-5 flex min-h-16 w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50/50 px-4 text-sm text-amber-700">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing reference file...
                    </div>
                  ) : referenceStatus === "uploaded" && referenceStats ? (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">
                        <p className="font-semibold">✓ Reference Data Present</p>
                        <p className="mt-1 text-xs">
                          {referenceStats.totalNodes.toLocaleString()} nodes indexed
                        </p>
                        <p className="mt-0.5 text-xs">
                          Last updated: {new Date(referenceStats.lastUpdated).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={clearReference}
                      >
                        Clear Reference Data
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                      Error loading reference data
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Preview</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Quick view of files prepared for OSM validation.
                      </p>
                    </div>
                    <Badge variant={selectedFile && referenceStatus === "uploaded" ? "default" : "secondary"}>
                      {selectedFile && referenceStatus === "uploaded" ? "Ready" : "Waiting"}
                    </Badge>
                  </div>
                  <div className="mt-5 space-y-3">
                    <PreviewRow label="Source file" value={selectedFile?.name ?? "No OSM/PBF file selected"} />
                    <PreviewRow label="Reference status" value={referenceStatus === "uploaded" ? "Baseline Active" : "No Baseline"} />
                    <PreviewRow label="Validation mode" value="OSM node tracking" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Reports loaded from DB for this version */}
          {fetchedReport && (osmValidationResult || sqliteValidationResult) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <CardTitle className="text-sm">Reports for version &ldquo;{fetchedReport.version}&rdquo;</CardTitle>
                  <Badge variant="outline" className="ml-auto text-xs">DB</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">

                {/* ── OSM report ── */}
                {osmValidationResult && (() => {
                  const osmExt = osmValidationResult as OsmValidationResult & { checked?: number; errors?: number; warnings?: number; missingNodeCount?: number; newNodeCount?: number };
                  const hasFail = osmValidationResult.status === "failed" || (osmValidationResult.summary?.missingRequiredTags ?? 0) > 0;
                  return (
                    <div className={cn("rounded-lg border", hasFail ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/20 bg-emerald-500/10")}>
                      {/* header row */}
                      <div className="flex items-center gap-2 p-3">
                        <FileArchive className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">OSM Validation</span>
                        <Badge variant={hasFail ? "destructive" : "default"} className="text-xs">
                          {String(osmValidationResult.status ?? "unknown").toUpperCase()}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setShowOsmDetails((p) => !p)}
                          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground"
                        >
                          {showOsmDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {showOsmDetails ? "Hide" : "View Details"}
                        </button>
                      </div>

                      {/* summary stats */}
                      <div className="grid grid-cols-5 gap-2 border-t border-border/40 px-3 py-2 text-xs">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{(osmExt.checked ?? 0).toLocaleString()}</p>
                          <p className="text-muted-foreground">Checked</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osmExt.errors ?? osmValidationResult.summary?.missingRequiredTags ?? 0}</p>
                          <p className="text-muted-foreground">Errors</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osmExt.warnings ?? osmValidationResult.summary?.invalidTagValues ?? 0}</p>
                          <p className="text-muted-foreground">Warnings</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osmExt.missingNodeCount ?? 0}</p>
                          <p className="text-muted-foreground">Missing</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osmExt.newNodeCount ?? 0}</p>
                          <p className="text-muted-foreground">New</p>
                        </div>
                      </div>

                      {/* meta row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
                        <span>File: <span className="font-medium text-foreground">{osmValidationResult.fileName}</span></span>
                        <span>Size: <span className="font-medium text-foreground">{formatFileSize(osmValidationResult.fileSize)}</span></span>
                        {fetchedReport.osmReport?.meta?.jobId && (
                          <span>Job: <span className="font-mono font-medium text-foreground">{String(fetchedReport.osmReport.meta.jobId)}</span></span>
                        )}
                        {fetchedReport.osmReport?.savedAt && (
                          <span>Saved: <span className="font-medium text-foreground">{new Date(fetchedReport.osmReport.savedAt).toLocaleString()}</span></span>
                        )}
                      </div>

                      {/* expanded details */}
                      {showOsmDetails && (
                        <div className="border-t border-border/40 p-3 space-y-3">
                          {/* Findings table */}
                          <div>
                            <p className="mb-2 text-xs font-semibold text-foreground">
                              Findings ({osmValidationResult.findings?.length ?? 0})
                            </p>
                            {(osmValidationResult.findings?.length ?? 0) > 0 ? (
                              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-muted/80">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Severity</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Tag</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Issue</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Expected</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Actual</th>
                                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Location</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {osmValidationResult.findings.map((f) => (
                                      <tr key={f.id} className="border-t border-border/40">
                                        <td className="px-2 py-1">
                                          <Badge
                                            variant={f.severity === "error" ? "destructive" : "secondary"}
                                            className="text-[10px]"
                                          >
                                            {f.severity}
                                          </Badge>
                                        </td>
                                        <td className="px-2 py-1 font-mono text-foreground">{f.tag}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{f.issue}</td>
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{f.expectedValue}</td>
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{f.actualValue}</td>
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{f.location}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                No findings — all checks passed.
                              </p>
                            )}
                          </div>

                          {/* Raw report JSON */}
                          <div>
                            <p className="mb-2 text-xs font-semibold text-foreground">Full Report (JSON)</p>
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                              <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                                {JSON.stringify(fetchedReport.osmReport?.report ?? osmValidationResult, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── SQLite report ── */}
                {sqliteValidationResult && (() => {
                  const hasFail = sqliteValidationResult.status === "failed" || sqliteValidationResult.files?.some((f) => f.status === "failed");
                  return (
                    <div className={cn("rounded-lg border", hasFail ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/20 bg-emerald-500/10")}>
                      {/* header row */}
                      <div className="flex items-center gap-2 p-3">
                        <Database className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">SQLite Validation</span>
                        <Badge variant={hasFail ? "destructive" : "default"} className="text-xs">
                          {String(sqliteValidationResult.status ?? "unknown").toUpperCase()}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setShowSqliteDetails((p) => !p)}
                          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground"
                        >
                          {showSqliteDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {showSqliteDetails ? "Hide" : "View Details"}
                        </button>
                      </div>

                      {/* summary stats */}
                      <div className="grid grid-cols-3 gap-2 border-t border-border/40 px-3 py-2 text-xs">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqliteValidationResult.files?.length ?? 0}</p>
                          <p className="text-muted-foreground">Files</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqliteValidationResult.files?.filter((f) => f.status !== "failed").length ?? 0}</p>
                          <p className="text-muted-foreground">Passed</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqliteValidationResult.files?.filter((f) => f.status === "failed").length ?? 0}</p>
                          <p className="text-muted-foreground">Failed</p>
                        </div>
                      </div>

                      {/* meta row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
                        <span>File: <span className="font-medium text-foreground">{sqliteValidationResult.fileName}</span></span>
                        <span>Size: <span className="font-medium text-foreground">{formatFileSize(sqliteValidationResult.fileSize)}</span></span>
                        {fetchedReport.sqliteReport?.meta?.jobId && (
                          <span>Job: <span className="font-mono font-medium text-foreground">{String(fetchedReport.sqliteReport.meta.jobId)}</span></span>
                        )}
                        {fetchedReport.sqliteReport?.savedAt && (
                          <span>Saved: <span className="font-medium text-foreground">{new Date(fetchedReport.sqliteReport.savedAt).toLocaleString()}</span></span>
                        )}
                      </div>

                      {/* expanded details */}
                      {showSqliteDetails && (
                        <div className="border-t border-border/40 p-3 space-y-3">
                          {/* Per-file breakdown */}
                          <p className="text-xs font-semibold text-foreground">File Breakdown</p>
                          <div className="space-y-2">
                            {sqliteValidationResult.files.map((file) => (
                              <div key={file.id} className="rounded-lg border border-border bg-background/60">
                                {/* file header */}
                                <div className="flex items-center justify-between gap-2 px-3 py-2">
                                  <span className="truncate text-xs font-medium text-foreground" title={file.fileName}>{file.fileName}</span>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs text-muted-foreground">{file.ruleCount} rule{file.ruleCount !== 1 ? "s" : ""}</span>
                                    <Badge
                                      variant={file.status === "failed" ? "destructive" : "secondary"}
                                      className="text-[10px]"
                                    >
                                      {String(file.status).toUpperCase()}
                                    </Badge>
                                  </div>
                                </div>
                                {/* rules table */}
                                {file.rules.length > 0 && (
                                  <div className="border-t border-border/40">
                                    <table className="w-full text-xs">
                                      <thead className="bg-muted/50">
                                        <tr>
                                          <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Rule</th>
                                          <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Status</th>
                                          <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Details</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {file.rules.map((rule) => (
                                          <tr key={rule.id} className="border-t border-border/40">
                                            <td className="px-3 py-1 font-mono text-foreground">{rule.name}</td>
                                            <td className="px-3 py-1">
                                              <Badge
                                                variant={rule.status === "fail" ? "destructive" : "secondary"}
                                                className={cn("text-[10px]", rule.status === "pass" && "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20")}
                                              >
                                                {rule.status.toUpperCase()}
                                              </Badge>
                                            </td>
                                            <td className="px-3 py-1 text-muted-foreground">{rule.details || "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Raw report JSON */}
                          <div>
                            <p className="mb-2 text-xs font-semibold text-foreground">Full Report (JSON)</p>
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                              <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                                {JSON.stringify(fetchedReport.sqliteReport?.report ?? sqliteValidationResult, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Run Validation</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start the selected {mode === "osm" ? "OSM" : "SQLite"} validator after a file is selected.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={resetCurrentFile} disabled={!selectedFile}>
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <Button type="button" onClick={startValidation} disabled={!selectedFile || status === "running"}>
                    {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Start validation
                  </Button>
                  {(status === "completed" || fetchedReport) && (
                    <Button
                      type="button"
                      disabled={!version.trim() || modalLoading}
                      title={!version.trim() ? "Enter a version to enable generation" : undefined}
                      onClick={async () => {
                        setGenerationAcknowledged(false);
                        setModalError("");
                        // Skip re-fetch if we already have the report for this version
                        if (fetchedReport && fetchedReport.version === version.trim()) {
                          setShowGenerationModal(true);
                          return;
                        }
                        setFetchedReport(null);
                        setModalLoading(true);
                        try {
                          const resp = await api.get(`/admin-dashboard/validation/report/${encodeURIComponent(version.trim())}`);
                          const doc = resp?.data?.data ?? resp?.data ?? null;
                          setFetchedReport(doc);
                        } catch {
                          // No saved report yet — modal will fall back to local state
                          setFetchedReport(null);
                        } finally {
                          setModalLoading(false);
                          setShowGenerationModal(true);
                        }
                      }}
                    >
                      {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Continue to generation
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Workflow Progress</p>
                  <span className="text-sm text-muted-foreground">{Math.round(workflowProgress)}%</span>
                </div>
                <Progress value={workflowProgress} />
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {workflowSteps.map((step, index) => {
                    const completed = status === "completed" || workflowProgress >= ((index + 1) / workflowSteps.length) * 100;
                    const active = status === "running" && activeWorkflowStep === index;

                    return (
                      <div
                        key={step}
                        className={cn(
                          "rounded-lg border px-3 py-3 text-sm",
                          completed
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : active
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          {completed ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : active ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                          )}
                          <span className="font-medium">{step}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {validationLog && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Validation Log:</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                      {validationLog}
                    </pre>
                  </div>
                </div>
              )}

              {currentJobId && status === "completed" && (
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button variant="outline" size="sm" onClick={fetchReport} disabled={fetchingReport}>
                    {fetchingReport ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                    {showReport ? "Refresh Report" : "View Full Report"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReport} disabled={downloadingReport}>
                    {downloadingReport ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Download className="mr-2 h-3 w-3" />}
                    Download Report
                  </Button>
                  {comparisonResults && (
                    <Button variant="outline" size="sm" onClick={() => downloadJson(`comparison_${currentJobId}.json`, comparisonResults)}>
                      Download Comparison
                    </Button>
                  )}
                </div>
              )}

              {showReport && reportData && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Full Validation Report:</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowReport(false)} className="h-7 text-xs">
                      Hide
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <SummaryRow label="Report Type" value={mode === "osm" ? "OSM / PBF" : "SQLite ZIP"} />
                    <SummaryRow
                      label="Report State"
                      value={String((reportData?.status as string | undefined) ?? (status === "completed" ? "COMPLETED" : status === "failed" ? "FAILED" : "RUNNING"))}
                    />
                    <SummaryRow label="Job ID" value={currentJobId ?? "-"} />
                  </div>
                  {mode === "osm" ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <SummaryRow label="Checked" value={String((result as OsmValidationResult & { checked?: number })?.checked ?? (((reportData?.summary as ValidationRecord | undefined)?.checked as number | undefined) ?? 0))} />
                      <SummaryRow label="Errors" value={String((result as OsmValidationResult & { errors?: number })?.errors ?? (((reportData?.summary as ValidationRecord | undefined)?.errors as number | undefined) ?? 0))} />
                      <SummaryRow label="Warnings" value={String((result as OsmValidationResult & { warnings?: number })?.warnings ?? (((reportData?.summary as ValidationRecord | undefined)?.warnings as number | undefined) ?? 0))} />
                      <SummaryRow label="Missing Nodes" value={String((result as OsmValidationResult & { missingNodeCount?: number })?.missingNodeCount ?? (((reportData?.summary as ValidationRecord | undefined)?.missing_node_count as number | undefined) ?? 0))} />
                      <SummaryRow label="New Nodes" value={String((result as OsmValidationResult & { newNodeCount?: number })?.newNodeCount ?? (((reportData?.summary as ValidationRecord | undefined)?.new_node_count as number | undefined) ?? 0))} />
                      <SummaryRow label="Validation Result" value={String((reportData?.status as string | undefined) ?? (status === "completed" ? "PASS" : status === "failed" ? "FAIL" : "RUNNING"))} />
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-3">
                      <SummaryRow label="Files" value={String((result as SQLiteValidationResult & { completedCount?: number })?.files?.length ?? (((reportData?.files as unknown[] | undefined)?.length) ?? 0))} />
                      <SummaryRow label="Passed" value={String((result as SQLiteValidationResult & { completedCount?: number })?.completedCount ?? 0)} />
                      <SummaryRow label="Failed" value={String((result as SQLiteValidationResult & { failedCount?: number })?.failedCount ?? 0)} />
                      <SummaryRow label="Overall Passed" value={String((reportData?.overall_passed as boolean | undefined) ?? (status === "completed" ? true : false))} />
                      <SummaryRow label="ZIP" value={String((reportData?.zip as string | undefined) ?? (reportData?.fileName as string | undefined) ?? selectedFile?.name ?? "-")} />
                      <SummaryRow label="Validation Result" value={String((reportData?.status as string | undefined) ?? (status === "completed" ? "PASS" : status === "failed" ? "FAIL" : "RUNNING"))} />
                    </div>
                  )}
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                      {JSON.stringify(reportData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {comparisonResults && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Reference Node Comparison:</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowComparison(!showComparison)} className="h-7 text-xs">
                      {showComparison ? "Hide Details" : "Show Details"}
                    </Button>
                  </div>
                  {showComparison && (
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-amber-50/50 p-3 font-mono text-xs text-amber-900">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(comparisonResults, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow label="Mode" value={mode === "osm" ? "OSM Validator" : "SQLite Validator"} />
              <SummaryRow label={mode === "sqlite" ? "ZIP Folder" : "File"} value={selectedFile ? selectedFile.name : "-"} />
              <SummaryRow label="Status" value={statusLabel} />

              {summaryStats && (
                <div className="space-y-2 border-t border-border pt-2">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Validation Response
                  </p>
                  <SummaryRow label="Primary" value={summaryStats.primary} />
                  <SummaryRow label="Secondary" value={summaryStats.secondary} />
                  <SummaryRow label="Details" value={summaryStats.tertiary} />
                </div>
              )}

              {result && mode === "osm" && "summary" in result && (
                <div className="space-y-2 border-t border-border pt-2">
                  <SummaryRow label="Missing Tags" value={String(result.summary.missingRequiredTags)} />
                  <SummaryRow label="Invalid Values" value={String(result.summary.invalidTagValues)} />
                  <SummaryRow label="Total Findings" value={String(result.summary.totalFindings)} />
                </div>
              )}

              {result && mode === "sqlite" && "files" in result && (
                <div className="space-y-2 border-t border-border pt-2">
                  <SummaryRow label="SQLite Files" value={String(result.files.length)} />
                  <SummaryRow
                    label="Total Rules"
                    value={String(result.files.reduce((acc, f) => acc + f.ruleCount, 0))}
                  />
                </div>
              )}

              {comparisonResults && (
                <div className="space-y-2 border-t border-border pt-2">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Comparison
                  </p>
                  <SummaryRow label="Matching Nodes" value={String(comparisonResults.matchingNodes ?? 0)} />
                  <SummaryRow label="New Nodes" value={String(comparisonResults.newNodes ?? 0)} />
                  <SummaryRow label="Missing Nodes" value={String(comparisonResults.missingNodes ?? 0)} />
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Upload progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Workflow progress</span>
                  <span>{Math.round(workflowProgress)}%</span>
                </div>
                <Progress value={workflowProgress} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Validation Notes</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Accepted input changes with the selected validator mode.</p>
                {mode === "sqlite" && <p>SQLite mode accepts a single .zip bundle only.</p>}
                <p>The start action is enabled only after a valid file is selected.</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Generation Confirmation Modal */}
      <Dialog open={showGenerationModal} onOpenChange={setShowGenerationModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Confirm Generation
            </DialogTitle>
            <DialogDescription>
              Review validation results before proceeding. Version is used as the primary key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Version pill */}
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <Tag className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Version</span>
              <Badge variant="default" className="ml-1">{version}</Badge>
              
            </div>

            {modalError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {/* OSM result — prefer DB data, fall back to local state */}
            {(() => {
              const dbOsm = fetchedReport?.osmReport;
              // DB stores the already-normalized OsmValidationResult shape — cast directly.
              const osm: (OsmValidationResult & { checked?: number; errors?: number; warnings?: number }) | null = dbOsm
                ? (dbOsm.report as unknown as OsmValidationResult & { checked?: number; errors?: number; warnings?: number })
                : osmValidationResult;
              const hasFail = osm && (osm.status === "failed" || (osm.summary?.missingRequiredTags ?? 0) > 0);
              return (
                <div className={cn(
                  "rounded-lg border p-3",
                  !osm ? "border-border bg-muted/20" : hasFail ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/20 bg-emerald-500/10",
                )}>
                  <div className="mb-2 flex items-center gap-2">
                    <FileArchive className="h-4 w-4" />
                    <span className="text-sm font-semibold">OSM Validation</span>
                    {dbOsm && <Badge variant="outline" className="ml-1 text-xs">DB</Badge>}
                    {osm ? (
                      <Badge variant={osm.status === "failed" ? "destructive" : "default"} className="ml-auto">
                        {String(osm.status ?? "unknown").toUpperCase()}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto">Not run</Badge>
                    )}
                  </div>
                  {osm ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <p className="font-semibold text-foreground" title="Nodes checked">
                            {(osm.checked ?? 0).toLocaleString()}
                          </p>
                          <p className="text-muted-foreground">Checked</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osm.errors ?? osm.summary?.missingRequiredTags ?? 0}</p>
                          <p className="text-muted-foreground">Errors</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{osm.warnings ?? osm.summary?.invalidTagValues ?? 0}</p>
                          <p className="text-muted-foreground">Warnings</p>
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        File: {dbOsm ? String(dbOsm.meta?.fileName ?? osm.fileName) : osm.fileName}
                      </p>
                      {dbOsm && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Saved: {new Date(dbOsm.savedAt).toLocaleString()}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Complete an OSM validation to populate this section.</p>
                  )}
                </div>
              );
            })()}

            {/* SQLite result — prefer DB data, fall back to local state */}
            {(() => {
              const dbSql = fetchedReport?.sqliteReport;
              // DB stores the already-normalized SQLiteValidationResult shape — cast directly.
              const sqlite: (SQLiteValidationResult & { completedCount?: number; failedCount?: number }) | null = dbSql
                ? (dbSql.report as unknown as SQLiteValidationResult & { completedCount?: number; failedCount?: number })
                : sqliteValidationResult;
              const hasFail = sqlite && (sqlite.status === "failed" || sqlite.files?.some((f) => f.status === "failed"));
              return (
                <div className={cn(
                  "rounded-lg border p-3",
                  !sqlite ? "border-border bg-muted/20" : hasFail ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/20 bg-emerald-500/10",
                )}>
                  <div className="mb-2 flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span className="text-sm font-semibold">SQLite Validation</span>
                    {dbSql && <Badge variant="outline" className="ml-1 text-xs">DB</Badge>}
                    {sqlite ? (
                      <Badge variant={sqlite.status === "failed" ? "destructive" : "default"} className="ml-auto">
                        {String(sqlite.status ?? "unknown").toUpperCase()}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto">Not run</Badge>
                    )}
                  </div>
                  {sqlite ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqlite.files?.length ?? 0}</p>
                          <p className="text-muted-foreground">Files</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqlite.files?.filter((f) => f.status !== "failed").length ?? 0}</p>
                          <p className="text-muted-foreground">Passed</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{sqlite.files?.filter((f) => f.status === "failed").length ?? 0}</p>
                          <p className="text-muted-foreground">Failed</p>
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        File: {dbSql ? String(dbSql.meta?.fileName ?? sqlite.fileName) : sqlite.fileName}
                      </p>
                      {dbSql && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Saved: {new Date(dbSql.savedAt).toLocaleString()}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Complete a SQLite validation to populate this section.</p>
                  )}
                </div>
              );
            })()}

            {/* Warning + acknowledgement for failures */}
            {generationHasFailed && (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Validation Issues Detected</p>
                    <p className="mt-1 text-xs text-amber-700">
                      One or more reports contain errors or failures. Proceeding may produce incorrect generation results.
                    </p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={generationAcknowledged}
                    onChange={(e) => setGenerationAcknowledged(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                  />
                  <span className="text-xs font-medium text-amber-800">
                    I acknowledge the issues and want to proceed anyway
                  </span>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerationModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={generationHasFailed && !generationAcknowledged}
              onClick={() => {
                setShowGenerationModal(false);
                navigate(`/pipeline?createGeneration=true&version=${encodeURIComponent(version)}`);
              }}
            >
              Proceed to Generation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ShieldCheck;
  tone: "neutral" | "active" | "success";
}) {
  const toneClasses = {
    neutral: "bg-muted text-muted-foreground",
    active: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <span className={cn("rounded-md p-2", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-5 truncate text-lg font-semibold text-foreground" title={value}>
          {value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="secondary" className="max-w-[170px] truncate">
        {value}
      </Badge>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[260px] truncate text-sm font-medium text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}
