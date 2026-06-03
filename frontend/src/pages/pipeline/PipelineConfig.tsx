import { useState, useEffect, useCallback } from "react";
import { api } from "@/utils/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotifiedAdmin {
  id: string;
  name: string;
  email: string;
  role?: string;
  method?: string;
}

interface PipelineConfig {
  _id: string;
  mode: string;
  version?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  id: string;
  adminList: Record<string, NotifiedAdmin>;
  serverPaths?: Record<string, ServerPathEntry[]>;
}

interface AvailabilityServer {
  _id: string;
  name: string;
  host: string;
  port?: number;
  status?: string;
  environment?: string;
  isActive?: boolean;
  [key: string]: any;
}

interface ServerPathEntry {
  targetServerId: string;
  inputPath: string;
  outputPath: string;
  folder?: string;
  scriptPath: string;
  backupPath: string;
  logPath: string;
  multithreadscriptpath?: string;
  multithreadoutputpath?: string;
  maxspeedscriptpath?: string;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

const fetchAdminUsers = async (): Promise<AdminUser[]> => {
  const res = await api.get("/admin-dashboard/pipeline-config/details");
  return res.data?.data?.users ?? [];
};

const fetchNotifyList = async (version: string): Promise<NotifiedAdmin[]> => {
  const n8nApiKey = import.meta.env.VITE_N8N_API_KEY;

  const res = await api.get(`/admin-dashboard/pipeline-config/notify-list/${encodeURIComponent(version)}`, {
    headers: {
      "X-N8N-API-KEY": n8nApiKey,
    },
  });
  return res.data?.data?.notifyList ?? [];
};

const fetchServerPathConfig = async (version: string): Promise<Record<string, ServerPathEntry[]>> => {
  const res = await api.post("/admin-dashboard/pipeline-config/server-path", {
    version,
  });
  return res.data?.data?.serverPaths ?? {};
};

const fetchDownloadPathConfig = async (version: string): Promise<Record<string, ServerPathEntry[]>> => {
  const res = await api.post("/admin-dashboard/pipeline-config/download-path-config", {
    version,
  });
  return res.data?.data?.downloadPaths ?? {};
};

const fetchAvailabilityServers = async (): Promise<AvailabilityServer[]> => {
  const res = await api.get("/admin-dashboard/servers");
  return res.data?.data?.servers ?? res.data?.data ?? res.data ?? [];
};

const savePipelineVersion = async (version: string): Promise<any> => {
  const res = await api.post("/admin-dashboard/pipeline-config/add", {
    mode: "generation",
    version,
  });
  return res.data;
};

const fetchCurrentVersion = async (): Promise<string> => {
  try {
    const res = await api.get("/admin-dashboard/pipeline-config/current-version");
    return res.data?.data?.version || res.data?.version || "v1.0";
  } catch (error) {
    console.warn("Failed to fetch current version from database:", error);
    return "v1.0";
  }
};

const removeFromNotifyList = async (version: string, userId: string): Promise<boolean> => {
  const res = await api.post("/admin-dashboard/pipeline-config/remove", {
    mode: "generation",
    version,
    adminId: userId,
  });
  return res.status === 200;
};

const addServerPaths = async (version: string, serverName: string, serverId: string, paths: Omit<ServerPathEntry, "targetServerId">): Promise<any> => {
  const res = await api.post("/admin-dashboard/pipeline-config/add", {
    mode: "generation",
    version,
    serverPaths: [
      {
        targetServerId: serverId,
        service: serverName,
        ...paths,
      },
    ],
  });
  return res.data;
};

const addDownloadPaths = async (version: string, serverId: string, paths: Pick<ServerPathEntry, "outputPath" | "folder" | "scriptPath" | "logPath" | "multithreadscriptpath" | "multithreadoutputpath" | "maxspeedscriptpath">): Promise<any> => {
  const res = await api.post("/admin-dashboard/pipeline-config/download-path", {
    version,
    targetServerId: serverId,
    outputPath: paths.outputPath,
    folder: paths.folder,
    scriptPath: paths.scriptPath,
    logPath: paths.logPath,
    multithreadscriptpath: paths.multithreadscriptpath,
    multithreadoutputpath: paths.multithreadoutputpath,
    maxspeedscriptpath: paths.maxspeedscriptpath,
  });
  return res.data;
};

// ─── NEW: Update Server Paths API ─────────────────────────────────────────────
const updateServerPaths = async (version: string, serverId: string, paths: Omit<ServerPathEntry, "targetServerId">): Promise<any> => {
  const res = await api.patch("/admin-dashboard/pipeline-config/UpdateServer-path", {
    version,
    targetServerId: serverId,
    inputPath: paths.inputPath,
    outputPath: paths.outputPath,
    scriptPath: paths.scriptPath,
    backupPath: paths.backupPath,
    logPath: paths.logPath,
  });
  return res.data;
};

// Update download paths (PATCH). Backend may not have this endpoint in some versions;
// try it and fall back to optimistic local update if necessary.
const updateDownloadPaths = async (
  version: string,
  serverId: string,
  paths: Pick<ServerPathEntry, "outputPath" | "folder" | "scriptPath" | "logPath" | "multithreadscriptpath" | "multithreadoutputpath" | "maxspeedscriptpath">
): Promise<any> => {
  const res = await api.patch("/admin-dashboard/pipeline-config/UpdateDownload-path", {
    version,
    targetServerId: serverId,
    outputPath: paths.outputPath,
    folder: paths.folder,
    scriptPath: paths.scriptPath,
    logPath: paths.logPath,
    multithreadscriptpath: paths.multithreadscriptpath,
    multithreadoutputpath: paths.multithreadoutputpath,
    maxspeedscriptpath: paths.maxspeedscriptpath,
  });
  return res.data;
};

const normalizeServerPathsByServerId = (serverPaths: Record<string, ServerPathEntry[]> | undefined): Record<string, ServerPathEntry[]> => {
  const pathsByServerId: Record<string, ServerPathEntry[]> = {};

  Object.values(serverPaths ?? {}).flat().forEach((pathEntry) => {
    const serverId = pathEntry?.targetServerId;
    if (!serverId) return;
    if (!pathsByServerId[serverId]) pathsByServerId[serverId] = [];
    const isDuplicate = pathsByServerId[serverId].some((entry) =>
      entry.inputPath === pathEntry.inputPath &&
      entry.outputPath === pathEntry.outputPath &&
      entry.scriptPath === pathEntry.scriptPath &&
      entry.backupPath === pathEntry.backupPath &&
      entry.logPath === pathEntry.logPath
    );
    if (!isDuplicate) {
      pathsByServerId[serverId].push(pathEntry);
    }
  });

  return pathsByServerId;
};

const listFolders = async (path: string, serverUser: string): Promise<string[]> => {
  try {
    const formattedUser = serverUser?.toUpperCase() || "ZEUS";

    const response = await fetch('https://sandbox.vmmaps.com/n8n/webhook/omn/list-folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        copyServerUser: formattedUser,
        copyFilePath: path || "/home"
      }),
    });
    const data = await response.json();

    if (data?.filenames && typeof data.filenames === 'string') {
      return data.filenames.split(',').map((name: string) => name.trim()).filter((name: string) => name !== "");
    }

    if (Array.isArray(data)) return data;
    if (data?.folders && Array.isArray(data.folders)) return data.folders;
    if (data?.data && Array.isArray(data.data)) return data.data;

    return [];
  } catch (error) {
    console.error("Error listing folders:", error);
    return [];
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Version Confirmation Dialog removed - replaced by Toast-based unlock flow

const Badge = ({ label, variant }: { label: string; variant: "role" | "active" | "inactive" | "status" | "online" | "offline" }) => {
  const styles: Record<string, string> = {
    role: "bg-secondary text-secondary-foreground border-transparent",
    active: "bg-success/10 text-success border-success/20",
    inactive: "bg-destructive/10 text-destructive border-destructive/20",
    status: "bg-warning/10 text-warning border-warning/20",
    online: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    offline: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${styles[variant]}`}>
      {label}
    </span>
  );
};

const Avatar = ({ name }: { name: string }) => {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["bg-violet-500", "bg-indigo-500", "bg-sky-500", "bg-teal-500", "bg-rose-500", "bg-orange-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold ${color} ring-2 ring-background`}>
      {initials}
    </span>
  );
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

const PathRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs font-mono text-foreground break-all leading-relaxed">{value}</p>
    </div>
  </div>
);

// ─── Server Card ─────────────────────────────────────────────────────────────

interface ServerCardProps {
  server: AvailabilityServer;
  serverPaths: ServerPathEntry[] | undefined;
  onAddPath: (server: AvailabilityServer) => void;
  onViewPath: (server: AvailabilityServer) => void;
}

const ServerCard = ({ server, serverPaths, onAddPath, onViewPath }: ServerCardProps) => {
  const hasPath = serverPaths && serverPaths.length > 0;
  const isOnline = server.status === "online" || server.status === "active" || server.status === "connected";

  return (
    <div className="group relative bg-card rounded-3xl border border-border/80 shadow-sm hover:border-primary/40 hover:shadow-xl transition-all duration-300 overflow-hidden">
      <div className={`h-1 w-full ${hasPath ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-slate-300 to-slate-200"}`} />
      <div className="p-5 flex flex-col h-full space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${hasPath ? "border-emerald-200 bg-emerald-500/10 text-emerald-500" : "border-slate-200 bg-muted text-muted-foreground"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground capitalize tracking-tight">{server.name}</h3>
              {server.host && (
                <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{server.host}{server.port ? `:${server.port}` : ""}</p>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            {isOnline ? "Live" : "Offline"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-border/70 bg-muted/70 p-4 col-span-2">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Environment</p>
            <p className={`mt-3 text-sm font-semibold ${server.environment === "production" ? "text-rose-500" : server.environment === "staging" ? "text-amber-500" : "text-sky-500"}`}>
              {server.environment ? server.environment.charAt(0).toUpperCase() + server.environment.slice(1) : "Development"}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-muted/70 p-4 col-span-2">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Status</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${server.isActive ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"}`}>
                {server.isActive ? "Active" : "Inactive"}
              </span>
              {server.status && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  {server.status}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onAddPath(server)}
              disabled={hasPath}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs font-bold transition-all active:scale-95 shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Path
            </button>
            <button
              onClick={() => onViewPath(server)}
              disabled={!hasPath}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-bold transition-all active:scale-95 shadow-sm shadow-slate-900/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Path
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Shared Path Form Fields (used by Add + Edit modals) ─────────────────────

interface PathFormProps {
  server: AvailabilityServer;
  paths: { inputPath: string; outputPath: string; folder: string; scriptPath: string; backupPath: string; logPath: string; multithreadscriptpath: string; multithreadoutputpath: string; maxspeedscriptpath: string };
  setPaths: React.Dispatch<React.SetStateAction<{ inputPath: string; outputPath: string; folder: string; scriptPath: string; backupPath: string; logPath: string; multithreadscriptpath: string; multithreadoutputpath: string; maxspeedscriptpath: string }>>;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
  isEdit?: boolean;
  mode?: "server" | "download";
}

const PathFormFields = ({ server, paths, setPaths, submitting, onSubmit, onClose, submitLabel, isEdit = false, mode = "server" }: PathFormProps) => {
  const [browsingField, setBrowsingField] = useState<string | null>(null);
  const [folderList, setFolderList] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const handleViewFolders = async (field: string) => {
    const currentPath = paths[field as keyof typeof paths] || "/home";
    setBrowsingField(field);
    setLoadingFolders(true);
    const folders = await listFolders(currentPath, server.name);
    setFolderList(folders);
    setLoadingFolders(false);
  };

  const handleSelectFolder = async (folder: string) => {
    if (!browsingField) return;
    const field = browsingField as keyof typeof paths;
    const currentPath = paths[field];
    const newPath = currentPath.endsWith("/") ? `${currentPath}${folder}` : `${currentPath}/${folder}`;

    setPaths(prev => ({ ...prev, [field]: newPath }));

    setLoadingFolders(true);
    try {
      const folders = await listFolders(newPath, server.name);
      setFolderList(folders);
    } catch (error) {
      console.error("Failed to fetch subfolders:", error);
      setFolderList([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleGoBack = async () => {
    if (!browsingField) return;
    const field = browsingField as keyof typeof paths;
    const currentPath = paths[field];

    if (currentPath === "/home" || currentPath === "/" || !currentPath.includes("/")) return;

    const pathParts = currentPath.split("/").filter(p => p.trim() !== "");
    pathParts.pop();
    const newPath = "/" + pathParts.join("/");
    const finalPath = newPath === "/" ? "/home" : newPath;

    setPaths(prev => ({ ...prev, [field]: finalPath }));
    setLoadingFolders(true);
    try {
      const folders = await listFolders(finalPath, server.name);
      setFolderList(folders);
    } catch (error) {
      setFolderList([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  const fields = [
    {
      key: "inputPath" as const,
      label: "Input Path",
      placeholder: "/home/user/Projects/TileGen/OSM",
      icon: (
        <svg className="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      key: "outputPath" as const,
      label: "Output Path",
      placeholder: "/home/user/Projects/TileGen/Gen",
      icon: (
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
    },
    {
      key: "folder" as const,
      label: "Folder",
      placeholder: "e.g. test",
      icon: (
        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      key: "scriptPath" as const,
      label: "Script Path",
      placeholder: "/home/user/Projects/TileGen/tilemaker",
      icon: (
        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      key: "backupPath" as const,
      label: "Backup Path",
      placeholder: "/home/user/Projects/TileGen/Gen/backup",
      icon: (
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      ),
    },
    {
      key: "logPath" as const,
      label: "Log Path",
      placeholder: "/home/user/Projects/TileGen/logs",
      icon: (
        <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "multithreadscriptpath" as const,
      label: "Multithread Script Path",
      placeholder: "/home/user/Projects/TileGen/tilemaker",
      icon: (
        <svg className="w-3.5 h-3.5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      key: "multithreadoutputpath" as const,
      label: "Multithread Output Path",
      placeholder: "/home/user/Projects/TileGen/tilemaker/routingTiles",
      icon: (
        <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
    },
    {
      key: "maxspeedscriptpath" as const,
      label: "Max Speed Script Path",
      placeholder: "/home/user/Projects/pipeline/maxspeedlogs",
      icon: (
        <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ].filter((field) => {
    if (mode === "download") {
      return ["outputPath", "folder", "scriptPath", "logPath", "multithreadscriptpath", "multithreadoutputpath", "maxspeedscriptpath"].includes(field.key);
    }
    // For availability server section (mode === "server"), exclude specific paths when editing
    if (mode === "server" && isEdit) {
      return !["folder", "multithreadscriptpath", "multithreadoutputpath", "maxspeedscriptpath"].includes(field.key);
    }
    // For availability server section (mode === "server") when adding, show all server fields
    return mode === "server";
  });

  const isValid = mode === "download"
    ? paths.outputPath.trim() && paths.scriptPath.trim() && paths.logPath.trim()
    : paths.inputPath.trim() && paths.outputPath.trim() && paths.scriptPath.trim() && paths.logPath.trim();

  return (
    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5 relative">
          <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {field.icon}
            {field.label}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={paths[field.key]}
              onChange={(e) => setPaths((p) => ({ ...p, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="flex-1 px-4 py-2.5 text-xs font-mono border border-input rounded-xl bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/40"
            />
            <button
              onClick={() => handleViewFolders(field.key)}
              disabled={loadingFolders && browsingField === field.key}
              className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[10px] font-bold border border-border transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {loadingFolders && browsingField === field.key ? (
                <div className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              )}
              View Folder
            </button>
          </div>

          {/* Folder Browser Section */}
          {browsingField === field.key && (
            <div className="mt-2 bg-muted/30 border border-border rounded-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200 p-1">
              <div className="px-3 py-2 border-b border-border mb-1 flex items-center justify-between sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGoBack}
                    disabled={paths[field.key as keyof typeof paths] === "/home" || paths[field.key as keyof typeof paths] === "/" || loadingFolders}
                    className="p-1 hover:bg-muted rounded text-muted-foreground disabled:opacity-30 transition-colors"
                    title="Go back"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Select Folder</span>
                </div>
                <button onClick={() => setBrowsingField(null)} className="text-muted-foreground hover:text-foreground p-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {loadingFolders ? (
                <div className="py-8 flex flex-col items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading...</p>
                </div>
              ) : folderList.length > 0 ? (
                folderList.map((folder, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectFolder(folder)}
                    className="w-full text-left px-3 py-2.5 text-xs font-mono hover:bg-primary/5 hover:text-primary rounded-lg transition-all flex items-center gap-3 group"
                  >
                    <div className="w-6 h-6 rounded-md bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                      <svg className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <span className="truncate">{folder}</span>
                  </button>
                ))
              ) : (
                <div className="py-8 px-4 text-center">
                  <p className="text-[10px] text-muted-foreground">No subfolders found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSubmit}
          disabled={submitting || !isValid}
          className={`flex-1 px-4 py-2.5 text-primary-foreground text-sm font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg active:scale-95 ${isEdit
            ? "bg-amber-500 hover:bg-amber-500/90 shadow-amber-500/20"
            : "bg-primary hover:bg-primary/90 shadow-primary/20"
            }`}
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
              {isEdit ? "Updating…" : "Saving…"}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isEdit
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                }
              </svg>
              {submitLabel}
            </>
          )}
        </button>
        <button onClick={onClose} className="px-4 py-2.5 bg-secondary text-secondary-foreground text-sm font-bold rounded-xl hover:bg-secondary/80 transition-all active:scale-95">
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Add Path Modal ────────────────────────────────────────────────────────────

interface AddPathModalProps {
  server: AvailabilityServer;
  onClose: () => void;
  onSubmit: (paths: Omit<ServerPathEntry, "targetServerId">) => Promise<void>;
  submitting: boolean;
  mode?: "server" | "download";
}

const AddPathModal = ({ server, onClose, onSubmit, submitting, mode = "server" }: AddPathModalProps) => {
  const [paths, setPaths] = useState({ inputPath: "/home", outputPath: "/home", folder: "/home", scriptPath: "/home", backupPath: "/home", logPath: "/home", multithreadscriptpath: "/home", multithreadoutputpath: "/home", maxspeedscriptpath: "/home" });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">Configure Paths</h3>
              <p className="text-[10px] text-muted-foreground capitalize font-mono">{server.name} · {server._id.slice(-8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <PathFormFields
          server={server}
          paths={paths}
          setPaths={setPaths}
          submitting={submitting}
          onSubmit={() => onSubmit(paths)}
          onClose={onClose}
          submitLabel="Save Paths"
          isEdit={false}
          mode={mode}
        />
      </div>
    </div>
  );
};

// ─── Edit Path Modal ──────────────────────────────────────────────────────────

interface EditPathModalProps {
  server: AvailabilityServer;
  existingEntry: ServerPathEntry;
  onClose: () => void;
  onSubmit: (paths: Omit<ServerPathEntry, "targetServerId">) => Promise<void>;
  submitting: boolean;
  mode?: "server" | "download";
}

const EditPathModal = ({ server, existingEntry, onClose, onSubmit, submitting, mode = "server" }: EditPathModalProps) => {
  const [paths, setPaths] = useState(() => {
    if (mode === "download") {
      return {
        inputPath: "",
        outputPath: existingEntry.outputPath || "",
        folder: existingEntry.folder || "",
        scriptPath: existingEntry.scriptPath || "",
        backupPath: "",
        logPath: existingEntry.logPath || "/home",
        multithreadscriptpath: existingEntry.multithreadscriptpath || "/home",
        multithreadoutputpath: existingEntry.multithreadoutputpath || "/home",
        maxspeedscriptpath: existingEntry.maxspeedscriptpath || "/home",
      };
    }
    return {
      inputPath: existingEntry.inputPath,
      outputPath: existingEntry.outputPath,
      folder: existingEntry.folder || "",
      scriptPath: existingEntry.scriptPath,
      backupPath: existingEntry.backupPath,
      logPath: existingEntry.logPath || "/home",
      multithreadscriptpath: "",
      multithreadoutputpath: "",
      maxspeedscriptpath: "",
    };
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-card w-full max-w-md rounded-2xl shadow-2xl border border-amber-500/30 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border bg-amber-500/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm">Edit Paths</h3>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider">Edit Mode</span>
              </div>
              <p className="text-[10px] text-muted-foreground capitalize font-mono">{server.name} · {server._id.slice(-8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <PathFormFields
          server={server}
          paths={paths}
          setPaths={setPaths}
          submitting={submitting}
          onSubmit={() => onSubmit(paths)}
          onClose={onClose}
          submitLabel="Update Paths"
          isEdit={true}
          mode={mode}
        />
      </div>
    </div>
  );
};

// ─── View Path Modal ───────────────────────────────────────────────────────────

interface ViewPathModalProps {
  server: AvailabilityServer;
  paths: ServerPathEntry[];
  onClose: () => void;
  onEdit: (entry: ServerPathEntry) => void; // NEW
  mode?: "server" | "download";
}

const ViewPathModal = ({ server, paths, onClose, onEdit, mode = "server" }: ViewPathModalProps) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
    <div className="relative bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm capitalize">{server.name} — Path Config</h3>
            <p className="text-[10px] text-muted-foreground">{paths.length} configuration{paths.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-6 space-y-4">
        {paths.map((entry, idx) => (
          <div key={idx} className="bg-muted/30 rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Config #{idx + 1}</span>
                <span className="text-[10px] font-mono text-muted-foreground">Target: {entry.targetServerId.slice(-8)}</span>
              </div>
              <button
                onClick={() => onEdit(entry)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[10px] font-bold border border-amber-500/20 transition-all active:scale-95"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Path
              </button>
            </div>
            <div className="px-4 py-1">
              {mode === "server" && (
                <PathRow
                  label="Input Path"
                  value={entry.inputPath}
                  icon={<svg className="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
                />
              )}
              <PathRow
                label="Output Path"
                value={entry.outputPath || "Not configured"}
                icon={<svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
              />
              {mode === "download" && (
                <PathRow
                  label="Folder"
                  value={entry.folder || "Not configured"}
                  icon={<svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                />
              )}
              <PathRow
                label="Script Path"
                value={entry.scriptPath || "Not configured"}
                icon={<svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
              />
              {mode === "server" && (
                <PathRow
                  label="Backup Path"
                  value={entry.backupPath}
                  icon={<svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
                />
              )}
              <PathRow
                label="Log Path"
                value={entry.logPath || "Not configured"}
                icon={<svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              />
              {mode === "download" && (
                <>
                  <PathRow
                    label="Multithread Script Path"
                    value={entry.multithreadscriptpath || "Not configured"}
                    icon={<svg className="w-3.5 h-3.5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
                  />
                  <PathRow
                    label="Multithread Output Path"
                    value={entry.multithreadoutputpath || "Not configured"}
                    icon={<svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                  />
                  <PathRow
                    label="Max Speed Script Path"
                    value={entry.maxspeedscriptpath || "Not configured"}
                    icon={<svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-3 border-t border-border bg-muted/10 flex-shrink-0">
        <button onClick={onClose} className="w-full px-4 py-2.5 bg-secondary text-secondary-foreground text-sm font-bold rounded-xl hover:bg-secondary/80 transition-all active:scale-95">
          Close
        </button>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PipelineConfig() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [notifiedAdmins, setNotifiedAdmins] = useState<Record<string, NotifiedAdmin>>({});
  const [localAdminList, setLocalAdminList] = useState<Record<string, NotifiedAdmin>>({});
  const [availabilityServers, setAvailabilityServers] = useState<AvailabilityServer[]>([]);
  const [serverPathsMap, setServerPathsMap] = useState<Record<string, ServerPathEntry[]>>({});
  const [downloadPathsMap, setDownloadPathsMap] = useState<Record<string, ServerPathEntry[]>>({});
  const [version, setVersion] = useState("");
  const [savedVersion, setSavedVersion] = useState("");

  // Fetch current version from database on mount
  useEffect(() => {
    const initVersion = async () => {
      const dbVersion = await fetchCurrentVersion();
      setVersion(dbVersion);
      setSavedVersion(dbVersion);
      localStorage.setItem("pipeline_version", dbVersion);
    };
    initVersion();
  }, []);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingServerPaths, setLoadingServerPaths] = useState(false);
  const [loadingDownloadPaths, setLoadingDownloadPaths] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  // ── Version Confirmation State ──────────────────────────────────────────
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ 
    msg: string; 
    type: "success" | "error" | "confirm"; 
    onConfirm?: () => void;
  } | null>(null);
  const [isVersionEditable, setIsVersionEditable] = useState(false);
  const [search, setSearch] = useState("");

  const showToast = (msg: string, type: "success" | "error" | "confirm", onConfirm?: () => void) => {
    setToast({ msg, type, onConfirm });
    if (type !== "confirm") {
      setTimeout(() => setToast(null), 3000);
    }
  };
  const [adminPage, setAdminPage] = useState(1);
  const [notifyPage, setNotifyPage] = useState(1);
  const itemsPerPage = 10;

  // Active tab for main section
  const [activeTab, setActiveTab] = useState<"admins" | "servers" | "downloadConfig" | "rules">("admins");
  const [notifyPanelOpen, setNotifyPanelOpen] = useState(false);

  // Validation Rules State
  const [activeRuleTab, setActiveRuleTab] = useState<"osm" | "sqlite">("osm");
  const [osmRulesData, setOsmRulesData] = useState<any>(null);
  const [sqliteRulesData, setSqliteRulesData] = useState<any>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [editedRulesText, setEditedRulesText] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  const VALIDATION_API_BASE = "https://sandbox.vmmaps.com/osmValidator";

  const fetchRules = useCallback(async (type: "osm" | "sqlite") => {
    setLoadingRules(true);
    try {
      const response = await fetch(`${VALIDATION_API_BASE}/rules/${type}`);
      const data = await response.json();
      if (type === "osm") setOsmRulesData(data);
      else setSqliteRulesData(data);
    } catch (error) {
      console.error(`Failed to fetch ${type} rules:`, error);
      showToast(`Failed to fetch ${type.toUpperCase()} validation rules.`, "error");
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const handleFormatRules = useCallback(() => {
    try {
      const currentData = activeRuleTab === "osm" ? osmRulesData : sqliteRulesData;
      if (!currentData) return;
      // Re-parsing to check validity and set back to state
      const formatted = JSON.parse(JSON.stringify(currentData));
      if (activeRuleTab === "osm") setOsmRulesData(formatted);
      else setSqliteRulesData(formatted);
      showToast("Rules formatted successfully", "success");
    } catch (error) {
      showToast("Invalid JSON structure", "error");
    }
  }, [activeRuleTab, osmRulesData, sqliteRulesData]);

  const handleDownloadRules = useCallback(() => {
    const data = activeRuleTab === "osm" ? osmRulesData : sqliteRulesData;
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeRuleTab}_validation_rules.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`${activeRuleTab.toUpperCase()} rules downloaded`, "success");
  }, [activeRuleTab, osmRulesData, sqliteRulesData]);

  const handleUploadRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (activeRuleTab === "osm") setOsmRulesData(parsed);
        else setSqliteRulesData(parsed);
        showToast(`${activeRuleTab.toUpperCase()} rules uploaded successfully`, "success");
      } catch (err) {
        showToast("Invalid JSON file", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleEditRules = () => {
    const currentData = activeRuleTab === "osm" ? osmRulesData : sqliteRulesData;
    setEditedRulesText(JSON.stringify(currentData, null, 2));
    setIsEditingRules(true);
  };

  const handleCancelEdit = () => {
    setIsEditingRules(false);
    setEditedRulesText("");
  };

  const handleSaveRules = async () => {
    try {
      const parsed = JSON.parse(editedRulesText);
      setSavingRules(true);
      const response = await fetch(`${VALIDATION_API_BASE}/rules/${activeRuleTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (response.ok) {
        if (activeRuleTab === "osm") setOsmRulesData(parsed);
        else setSqliteRulesData(parsed);
        setIsEditingRules(false);
        setEditedRulesText("");
        showToast(`${activeRuleTab.toUpperCase()} rules saved successfully`, "success");
      } else {
        showToast("Failed to save rules", "error");
      }
    } catch (error) {
      showToast("Invalid JSON format", "error");
    } finally {
      setSavingRules(false);
    }
  };

  useEffect(() => {
    if (activeTab === "rules") {
      fetchRules(activeRuleTab);
    }
  }, [activeTab, activeRuleTab, fetchRules]);


  // Server Path Modals
  const [addPathServer, setAddPathServer] = useState<AvailabilityServer | null>(null);
  const [addPathMode, setAddPathMode] = useState<"server" | "download">("server");
  const [viewPathServer, setViewPathServer] = useState<AvailabilityServer | null>(null);
  const [viewPathMode, setViewPathMode] = useState<"server" | "download">("server");
  const [submittingPath, setSubmittingPath] = useState(false);

  // ── NEW: Edit Path state ──────────────────────────────────────────────────
  const [editPathEntry, setEditPathEntry] = useState<ServerPathEntry | null>(null);
  const [editPathServer, setEditPathServer] = useState<AvailabilityServer | null>(null);
  const [submittingEditPath, setSubmittingEditPath] = useState(false);
  const [editMode, setEditMode] = useState<"server" | "download">("server");




  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const users = await fetchAdminUsers();
      setAdminUsers(users);
    } catch {
      showToast("Failed to load admin users.", "error");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadConfigs = useCallback(async (versionToLoad = savedVersion) => {
    setLoadingConfigs(true);
    try {
      const notifyUsers = await fetchNotifyList(versionToLoad);
      const notifyMap = notifyUsers.reduce<Record<string, NotifiedAdmin>>((acc, admin) => {
        const key = admin.name || admin.email || admin.id;
        if (key) acc[key] = admin;
        return acc;
      }, {});
      setNotifiedAdmins(notifyMap);
      setLocalAdminList(notifyMap);
    } catch (err: any) {
      setNotifiedAdmins({});
      setLocalAdminList({});
      showToast(err.response?.data?.message || "Failed to load pipeline configs.", "error");
    } finally {
      setLoadingConfigs(false);
    }
  }, [savedVersion]);

  const loadServerPathConfig = useCallback(async (versionToLoad = savedVersion) => {
    if (!versionToLoad) return;
    setLoadingServerPaths(true);
    try {
      const serverPaths = await fetchServerPathConfig(versionToLoad);
      setServerPathsMap(normalizeServerPathsByServerId(serverPaths));
    } catch (err: any) {
      setServerPathsMap({});
      showToast(err.response?.data?.message || "Failed to load server path config.", "error");
    } finally {
      setLoadingServerPaths(false);
    }
  }, [savedVersion]);

  const loadDownloadPathConfig = useCallback(async (versionToLoad = savedVersion) => {
    if (!versionToLoad) return;
    setLoadingDownloadPaths(true);
    try {
      const downloadPaths = await fetchDownloadPathConfig(versionToLoad);
      setDownloadPathsMap(normalizeServerPathsByServerId(downloadPaths));
    } catch (err: any) {
      setDownloadPathsMap({});
      showToast(err.response?.data?.message || "Failed to load download path config.", "error");
    } finally {
      setLoadingDownloadPaths(false);
    }
  }, [savedVersion]);

  const loadServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const servers = await fetchAvailabilityServers();
      setAvailabilityServers(servers);
    } catch {
      showToast("Failed to load servers.", "error");
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadServers();
  }, [loadUsers, loadServers]);

  useEffect(() => {
    if (savedVersion) {
      loadConfigs();
    }
  }, [loadConfigs, savedVersion]);

  useEffect(() => {
    if (activeTab === "servers" && savedVersion) {
      loadServerPathConfig(savedVersion);
    }
    if (activeTab === "downloadConfig" && savedVersion) {
      loadDownloadPathConfig(savedVersion);
    }
  }, [activeTab, loadDownloadPathConfig, loadServerPathConfig, savedVersion]);

  const handleSaveVersion = async () => {
    const cleanVersion = version.trim() || "v1.0";
    setSavingVersion(true);
    try {
      const response = await savePipelineVersion(cleanVersion);
      if (response?.success) {
        setVersion(cleanVersion);
        setSavedVersion(cleanVersion);
        localStorage.setItem("pipeline_version", cleanVersion);
        await loadConfigs(cleanVersion);
        if (activeTab === "servers") {
          await loadServerPathConfig(cleanVersion);
        }
        if (activeTab === "downloadConfig") {
          await loadDownloadPathConfig(cleanVersion);
        }
        setIsVersionEditable(false);

        const isNewVersion = cleanVersion !== savedVersion;
        showToast(
          isNewVersion
            ? `New version ${cleanVersion} created successfully.`
            : `Version updated to ${cleanVersion}.`,
          "success"
        );
      } else {
        showToast(response?.message || "Failed to save version.", "error");
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || "Network error. Please try again.";
      showToast(errMsg, "error");
    } finally {
      setSavingVersion(false);
    }
  };

  // Removed handleConfirmVersionChange and handleCancelVersionChange as they are replaced by the unlock flow

  const handleToggleLocal = (user: AdminUser, checked: boolean, currentMethod: string) => {
    setLocalAdminList((prev) => {
      const next = { ...prev };
      if (checked) {
        next[user.name] = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          method: currentMethod.toLowerCase()
        };
      } else {
        delete next[user.name];
      }
      return next;
    });
  };

  const handleMethodLocal = (user: AdminUser, method: string) => {
    setLocalAdminList((prev) => {
      if (!prev[user.name]) return prev;
      return {
        ...prev,
        [user.name]: {
          ...prev[user.name],
          method: method.toLowerCase()
        },
      };
    });
  };

  const handleSaveAdminList = async () => {
    setSavingVersion(true);
    try {
      const response = await api.post("/admin-dashboard/pipeline-config/add", {
        mode: "generation",
        version: savedVersion,
        adminList: localAdminList,
      });
      if (response?.data?.success) {
        await loadConfigs(savedVersion);
        showToast("Admin notification list saved successfully.", "success");
      } else {
        showToast(response?.data?.message || "Failed to save admin list.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRemoveNotify = async (admin: NotifiedAdmin | AdminUser) => {
    setNotifyingId(admin.id);
    try {
      const ok = await removeFromNotifyList(savedVersion, admin.id);
      if (ok) {
        await loadConfigs(savedVersion);
        showToast(`${admin.name} removed from notify list.`, "success");
      } else {
        showToast("Failed to remove user.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setNotifyingId(null);
    }
  };

  const handleAddPath = async (paths: Omit<ServerPathEntry, "targetServerId">) => {
    if (!addPathServer) return;
    setSubmittingPath(true);
    try {
      if (addPathMode === "download") {
        const response = await addDownloadPaths(savedVersion, addPathServer._id, {
          outputPath: paths.outputPath,
          folder: paths.folder,
          scriptPath: paths.scriptPath,
          logPath: paths.logPath,
          multithreadscriptpath: paths.multithreadscriptpath,
          multithreadoutputpath: paths.multithreadoutputpath,
          maxspeedscriptpath: paths.maxspeedscriptpath,
        });
        if (response?.success) {
          setDownloadPathsMap((prev) => ({
            ...prev,
            [addPathServer._id]: [
              ...(prev[addPathServer._id] ?? []),
              {
                targetServerId: addPathServer._id,
                inputPath: "",
                outputPath: paths.outputPath,
                folder: paths.folder,
                scriptPath: paths.scriptPath,
                backupPath: "",
                logPath: paths.logPath,
                multithreadscriptpath: paths.multithreadscriptpath,
                multithreadoutputpath: paths.multithreadoutputpath,
                maxspeedscriptpath: paths.maxspeedscriptpath,
              },
            ],
          }));
          showToast(`Download paths saved for ${addPathServer.name}.`, "success");
          setAddPathServer(null);
          await loadDownloadPathConfig(savedVersion);
        } else {
          showToast(response?.message || "Failed to save download paths.", "error");
        }
        return;
      }

      const response = await addServerPaths(savedVersion, addPathServer.name.toLowerCase(), addPathServer._id, paths);
      if (response?.success) {
        const updatedConfig = response.data?.config;
        if (updatedConfig?.serverPaths) {
          setServerPathsMap(updatedConfig.serverPaths);
        } else {
          setServerPathsMap((prev) => ({
            ...prev,
            [addPathServer._id]: [
              ...(prev[addPathServer._id] ?? []),
              { targetServerId: addPathServer._id, ...paths },
            ],
          }));
        }
        showToast(`Paths saved for ${addPathServer.name}.`, "success");
        setAddPathServer(null);
        await loadServerPathConfig(savedVersion);
      } else {
        showToast(response?.message || "Failed to save paths.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSubmittingPath(false);
    }
  };

  // ── NEW: Handle Edit Path submit ──────────────────────────────────────────
  const handleEditPath = async (paths: Omit<ServerPathEntry, "targetServerId">) => {
    if (!editPathServer || !editPathEntry) return;
    setSubmittingEditPath(true);
    try {
      if (editMode === "download") {
        // Try server API for updating download paths
        const response = await updateDownloadPaths(savedVersion, editPathServer._id, {
          outputPath: paths.outputPath,
          folder: paths.folder,
          scriptPath: paths.scriptPath,
          logPath: paths.logPath,
          multithreadscriptpath: paths.multithreadscriptpath,
          multithreadoutputpath: paths.multithreadoutputpath,
          maxspeedscriptpath: paths.maxspeedscriptpath,
        });

        if (response?.success) {
          setDownloadPathsMap((prev) => {
            const existing = prev[editPathServer._id] ?? [];
            const updated = existing.map((entry) =>
              entry.targetServerId === editPathEntry.targetServerId
                ? { ...entry, outputPath: paths.outputPath, folder: paths.folder, scriptPath: paths.scriptPath, logPath: paths.logPath, multithreadscriptpath: paths.multithreadscriptpath, multithreadoutputpath: paths.multithreadoutputpath, maxspeedscriptpath: paths.maxspeedscriptpath }
                : entry
            );
            return { ...prev, [editPathServer._id]: updated };
          });
          showToast(`Download paths updated for ${editPathServer.name}.`, "success");
          setEditPathEntry(null);
          setEditPathServer(null);
          if (viewPathServer?._id === editPathServer._id) {
            await loadDownloadPathConfig(savedVersion);
          }
        } else {
          showToast(response?.message || "Failed to update download paths.", "error");
        }
      } else {
        const response = await updateServerPaths(savedVersion, editPathServer._id, paths);
        if (response?.success) {
          // Update local state optimistically with the new paths
          setServerPathsMap((prev) => {
            const existing = prev[editPathServer._id] ?? [];
            const updated = existing.map((entry) =>
              entry.inputPath === editPathEntry.inputPath
                ? { ...entry, ...paths }
                : entry
            );
            return { ...prev, [editPathServer._id]: updated };
          });
          showToast(`Paths updated for ${editPathServer.name}.`, "success");
          setEditPathEntry(null);
          setEditPathServer(null);
          if (viewPathServer?._id === editPathServer._id) {
            await loadServerPathConfig(savedVersion);
          }
        } else {
          showToast(response?.message || "Failed to update paths.", "error");
        }
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || "Network error. Please try again.";
      showToast(errMsg, "error");
    } finally {
      setSubmittingEditPath(false);
    }
  };

  // ── NEW: Open edit modal from ViewPathModal ───────────────────────────────
  const handleOpenEdit = (entry: ServerPathEntry) => {
    if (!viewPathServer) return;
    setEditPathEntry(entry);
    setEditPathServer(viewPathServer);
    setEditMode(viewPathMode || "server");
    // Keep ViewPathModal open in background — EditPathModal has z-[110] so it renders on top
  };

  const handleOpenServerPath = (server: AvailabilityServer) => {
    setViewPathMode("server");
    setViewPathServer(server);
  };

  const handleOpenDownloadPath = async (server: AvailabilityServer) => {
    setViewPathMode("download");
    setViewPathServer(server);
    if (savedVersion) {
      await loadDownloadPathConfig(savedVersion);
    }
  };

  const handleOpenAddServerPath = (server: AvailabilityServer) => {
    setAddPathMode("server");
    setAddPathServer(server);
  };

  const handleOpenAddDownloadPath = (server: AvailabilityServer) => {
    setAddPathMode("download");
    setAddPathServer(server);
  };

  const filtered = adminUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );
  const notifiedList = Object.values(notifiedAdmins);
  const totalAdminPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedAdmins = filtered.slice((adminPage - 1) * itemsPerPage, adminPage * itemsPerPage);
  const totalNotifyPages = Math.ceil(notifiedList.length / itemsPerPage);
  const paginatedNotified = notifiedList.slice((notifyPage - 1) * itemsPerPage, notifyPage * itemsPerPage);

  const configuredServerCount = Object.keys(activeTab === "downloadConfig" ? downloadPathsMap : serverPathsMap).length;

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      {/* Premium Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border text-sm font-semibold animate-in slide-in-from-right-10 duration-300 ${
          toast.type === "success" ? "bg-emerald-500 border-emerald-400 text-white" : 
          toast.type === "error" ? "bg-rose-500 border-rose-400 text-white" : 
          "bg-slate-900 border-slate-700 text-white"
        }`}>
          <div className="flex items-center gap-3">
             {toast.type === "success" && (
               <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
               </div>
             )}
             {toast.type === "error" && (
               <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
               </div>
             )}
             {toast.type === "confirm" && (
               <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center animate-pulse">
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
               </div>
             )}
             <p className="max-w-[200px] leading-tight">{toast.msg}</p>
          </div>
          
          {toast.type === "confirm" && (
            <div className="flex gap-2 ml-2 border-l border-white/10 pl-4">
              <button 
                onClick={() => { toast.onConfirm?.(); setToast(null); }}
                className="px-4 py-2 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-white/90 transition-all active:scale-95"
              >
                Confirm
              </button>
              <button 
                onClick={() => setToast(null)}
                className="px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20 transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Pipeline Configuration</h1>
            <p className="text-sm text-muted-foreground">Manage servers, paths, and notification pipeline</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Version</label>
            <div className="flex gap-2">
              <div className="relative group">
                <input
                  type="text"
                  value={version}
                  readOnly={!isVersionEditable}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="v1.0"
                  className={`w-36 px-3 py-2 text-sm font-mono border border-input rounded-xl bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all ${!isVersionEditable ? 'pr-10 cursor-not-allowed bg-muted/20' : 'bg-primary/5 border-primary/30'}`}
                />
                {!isVersionEditable && (
                  <button
                    onClick={() => showToast("Are you sure you want to edit the version?", "confirm", () => setIsVersionEditable(true))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    title="Unlock to edit"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </button>
                )}
                {isVersionEditable && (
                  <button
                    onClick={() => { setIsVersionEditable(false); setVersion(savedVersion); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-all"
                    title="Cancel editing"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={handleSaveVersion}
                disabled={savingVersion || !version.trim() || (!isVersionEditable && version === savedVersion)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${isVersionEditable ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' : 'bg-secondary text-secondary-foreground border border-border'}`}
              >
                {savingVersion ? (
                  <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Save
              </button>
            </div>
          </div>

          <button
            onClick={() => { loadUsers(); loadConfigs(); loadServers(); if (savedVersion) loadServerPathConfig(savedVersion); }}
            disabled={loadingUsers || loadingConfigs || loadingServers || loadingServerPaths}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold border border-border transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh all data"
          >
            <svg
              className={`w-4 h-4 ${loadingUsers || loadingConfigs || loadingServers || loadingServerPaths ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Admins", value: adminUsers.length, icon: "👥", color: "text-sky-500" },
          { label: "Notified", value: notifiedList.length, icon: "🔔", color: "text-emerald-500" },
          { label: "Available Servers", value: availabilityServers.length, icon: "🖥️", color: "text-violet-500" },
          { label: "Configured", value: configuredServerCount, icon: "✅", color: "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{stat.icon}</span>
            <div>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Main Panel ────────────────────────────────────────────────── */}
        <div className={`${activeTab === "rules" ? "xl:col-span-3" : "xl:col-span-2"} space-y-4`}>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
            <button
              onClick={() => setActiveTab("admins")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "admins" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Admin Users
            </button>
            <button
              onClick={() => setActiveTab("servers")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === "servers" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Availability Servers
            </button>
            <button
              onClick={() => setActiveTab("downloadConfig")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === "downloadConfig" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Download Config
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === "rules" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Validation Rules
            </button>
          </div>


          {/* Admin Users Tab */}
          {activeTab === "admins" && (
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Admin Users</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">click <strong className="text-foreground">Add to Notify</strong> to include</p>
                  </div>
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search users…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setAdminPage(1); }}
                    className="pl-9 pr-4 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-56"
                  />
                </div>
              </div>

              {loadingUsers ? <Spinner /> : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No users found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[50px] px-6"></TableHead>
                        <TableHead className="px-6">User</TableHead>
                        <TableHead className="px-6">Email</TableHead>
                        <TableHead className="px-6">Role</TableHead>
                        <TableHead className="px-6">Status</TableHead>
                        <TableHead className="px-6">Added</TableHead>
                        <TableHead className="px-6">Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAdmins.map((user) => {
                        const displayName = user.fullName || user.name;
                        const isNotified = !!localAdminList[displayName];
                        const notifiedUser = localAdminList[displayName];
                        const currentMethod = typeof notifiedUser?.method === 'string' ? notifiedUser.method : "to";

                        return (
                          <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={isNotified}
                                onChange={(e) => handleToggleLocal(user, e.target.checked, currentMethod)}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                              />
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={displayName} />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground whitespace-normal">{displayName}</p>
                                  <p className="text-xs text-muted-foreground">ID: {user.id.slice(-8)}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-muted-foreground text-sm break-words">{user.email}</TableCell>
                            <TableCell className="px-6 py-4"><Badge label={user.role} variant="role" /></TableCell>
                            <TableCell className="px-6 py-4"><Badge label={user.isActive ? "Active" : "Inactive"} variant={user.isActive ? "online" : "offline"} /></TableCell>
                            <TableCell className="px-6 py-4 text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="px-6 py-4">
                              <select
                                value={currentMethod}
                                onChange={(e) => handleMethodLocal(user, e.target.value)}
                                className="bg-background border border-input text-xs font-semibold rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:border-primary/50 transition-all"
                              >
                                <option value="to">TO</option>
                                <option value="cc">CC</option>
                                <option value="bcc">BCC</option>
                              </select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {Object.keys(localAdminList).length} users selected for notification
                      </span>
                    </div>
                    <button
                      onClick={handleSaveAdminList}
                      disabled={savingVersion}
                      className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-60"
                    >
                      {savingVersion ? (
                        <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      Add to Notify List
                    </button>
                  </div>
                  {totalAdminPages > 1 && (
                    <div className="px-6 py-4 border-t border-border">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious onClick={() => setAdminPage((p) => Math.max(1, p - 1))} className={adminPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                          </PaginationItem>
                          {Array.from({ length: totalAdminPages }, (_, i) => (
                            <PaginationItem key={i + 1}>
                              <PaginationLink isActive={adminPage === i + 1} onClick={() => setAdminPage(i + 1)} className="cursor-pointer">{i + 1}</PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext onClick={() => setAdminPage((p) => Math.min(totalAdminPages, p + 1))} className={adminPage === totalAdminPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Servers Tab */}
          {activeTab === "servers" && (
            <div>
              {loadingServers || loadingServerPaths ? (
                <Spinner />
              ) : availabilityServers.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border text-center py-16">
                  <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-foreground">No servers available</p>
                  <p className="text-xs text-muted-foreground mt-1">No availability servers were found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {availabilityServers.map((server) => (
                    <ServerCard
                      key={server._id}
                      server={server}
                      serverPaths={serverPathsMap[server._id]}
                      onAddPath={handleOpenAddServerPath}
                      onViewPath={handleOpenServerPath}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Download Config Tab */}
          {activeTab === "downloadConfig" && (
            <div>
              {loadingServers || loadingDownloadPaths ? (
                <Spinner />
              ) : availabilityServers.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border text-center py-16">
                  <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-foreground">No servers available</p>
                  <p className="text-xs text-muted-foreground mt-1">No download config servers were found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card px-5 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-foreground">Download Config</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Download paths loaded from version <span className="font-semibold text-foreground">{savedVersion || version || "v1.0"}</span>.
                        </p>
                      </div>
                      <button
                        onClick={() => loadDownloadPathConfig(savedVersion)}
                        disabled={loadingDownloadPaths}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground transition-all hover:bg-secondary/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg
                          className={`w-3.5 h-3.5 ${loadingDownloadPaths ? "animate-spin" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Path Config
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {availabilityServers.map((server) => (
                      <ServerCard
                        key={`download-config-${server._id}`}
                        server={server}
                        serverPaths={downloadPathsMap[server._id]}
                        onAddPath={handleOpenAddDownloadPath}
                        onViewPath={handleOpenDownloadPath}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation Rules Tab */}
          {activeTab === "rules" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header with Sub-tabs */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="px-6 py-6 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      Validation Engine Rules
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Configure and manage automated validation rule-sets</p>
                  </div>

                  <div className="flex bg-background border border-border p-1 rounded-xl shadow-sm self-start md:self-center">
                    <button
                      onClick={() => setActiveRuleTab("osm")}
                      className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeRuleTab === "osm" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      OSM Validation
                    </button>
                    <button
                      onClick={() => setActiveRuleTab("sqlite")}
                      className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeRuleTab === "sqlite" ? "bg-amber-500 text-white shadow-md" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                      SQLite Validation
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                <div className="p-6">
                  {loadingRules ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
                        </div>
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] animate-pulse">Fetching Rules...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Rules Display */}
                      <div className="bg-muted/20 rounded-2xl border border-border overflow-hidden">
                        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Definition Data</span>
                          <div className="flex items-center gap-2">
                             {!isEditingRules && (
                               <button 
                                 onClick={handleEditRules}
                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold border border-amber-500/20 transition-all"
                                 title="Edit Rules"
                               >
                                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                 Edit
                               </button>
                             )}
                             <button 
                               onClick={() => fetchRules(activeRuleTab)}
                               className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-primary transition-all"
                               title="Refresh"
                             >
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                             </button>
                             <button 
                               onClick={handleFormatRules}
                               className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-primary transition-all"
                               title="Format JSON"
                             >
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                             </button>
                             <button 
                               onClick={handleDownloadRules}
                               className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-emerald-500 transition-all"
                               title="Download JSON"
                             >
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                             </button>
                             <label className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-sky-500 transition-all cursor-pointer" title="Upload JSON">
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                               <input type="file" accept=".json" className="hidden" onChange={handleUploadRules} />
                             </label>
                             <button 
                               onClick={() => {
                                 const content = JSON.stringify(activeRuleTab === "osm" ? osmRulesData : sqliteRulesData, null, 2);
                                 navigator.clipboard.writeText(content);
                                 showToast("JSON copied to clipboard", "success");
                               }}
                               className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-primary transition-all"
                               title="Copy JSON"
                             >
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                             </button>
                          </div>
                        </div>
                        <div className="p-0 max-h-[500px] overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
                          {isEditingRules ? (
                            <div className="p-4 space-y-3">
                              <textarea
                                value={editedRulesText}
                                onChange={(e) => setEditedRulesText(e.target.value)}
                                className="w-full h-[400px] p-4 text-[11px] font-mono leading-relaxed bg-background border border-input rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none"
                                spellCheck={false}
                              />
                              <div className="flex gap-3">
                                <button
                                  onClick={handleSaveRules}
                                  disabled={savingRules}
                                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-60"
                                >
                                  {savingRules ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                                      Saving...
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                      Save Changes
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={savingRules}
                                  className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <pre className="p-6 text-[11px] font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap">
                              {JSON.stringify(activeRuleTab === "osm" ? osmRulesData : sqliteRulesData, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Right: Notified Users Panel ──────────────────────────────────────── */}
        {activeTab === "admins" && (
          <div className="xl:col-span-1 xl:pt-[60px]">
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden sticky top-6">
              <button
                type="button"
                onClick={() => setNotifyPanelOpen((prev) => !prev)}
                className="w-full px-5 py-4 border-b border-border flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary rounded-full inline-block animate-pulse" />
                    Notify Users
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Current version: <span className="text-foreground font-semibold">{savedVersion || version || "v1.0"}</span></p>
                </div>
                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-2xl ${notifyPanelOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <svg className={`w-4 h-4 transition-transform duration-200 ${notifyPanelOpen ? "rotate-180" : "rotate-0"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>

              {!notifyPanelOpen ? (
                <div className="p-6 space-y-4">
                  <div className="rounded-3xl bg-muted/50 p-4 border border-border">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-background/70 p-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Notified</p>
                        <p className="mt-3 text-2xl font-semibold text-emerald-500">{notifiedList.length}</p>
                      </div>
                      <div className="rounded-2xl bg-background/70 p-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Selected</p>
                        <p className="mt-3 text-2xl font-semibold text-primary">{Object.keys(localAdminList).length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl bg-muted/30 p-4 border border-border text-sm text-muted-foreground">
                    Click the header to expand and manage the notification list.
                  </div>
                </div>
              ) : (
                <>
                  {loadingConfigs ? <Spinner /> : notifiedList.length === 0 ? (
                    <div className="text-center py-12 px-6">
                      <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-foreground">No notified users yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Add users from the table to include them.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="px-4 py-3">User</TableHead>
                            <TableHead className="px-4 py-3 text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedNotified.map((admin) => {
                            const isRemoving = notifyingId === admin.id;
                            return (
                              <TableRow key={admin.id} className="hover:bg-muted/30 transition-colors">
                                <TableCell className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar name={admin.name} />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-foreground truncate">{admin.name}</p>
                                        {admin.method && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary uppercase border border-primary/20">
                                            {admin.method}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRemoveNotify(admin)}
                                    disabled={isRemoving}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold border border-destructive/20 transition-colors disabled:opacity-50"
                                  >
                                    {isRemoving ? (
                                      <div className="w-3 h-3 border-2 border-destructive/40 border-t-destructive rounded-full animate-spin" />
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    )}
                                    Remove
                                  </button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {totalNotifyPages > 1 && (
                        <div className="px-4 py-3 border-t border-border">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious onClick={() => setNotifyPage((p) => Math.max(1, p - 1))} className={notifyPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                              </PaginationItem>
                              <PaginationItem>
                                <span className="text-xs text-muted-foreground px-2">Page {notifyPage} of {totalNotifyPages}</span>
                              </PaginationItem>
                              <PaginationItem>
                                <PaginationNext onClick={() => setNotifyPage((p) => Math.min(totalNotifyPages, p + 1))} className={notifyPage === totalNotifyPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </div>
                  )}

                  {!loadingConfigs && notifiedList.length > 0 && (
                    <div className="px-5 py-3 border-t border-border bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-primary">{notifiedList.length}</span>{" "}
                        user{notifiedList.length !== 1 ? "s" : ""} will receive pipeline notifications
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {/* Add Path Modal */}
      {addPathServer && (
        <AddPathModal
          server={addPathServer}
          onClose={() => setAddPathServer(null)}
          onSubmit={handleAddPath}
          submitting={submittingPath}
          mode={addPathMode}
        />
      )}

      {/* View Path Modal */}
      {viewPathServer && (
        <ViewPathModal
          server={viewPathServer}
          paths={(viewPathMode === "download" ? downloadPathsMap : serverPathsMap)[viewPathServer._id] ?? []}
          onClose={() => setViewPathServer(null)}
          onEdit={handleOpenEdit}
          mode={viewPathMode}
        />
      )}

      {/* Edit Path Modal — z-[110] so it layers above ViewPathModal */}
      {editPathServer && editPathEntry && (
        <EditPathModal
          server={editPathServer}
          existingEntry={editPathEntry}
          onClose={() => { setEditPathEntry(null); setEditPathServer(null); }}
          onSubmit={handleEditPath}
          submitting={submittingEditPath}
          mode={editMode}
        />
      )}

      {/* Version Confirmation Dialog removed - replaced by Toast-based unlock flow */}
    </div>
  );
}
