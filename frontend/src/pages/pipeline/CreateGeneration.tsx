import { useState, useEffect, useCallback, useRef } from "react";
import { X, Server, Play, Loader2, ChevronDown, FolderOpen, Upload, ArrowRightLeft, Terminal, Database, RefreshCw, MapPin, Folder, ChevronRight, Home, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Server as ServerType } from "@/pages/servers/serversApi";
import { api } from "@/utils/api";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { resolveSelectedPipelineVersion, storeSelectedPipelineVersion } from "./pipelineVersion";

// ─── Constants ───────────────────────────────────────────────────────────────

const N8N_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook/omn";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationService = "search" | "routing" | "tile";

const SERVICES: { key: GenerationService; label: string; color: string; desc: string }[] = [
  { key: "search",  label: "Search",  color: "bg-blue-500/10 text-blue-600 border-blue-500/20",     desc: "Generate search indexes" },
  { key: "routing", label: "Routing", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", desc: "Generate routing graph" },
  { key: "tile",    label: "Tile",    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",  desc: "Generate map tiles" },
];

const PRESET_SERVERS: { id: string; _id?: string; name: string }[] = [];

type InputMode   = "path" | "copy" | "import";
type SearchMode  = "full" | "contribution";

const SERVICE_ARG: Record<GenerationService, string> = {
  search:  "search",
  routing: "routing:nodepair",
  tile:    "gen:break",
};

type ServiceFormState = {
  service: GenerationService;
  targetServerId: string;
  inputMode: InputMode;
  targetFilePath: string;
  filePath: string;
  inputFile: string;
  outputPathEditable: boolean;
  outputPath: string;
  sourceServerId: string;
  sourceFilePath: string;
  importFile: File | null;
  script: string;
  scriptDisplayPath?: string;
  levelL1: string;
  levelL2: string;
  includeContributions: boolean;
  contributionApiEndpoint: string;
  contributionGtfsIncluded: boolean;
  contributionGtfsServerId: string;
  contributionGtfsFilePath: string;
  routingGtfsIncluded: boolean;
  routingGtfsFilePath: string;
  searchMode: SearchMode;
  contribPythonScriptPath: string;
  contribITCSearchDBPath: string;
  contribMode: string;
  contribApi: string;
  isnotify: boolean;
  backup: boolean;
  backupPath: string;
  configVersion: string;
  hasConfiguredPaths: boolean; // NEW: tracks if server has configured paths
  importServerFilePath: string; // Path on server for import mode file browser
  osmRunOrder?: "sub_regions" | "large_regions";
  hasCustomInputPath?: boolean;
  hasCustomOutputPath?: boolean;
  responseInputPath?: string;
  responseOutputPath?: string;
};

type ServerPathEntry = {
  targetServerId?: string;
  serverId?: string;
  inputPath?: string;
  outputPath?: string;
  folder?: string;
  scriptPath?: string;
  backupPath?: string;
};

// ─── Folder Browser State ────────────────────────────────────────────────────

type FolderBrowserState = {
  open: boolean;
  loading: boolean;
  currentPath: string;
  folders: string[];
  breadcrumbs: string[];
};

const emptyFolderBrowser = (): FolderBrowserState => ({
  open: false,
  loading: false,
  currentPath: "/home",
  folders: [],
  breadcrumbs: ["/home"],
});

// fieldKey identifies which input field the folder browser is attached to
type FolderBrowserKey = string; // e.g. "search_filePath", "search_sourceFilePath", "search_outputPath", etc.

export interface GenerationServiceTransferMeta {
  service: string;
  from: string;
  source: string;
  gtfsEnabled?: boolean;
}

export interface GenerationCreationMeta {
  runId?: string;
  generationId?: string;
  services?: string[];
  outputPath?: string;
  devServerName?: string;
  sourcePath?: string;
  serviceTransfers?: GenerationServiceTransferMeta[];
}

interface Props {
  open: boolean;
  onClose: (meta?: GenerationCreationMeta) => void;
  preSelectContribution?: boolean;
  servers?: ServerType[];
  loadingServers?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyServiceForm = (service: GenerationService): ServiceFormState => ({
  service,
  targetServerId: "",
  targetFilePath: "",
  inputMode: "path",
  filePath: "",
  inputFile: "",
  outputPathEditable: false,
  outputPath: "",
  sourceServerId: "",
  sourceFilePath: "",
  importFile: null,
  script: service === "routing" ? "routingTiles.py" : "multithread.py",
  scriptDisplayPath: "",
  levelL1: "",
  levelL2: "",
  includeContributions: false,
  contributionApiEndpoint: "",
  contributionGtfsIncluded: false,
  contributionGtfsServerId: "",
  contributionGtfsFilePath: "",
  routingGtfsIncluded: false,
  routingGtfsFilePath: "",
  searchMode: "full",
  contribPythonScriptPath: "",
  contribITCSearchDBPath: "",
  contribMode: "STAGING",
  contribApi:  "https://sandbox.vmmaps.com/admaps",
  isnotify: true,
  backup: true,
  backupPath: "",
  configVersion: "",
  hasConfiguredPaths: false,
  importServerFilePath: "",
  osmRunOrder: "sub_regions",
  hasCustomInputPath: false,
  hasCustomOutputPath: false,
  responseInputPath: "",
  responseOutputPath: "",
});

const resolveFilename = (f: ServiceFormState): string => {
  if (f.inputMode === "path")   return f.filePath   || "<filename>";
  if (f.inputMode === "copy")   return f.sourceFilePath.trim().split(/[/\\]/).pop() || f.inputFile || f.filePath.trim() || "<filename>";
  if (f.inputMode === "import") return f.importFile?.name || "<filename>";
  return "<filename>";
};

const resolveCommandInputPath = (f: ServiceFormState): string => {
  if (f.inputMode === "copy") return f.filePath.trim() || f.sourceFilePath.trim() || "<input_file>";
  if (f.inputMode === "import") return f.importServerFilePath.trim() || f.importFile?.name || "<input_file>";
  return f.filePath.trim() || "<input_file>";
};

const resolveRoutingInputName = (f: ServiceFormState, inputFilePath: string): string => {
  const sourceFileName = f.inputMode === "copy"
    ? (f.inputFile || f.sourceFilePath.trim().split(/[/\\]/).pop() || "")
    : "";
  const inputNamePath = sourceFileName || inputFilePath;
  return inputNamePath.split(/[/\\]/).pop()?.replace(/(\.[^.]+)+$/, "") || inputNamePath;
};

const normalizePath = (p: string) => (p || "").replace(/\\/g, "/");
const dirname = (p: string) => {
  const n = normalizePath(p || "");
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(0, i + 1) : "";
};

const buildBrowserPath = (basePath: string, item: string) => {
  if (!item) return basePath;
  if (item.startsWith("/")) return item;
  const trimmedBase = basePath.replace(/\/+$/, "");
  return `${trimmedBase}/${item}`;
};

const getRegionName = (f: ServiceFormState): string => {
  const path = f.hasCustomInputPath && f.filePath ? f.filePath : (f.responseInputPath || "southIndia");
  const base = path.split(/[/\\]/).pop() || "southIndia";
  return base.replace(/(\.osm)?\.pbf$/i, "").replace(/(\.[^.]+)+$/, "") || "southIndia";
};

const buildCommand = (f: ServiceFormState, isPreview = false): string => {
  const regionName = getRegionName(f);
  const script = f.script?.trim() || (f.service === "routing" ? "routingTiles.py" : "multithread.py");
  
  if (f.service === "routing") {
    const gtfsFlag = f.routingGtfsIncluded ? " --bTransit" : "";
    const inputFlag = f.hasCustomInputPath && f.filePath?.trim() ? ` --osm_pbf_path ${f.filePath.trim()}` : "";
    const outputFlag = f.hasCustomOutputPath && f.outputPath?.trim() ? ` --data_dir ${f.outputPath.trim()}` : "";
    // return `python3 ${script} ${regionName}${inputFlag}${outputFlag}${gtfsFlag}`;
    return `python3 routingTiles.py southIndia`;
  }
  
  const inputFlag = f.hasCustomInputPath && f.filePath?.trim() ? ` --osmdir ${f.filePath.trim()}` : "";
  const outputFlag = f.hasCustomOutputPath && f.outputPath?.trim() ? ` --gendir ${f.outputPath.trim()}` : "";
  
  const genType = f.service === "search" ? "search" : "tiles";
  const genFlag = isPreview ? "" : ` --gen ${genType}`;
  
  return `python3 ${script}${inputFlag}${outputFlag}${genFlag}`;
};

const shouldUseOutputPath = (service: GenerationService, f: ServiceFormState) =>
  service === "routing" && f.routingGtfsIncluded;

const flattenServerPaths = (serverPaths: Record<string, ServerPathEntry[]> | ServerPathEntry[] | undefined): ServerPathEntry[] => {
  if (!serverPaths) return [];
  if (Array.isArray(serverPaths)) return serverPaths;
  return Object.values(serverPaths).flat();
};

const postMultipartWithProgress = (
  url: string,
  body: FormData,
  onProgress?: (percent: number) => void,
): Promise<any> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = 0;
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, Math.round((event.loaded * 100) / event.total)));
    };

    xhr.onload = () => {
      const raw = xhr.responseText || "";
      const data = raw ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      })() : null;

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(data);
        return;
      }

      reject(new Error(typeof data === "string" ? data : data?.message || `Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network error while uploading file."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(body);
  });

// ─── Folder Browser Modal Component ───────────────────────────────────────────

interface FolderBrowserModalProps {
  open: boolean;
  serverName: string;
  currentPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

function FolderBrowserModal({ open, serverName, currentPath: initialPath, onSelect, onClose }: FolderBrowserModalProps) {
  const [loading, setLoading]       = useState(false);
  const [folders, setFolders]       = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState(initialPath || "/home");
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [pathInput, setPathInput]   = useState(initialPath || "/home");
  const [searchQuery, setSearchQuery] = useState("");

  const buildBreadcrumbs = (path: string): string[] => {
    const parts = path.split("/").filter(Boolean);
    const crumbs: string[] = ["/"];
    let acc = "";
    for (const p of parts) {
      acc += `/${p}`;
      crumbs.push(acc);
    }
    return crumbs;
  };

  const fetchFolders = useCallback(async (path: string) => {
    setLoading(true);
    setFolders([]);
    try {
      const formattedUser = serverName?.toUpperCase() || "ZEUS";
      const res = await fetch(`${N8N_WEBHOOK_URL}/list-folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyServerUser: formattedUser, copyFilePath: path }),
      });
      if (!res.ok) throw new Error("Failed to fetch folders");
      const data = await res.json();
      let list: string[] = [];
      if (data?.filenames && typeof data.filenames === "string") list = data.filenames.split(",").map((s: string) => s.trim()).filter(Boolean);
      else if (Array.isArray(data?.filenames)) list = data.filenames;
      else if (Array.isArray(data))               list = data;
      else if (Array.isArray(data?.folders)) list = data.folders;
      else if (typeof data?.folders === "string") list = data.folders.split(",").map((s: string) => s.trim()).filter(Boolean);
      else if (Array.isArray(data?.data))    list = data.data;
      else if (typeof data === "string")     list = data.split(",").map((s: string) => s.trim()).filter(Boolean);
      
      list.sort((a, b) => {
        const aIsDir = !a.includes(".") || a.endsWith("/");
        const bIsDir = !b.includes(".") || b.endsWith("/");
        if (aIsDir === bIsDir) return a.localeCompare(b);
        return aIsDir ? -1 : 1;
      });

      setFolders(list);
      setCurrentPath(path);
      setPathInput(path);
      setBreadcrumbs(buildBreadcrumbs(path));
    } catch {
      toast.error("Failed to load folders.");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [serverName]);

  useEffect(() => {
    if (open) {
      fetchFolders(initialPath || "/home");
    }
  }, [open, initialPath]);

  const handleFolderClick = (folder: string) => {
    const folderNorm = normalizePath(folder);
    const nextPath = folderNorm.startsWith("/")
      ? folderNorm
      : `${currentPath.replace(/\/$/, "")}/${folderNorm}`;
    fetchFolders(nextPath);
  };

  const handleBreadcrumbClick = (crumb: string) => {
    fetchFolders(crumb);
  };

  const handleNavigateToPath = () => {
    if (pathInput.trim()) {
      fetchFolders(pathInput.trim());
    }
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  // Filter folders based on search query
  const filteredFolders = searchQuery.trim() 
    ? folders.filter((item) => 
        item.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : folders;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[90%] h-[80vh] max-w-3xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-semibold text-foreground">Browse Server Files</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-muted/5 overflow-x-auto flex-nowrap scrollbar-hide flex-shrink-0">
          <button 
            type="button" 
            onClick={() => handleBreadcrumbClick("/home")}
            className="p-1.5 hover:bg-muted rounded transition-colors shrink-0"
            title="Go to /home"
          >
            <Home className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-muted-foreground/40 shrink-0">/</span>
          {breadcrumbs.map((crumb, i) => {
            const label = crumb === "/" ? "root" : crumb.split("/").filter(Boolean).pop() || crumb;
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb} className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => !isLast && handleBreadcrumbClick(crumb)}
                  className={`text-xs font-mono px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                    isLast
                      ? "text-primary font-bold bg-primary/10 cursor-default"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  }`}
                >
                  {label}
                </button>
                {!isLast && <span className="text-muted-foreground/40 shrink-0">/</span>}
              </span>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="px-5 py-3 border-b border-border bg-muted/5 flex-shrink-0">
          <input
            type="text"
            placeholder="Search files or folders by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
          />
          {searchQuery && (
            <div className="mt-2 text-xs text-muted-foreground">
              Found {filteredFolders.length} result{filteredFolders.length !== 1 ? 's' : ''} matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Folder/File List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : filteredFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 h-full">
              {searchQuery ? (
                <>
                  <FolderOpen className="w-12 h-12 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No files or folders match your search</p>
                  <p className="text-xs text-muted-foreground/60">Try a different search term or clear the search</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-2 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    Clear Search
                  </button>
                </>
              ) : (
                <>
                  <FolderOpen className="w-12 h-12 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No files or folders found</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {filteredFolders.map((item) => {
                const itemNorm = normalizePath(item);
                const isDir = !itemNorm.includes(".") || itemNorm.endsWith("/");
                const name = itemNorm.startsWith("/")
                  ? itemNorm.split("/").filter(Boolean).pop() || itemNorm
                  : itemNorm;
                
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => isDir ? handleFolderClick(item) : onSelect(buildBrowserPath(currentPath, item))}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-primary/10 transition-colors text-left rounded-lg group"
                  >
                    {isDir ? (
                      <>
                        <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                        <span className="flex-1 font-medium truncate">{name}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="flex-1 font-mono text-muted-foreground truncate">{name}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <span className="text-sm font-mono text-muted-foreground truncate flex-1">
            Selected: <span className="text-primary font-semibold">{currentPath}</span>
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelectCurrent}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Select Path
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PathInputWithBrowser ─────────────────────────────────────────────────────

interface PathInputWithBrowserProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  serverName: string;
  showBrowser: boolean;
  disabled?: boolean;
  onToggleBrowser: () => void;
  onCloseBrowser: () => void;
  onViewFiles?: () => void;
  showViewFiles?: boolean;
  viewFilesLoading?: boolean;
  className?: string;
}

function PathInputWithBrowser({
  value,
  onChange,
  placeholder,
  serverName,
  showBrowser,
  onToggleBrowser,
  onCloseBrowser,
  onViewFiles,
  showViewFiles = false,
  viewFilesLoading = false,
  disabled,
  className = "",
}: PathInputWithBrowserProps) {
  return (
    <>
      <div className={`relative ${className}`}>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder={placeholder || "/home"}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || !serverName}
            onClick={onToggleBrowser}
            title={!serverName ? "Select a server first" : "Browse folders"}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-all shrink-0 ${
              showBrowser
                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                : "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20 hover:text-amber-700 hover:border-amber-500/30"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Browse</span>
          </button>
          {showViewFiles && onViewFiles && (
            <button
              type="button"
              disabled={disabled || !serverName || viewFilesLoading}
              onClick={onViewFiles}
              title={!serverName ? "Select a server first" : "View files in this directory"}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-all shrink-0 ${
                viewFilesLoading
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-700 hover:border-blue-500/30"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {viewFilesLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">View Files</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Modal Folder Browser */}
      <FolderBrowserModal
        open={showBrowser}
        serverName={serverName}
        currentPath={value || "/home"}
        onSelect={(path) => {
          onChange(path);
          onCloseBrowser();
        }}
        onClose={onCloseBrowser}
      />
    </>
  );
}

function ConfigSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background/70 p-4 shadow-sm">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateGeneration({ open, onClose, preSelectContribution, servers: externalServers, loadingServers: externalLoading }: Props) {
  const [servers, setServers]               = useState<ServerType[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [selected, setSelected]             = useState<Set<GenerationService>>(new Set());
  const [downloadStatuses, setDownloadStatuses] = useState<any[]>([]);
  const [forms, setForms]                   = useState<Record<GenerationService, ServiceFormState>>({
    search:  emptyServiceForm("search"),
    routing: emptyServiceForm("routing"),
    tile:    emptyServiceForm("tile"),
  });
  const [submitting, setSubmitting]         = useState(false);
  const [importUploading, setImportUploading] = useState<Record<GenerationService, boolean>>({
    search: false,
    routing: false,
    tile: false,
  });
  const [importUploadProgress, setImportUploadProgress] = useState<Record<GenerationService, number>>({
    search: 0,
    routing: 0,
    tile: 0,
  });
  const [filesState, setFilesState]         = useState<Record<GenerationService, { list: string[]; loading: boolean; show: boolean; fetchedOnce?: boolean }>>({
    search:  { list: [], loading: false, show: false, fetchedOnce: false },
    routing: { list: [], loading: false, show: false, fetchedOnce: false },
    tile:    { list: [], loading: false, show: false, fetchedOnce: false },
  });
  const [approvedPOICount, setApprovedPOICount] = useState(0);
  const [poiCountLoading, setPoiCountLoading]   = useState(false);
  const [approvedPOIIds, setApprovedPOIIds]     = useState<string[]>([]);
  const [activeService, setActiveService]       = useState<GenerationService>("search");
  const [confirmOpen, setConfirmOpen]           = useState(false);

  // Track which folder browser is open: "svc_fieldKey" e.g. "search_filePath"
  const [openBrowser, setOpenBrowser] = useState<string | null>(null);

  const prevTargetServers = useRef({ search: "", routing: "", tile: "" });
  const prevInputModes    = useRef({ search: "path", routing: "path", tile: "path" });
  const prevSourceServers = useRef({ search: "", routing: "", tile: "" });
  const prevSourceInputModes = useRef({ search: "path", routing: "path", tile: "path" });
  const currentConfigVersionRef = useRef<string>("");

  const toggleBrowser = (key: string) => {
    setOpenBrowser((prev) => (prev === key ? null : key));
  };
  const closeBrowser = () => setOpenBrowser(null);

  // Use external servers if provided, otherwise fetch
  useEffect(() => {
    if (externalServers) {
      setServers(externalServers);
      setLoadingServers(externalLoading ?? false);
    }
  }, [externalServers, externalLoading]);

  const fetchServers = useCallback(async () => {
    if (externalServers) return;
    setLoadingServers(true);
    try {
      const res = await api.get("/admin-dashboard/servers");
      const list: ServerType[] = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      setServers(list);
    } catch {
      toast.error("Failed to load servers.");
    } finally {
      setLoadingServers(false);
    }
  }, [externalServers]);

  const findServerById = useCallback((id?: string) => {
    if (!id) return undefined;
    return servers.find((s) => s.id === id || s._id === id) || PRESET_SERVERS.find((p) => p.id === id);
  }, [servers]);

  const serverIdMatches = useCallback((path: ServerPathEntry, serverId: string) => {
    const server = findServerById(serverId);
    const ids = new Set([serverId, server?.id, server?._id].filter(Boolean));
    return ids.has(path.targetServerId || "") || ids.has(path.serverId || "");
  }, [findServerById]);

  const getServerName = (svc: GenerationService, field: "target" | "source" = "target"): string => {
    const f = forms[svc];
    const id = field === "target" ? f.targetServerId : f.sourceServerId;
    const server = findServerById(id) as any;
    return (server?.name || "").toString().toLowerCase();
  };

  const resolveConfigVersion = useCallback(() => {
    if (currentConfigVersionRef.current) return currentConfigVersionRef.current;
    const version = resolveSelectedPipelineVersion(new URLSearchParams(window.location.search), "v1.0") || "v1.0";
    currentConfigVersionRef.current = storeSelectedPipelineVersion(version) || version;
    return version;
  }, []);

  const getGenerationPrefillParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search || "");
    const genService = params.get("genService") as GenerationService | null;
    const genServices = String(params.get("genServices") || "")
      .split(",")
      .map((service) => service.trim())
      .filter((service): service is GenerationService => service === "search" || service === "routing" || service === "tile");
    const services = genServices.length > 0
      ? genServices
      : genService && (genService === "search" || genService === "routing" || genService === "tile")
        ? [genService]
        : [];
    return {
      genService: services[0] ?? null,
      genServices: services,
      targetServerId: params.get("targetServerId") || "",
      targetServerName: params.get("targetServerName") || "",
    };
  }, []);

  const resolvePrefillServerId = useCallback((targetServerId: string, targetServerName: string) => {
    if (targetServerId) return targetServerId;
    if (!targetServerName) return "";

    const match = (externalServers || servers).find(
      (server: any) => String(server.name || "").toLowerCase() === String(targetServerName).toLowerCase(),
    );
    return match ? String(match._id || match.id || "") : "";
  }, [externalServers, servers]);

  const applyGenerationPrefillForService = useCallback((svc: GenerationService) => {
    const { genServices, targetServerId, targetServerName } = getGenerationPrefillParams();
    if (!genServices.includes(svc)) return;

    const resolvedServerId = resolvePrefillServerId(targetServerId, targetServerName);
    if (!resolvedServerId) return;

    setForms((prev) => {
      if (prev[svc].targetServerId) return prev;
      return {
        ...prev,
        [svc]: {
          ...prev[svc],
          targetServerId: resolvedServerId,
        },
      };
    });
  }, [getGenerationPrefillParams, resolvePrefillServerId]);

  const fetchServerPathForServer = useCallback(async (serverId: string) => {
    const version = resolveConfigVersion();
    const res = await api.get("/admin-dashboard/pipeline-config/server-path");
    const serverPaths = res.data?.data?.serverPaths || res.data?.serverPaths || {};
    const paths = flattenServerPaths(serverPaths);
    const pathInfo = paths.find((path) => serverIdMatches(path, serverId));
    return { version, pathInfo };
  }, [resolveConfigVersion, serverIdMatches]);

  const fetchDownloadPathForServer = useCallback(async (serverId: string, version: string) => {
    try {
      const res = await api.post("/admin-dashboard/pipeline-config/download-path-config", { version });
      const downloadPaths = res.data?.data?.downloadPaths || res.data?.downloadPaths || {};
      const entry = flattenServerPaths(downloadPaths).find((path) => serverIdMatches(path, serverId));
      return entry ? { outputPath: entry.outputPath || null, folder: entry.folder || null } : null;
    } catch {
      return null;
    }
  }, [serverIdMatches]);

  const handleViewFiles = async (svc: GenerationService) => {
    const f    = forms[svc];
    const mode = f.inputMode;
    const copyServerId = mode === "copy"
      ? f.sourceServerId || f.targetServerId
      : f.targetServerId || f.sourceServerId;
    const server = findServerById(copyServerId);
    const hasSourcePath  = !!f.sourceFilePath?.trim();
    const copyServerUser = (mode === "copy" && hasSourcePath)
      ? ((server as any)?.name || "")
      : ((server as any)?.user || (server as any)?.name || "");

    const cleanDirFromPath = (p: string) => {
      const n = normalizePath((p || "").trim());
      if (!n) return "";
      if (n.endsWith("/")) return n;
      const i    = n.lastIndexOf("/");
      if (i < 0) return n.includes(".") ? "" : `${n}/`;
      const last = n.slice(i + 1);
      if (last.includes(".")) return n.slice(0, i + 1);
      return `${n}/`;
    };

    const isReapply = !!filesState[svc]?.show || !!filesState[svc]?.fetchedOnce;
    let copyFilePath = "";
    if (mode === "copy") {
      const src = f.sourceFilePath?.trim() || "";
      const alt = f.filePath?.trim()       || "";
      if (!isReapply) {
        copyFilePath = src || alt || "/home";
      } else {
        const srcDir = cleanDirFromPath(src);
        const altDir = cleanDirFromPath(alt);
        copyFilePath = srcDir || altDir || "/home";
        updateForm(svc, { sourceFilePath: copyFilePath, inputFile: "" });
      }
    } else if (mode === "path") {
      const p = f.filePath?.trim() || "";
      if (!isReapply) {
        copyFilePath = p || "/home";
      } else {
        const dir = cleanDirFromPath(p);
        copyFilePath = dir || p || "/home";
        updateForm(svc, { filePath: copyFilePath });
      }
    }

    setFilesState((prev) => ({ ...prev, [svc]: { ...(prev[svc] || { list: [], loading: false, show: false }), loading: true, show: true } }));
    try {
      const res = await fetch(`${N8N_WEBHOOK_URL}/list-files`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ copyServerUser, copyFilePath }),
      });
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      let list: string[] = [];
      if (Array.isArray(data))              list = data;
      else if (Array.isArray(data?.files))  list = data.files;
      else if (typeof data?.files === "string") list = data.files.split(",").map((s: string) => s.trim()).filter(Boolean);
      else if (Array.isArray(data?.filenames)) list = data.filenames;
      else if (typeof data?.filenames === "string") list = data.filenames.split(",").map((s: string) => s.trim()).filter(Boolean);
      else if (Array.isArray(data?.data))   list = data.data;
      else if (typeof data === "string")    list = data.split(",").map((s: string) => s.trim()).filter(Boolean);
      setFilesState((prev) => ({ ...prev, [svc]: { list, loading: false, show: true, fetchedOnce: true } }));
      if (list.length === 0) toast.error("No files returned from server.");
    } catch {
      setFilesState((prev) => ({ ...prev, [svc]: { ...(prev[svc] || { list: [], loading: false, show: true }), loading: false, list: [], fetchedOnce: false } }));
      toast.error("Failed to load files list.");
    }
  };

  const fetchApprovedPOI = useCallback(async () => {
    setPoiCountLoading(true);
    try {
      const [countRes, listRes] = await Promise.all([
        api.get("/admin-dashboard/contributors/approved-not-live/count"),
        api.get("/admin-dashboard/contributors/approved-not-live", { params: { limit: 1000 } }),
      ]);
      setApprovedPOICount(countRes.data?.data?.count ?? 0);
      const items = listRes.data?.data || [];
      setApprovedPOIIds(items.map((c: any) => c._id || c.id));
    } catch {
      setApprovedPOICount(0);
      setApprovedPOIIds([]);
    } finally {
      setPoiCountLoading(false);
    }
  }, []);

  const fetchDownloadStatuses = useCallback(async () => {
    try {
      const version = resolveConfigVersion();
      if (!version) return;
      const res = await api.get("/admin-dashboard/download-status", { params: { version } });
      const statuses = res.data?.data?.statuses ?? res.data?.statuses ?? [];
      setDownloadStatuses(statuses);
    } catch (error) {
      console.error("Failed to load download statuses:", error);
    }
  }, [resolveConfigVersion]);

  const getDownloadServerName = (svc: GenerationService) => {
    const workflowKey = svc === "routing" ? "routing" : "searchTiles";
    const status = downloadStatuses.find((s) => s.workflow === workflowKey && s.status === "completed");
    return status?.targetServer?.name || null;
  };

  useEffect(() => {
    if (open) {
      currentConfigVersionRef.current = "";
      fetchServers();
      fetchApprovedPOI();
      fetchDownloadStatuses();
      setSelected(preSelectContribution ? new Set<GenerationService>(["search"]) : new Set());
      setForms({
        search:  emptyServiceForm("search"),
        routing: emptyServiceForm("routing"),
        tile:    emptyServiceForm("tile"),
      });
      setActiveService("search");
      setConfirmOpen(false);
      setOpenBrowser(null);
      if (preSelectContribution) {
        setForms((prev) => ({ ...prev, search: { ...prev.search, searchMode: "contribution" } }));
      }
    }
  }, [open, fetchServers, fetchApprovedPOI, preSelectContribution]);

  useEffect(() => {
    const orderedSelected = SERVICES.filter(({ key }) => selected.has(key));
    if (orderedSelected.length === 0) {
      setActiveService("search");
      return;
    }

    if (!orderedSelected.some(({ key }) => key === activeService)) {
      setActiveService(orderedSelected[0].key);
    }
  }, [activeService, selected]);

  useEffect(() => {
    if (!open || loadingServers || selected.size === 0) return;

    const { genServices, targetServerId, targetServerName } = getGenerationPrefillParams();
    if (!genServices.length || targetServerId || !targetServerName) return;

    genServices.forEach((service) => {
      if (selected.has(service)) applyGenerationPrefillForService(service);
    });
  }, [open, loadingServers, selected, getGenerationPrefillParams, applyGenerationPrefillForService]);

  // Fetch server paths when targetServerId changes
  useEffect(() => {
    const fetchPaths = async (svc: GenerationService) => {
      const serverId = forms[svc].targetServerId;
      if (!serverId) {
        updateForm(svc, {
          filePath: "",
          scriptDisplayPath: "",
          outputPath: "",
          backupPath: "",
          sourceFilePath: "",
          importServerFilePath: "",
          hasConfiguredPaths: false,
          hasCustomInputPath: false,
          hasCustomOutputPath: false,
          responseInputPath: "",
          responseOutputPath: "",
        });
        return;
      }

      try {
        const { version, pathInfo } = await fetchServerPathForServer(serverId);
        const downloadInfo = await fetchDownloadPathForServer(serverId, version);
        const isRouting = svc === "routing";
        const autoFilePath = isRouting ? (downloadInfo?.outputPath || null) : (downloadInfo?.folder || null);
        if (pathInfo) {
          updateForm(svc, {
            filePath: "",
            scriptDisplayPath: pathInfo.scriptPath || "/home",
            outputPath: "",
            backupPath: pathInfo.backupPath || "/home",
            importServerFilePath: "",
            responseInputPath: autoFilePath || pathInfo.inputPath || "/home",
            responseOutputPath: pathInfo.outputPath || "/home",
            configVersion: version || forms[svc].configVersion,
            hasConfiguredPaths: true,
            hasCustomInputPath: false,
            hasCustomOutputPath: false,
          });
        } else {
          updateForm(svc, {
            filePath: "",
            scriptDisplayPath: "/home",
            outputPath: "",
            backupPath: "/home",
            sourceFilePath: forms[svc].inputMode === "copy" ? forms[svc].sourceFilePath : "/home",
            importServerFilePath: "",
            responseInputPath: autoFilePath || "/home",
            responseOutputPath: "/home",
            configVersion: version || forms[svc].configVersion,
            hasConfiguredPaths: false,
            hasCustomInputPath: false,
            hasCustomOutputPath: false,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch paths for server ${serverId}:`, error);
        // On error, also default to /home
        updateForm(svc, {
          filePath: "",
          scriptDisplayPath: "/home",
          outputPath: "",
          backupPath: "/home",
          sourceFilePath: forms[svc].inputMode === "copy" ? forms[svc].sourceFilePath : "/home",
          importServerFilePath: "",
          responseInputPath: "/home",
          responseOutputPath: "/home",
          configVersion: forms[svc].configVersion,
          hasConfiguredPaths: false,
          hasCustomInputPath: false,
          hasCustomOutputPath: false,
        });
      }
    };

    const checkService = (svc: GenerationService) => {
      const currentId = forms[svc].targetServerId;
      const currentMode = forms[svc].inputMode;
      const changed = currentId !== prevTargetServers.current[svc] || currentMode !== prevInputModes.current[svc];
      
      if (changed) {
        prevTargetServers.current[svc] = currentId;
        prevInputModes.current[svc] = currentMode;
        if (currentId) {
          fetchPaths(svc);
        } else {
          updateForm(svc, {
            filePath: "",
            scriptDisplayPath: "",
            outputPath: "",
            backupPath: "",
            sourceFilePath: "",
            importServerFilePath: "",
            importFile: null,
            hasConfiguredPaths: false,
          });
        }
      }
    };

    checkService("search");
    checkService("routing");
    checkService("tile");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    forms.search.targetServerId, forms.routing.targetServerId, forms.tile.targetServerId,
    forms.search.inputMode, forms.routing.inputMode, forms.tile.inputMode,
  ]);

  // Fetch source server paths when sourceServerId changes (for copy mode)
  useEffect(() => {
    const fetchSourcePaths = async (svc: GenerationService) => {
      const serverId = forms[svc].sourceServerId;
      if (!serverId || forms[svc].inputMode !== "copy") {
        if (!serverId) {
          updateForm(svc, { sourceFilePath: "" });
        }
        return;
      }

      try {
        const { version, pathInfo } = await fetchServerPathForServer(serverId);
        if (pathInfo) {
          updateForm(svc, {
            sourceFilePath: pathInfo.inputPath || "/home",
            configVersion: version || forms[svc].configVersion,
          });
        } else {
          updateForm(svc, {
            sourceFilePath: "/home",
            configVersion: version || forms[svc].configVersion,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch source paths for server ${serverId}:`, error);
        updateForm(svc, { sourceFilePath: "/home" });
      }
    };

    const checkSourceService = (svc: GenerationService) => {
      const currentId = forms[svc].sourceServerId;
      const currentMode = forms[svc].inputMode;
      const changed = currentId !== prevSourceServers.current[svc] || currentMode !== prevSourceInputModes.current[svc];
      
      if (changed) {
        prevSourceServers.current[svc] = currentId;
        prevSourceInputModes.current[svc] = currentMode;
        if (currentId && currentMode === "copy") {
          fetchSourcePaths(svc);
        } else if (!currentId) {
          updateForm(svc, { sourceFilePath: "" });
        }
      }
    };

    checkSourceService("search");
    checkSourceService("routing");
    checkSourceService("tile");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    forms.search.sourceServerId, forms.routing.sourceServerId, forms.tile.sourceServerId,
    forms.search.inputMode, forms.routing.inputMode, forms.tile.inputMode,
  ]);

  const toggleService = (svc: GenerationService) => {
    const shouldApplyPrefill = !selected.has(svc);
    setActiveService(svc);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(svc)) {
        next.delete(svc);
      } else {
        next.add(svc);
      }
      return next;
    });
    if (shouldApplyPrefill) applyGenerationPrefillForService(svc);
  };

  const updateForm = (svc: GenerationService, patch: Partial<ServiceFormState>) => {
    setForms((prev) => ({ ...prev, [svc]: { ...prev[svc], ...patch } }));
  };

  // Check if file was selected from View Files dropdown
  const isFileSelectedFromViewFiles = (svc: GenerationService): boolean => {
    const f = forms[svc];
    const fileList = filesState[svc]?.list || [];
    const fetchedOnce = filesState[svc]?.fetchedOnce || false;
    
    if (f.inputMode === "import") {
      return !!f.importFile; // Import files don't use View Files
    }
    
    if (f.inputMode === "copy") {
      return !!f.sourceFilePath?.trim() && !!f.inputFile?.trim();
    }
    
    // For "path" mode: file must be selected from View Files
    if (!fetchedOnce || fileList.length === 0) {
      return false; // Files haven't been fetched yet
    }
    
    if (!f.filePath?.trim()) {
      return false; // No file path selected
    }
    
    // Check if current filePath matches something in the fileList
    const currentPath = normalizePath(f.filePath.trim());
    const currentBase = currentPath.split("/").pop() || currentPath;
    const normalizedList = fileList.map(normalizePath);
    
    return (
      normalizedList.includes(currentPath) ||
      normalizedList.includes(currentBase) ||
      normalizedList.some((x) => x.endsWith(currentBase))
    );
  };

  const handleImportUpload = async (svc: GenerationService) => {
    const f = forms[svc];
    const target = findServerById(f.targetServerId) as any;
    const targetServerName = (target?.name || f.targetServerId || "").toString();
    const importPath = f.importServerFilePath.trim();

    if (!f.targetServerId) {
      toast.error(`${svc}: Select a target server.`);
      return;
    }
    if (!importPath) {
      toast.error(`${svc}: Enter the import destination path.`);
      return;
    }
    if (!f.importFile) {
      toast.error(`${svc}: Select a file to upload.`);
      return;
    }

    const body = new FormData();
    body.append("file", f.importFile, f.importFile.name);
    body.append("filePath", importPath);
    body.append("targetServer", targetServerName);

    setImportUploading((prev) => ({ ...prev, [svc]: true }));
    setImportUploadProgress((prev) => ({ ...prev, [svc]: 0 }));
    try {
      const data = await postMultipartWithProgress(
        `${N8N_WEBHOOK_URL}/import-to`,
        body,
        (percent) => setImportUploadProgress((prev) => ({ ...prev, [svc]: percent })),
      );
      const uploadedFullPath = data?.fullPath || data?.data?.fullPath;
      if (typeof uploadedFullPath === "string" && uploadedFullPath.trim()) {
        updateForm(svc, { filePath: uploadedFullPath.trim() });
      }

      toast.success(`${svc}: File uploaded successfully.`);
    } catch (error) {
      console.error(`Failed to upload import file for ${svc}:`, error);
      toast.error(`${svc}: Failed to upload file.`);
    } finally {
      setImportUploading((prev) => ({ ...prev, [svc]: false }));
    }
  };

  const updateGlobalToggles = (patch: Partial<ServiceFormState>) => {
    setForms((prev) => {
      const next = { ...prev };
      (Object.keys(next) as GenerationService[]).forEach((svc) => {
        next[svc] = { ...next[svc], ...patch };
      });
      return next;
    });
  };

  const selectedServices = SERVICES.filter(({ key }) => selected.has(key));
  const currentService = selectedServices.find(({ key }) => key === activeService) || selectedServices[0] || null;
  const currentServiceKey = currentService?.key || null;
  const currentForm = currentServiceKey ? forms[currentServiceKey] : null;
  const currentTargetServerName = currentServiceKey ? getServerName(currentServiceKey, "target") : "";
  const currentSourceServerName = currentServiceKey ? getServerName(currentServiceKey, "source") : "";
  const serviceReviewCards = selectedServices.map((service) => {
    const form = forms[service.key];
    return {
      ...service,
      form,
      targetServerName: getServerName(service.key, "target"),
      sourceServerName: getServerName(service.key, "source"),
      inputPath:
        form.inputMode === "import"
          ? form.importServerFilePath || "Pending upload"
          : form.filePath || form.sourceFilePath || "Not selected",
      outputPath: form.outputPath || "Default / not required",
      command: buildCommand(form, true),
    };
  });

  const validate = (): string | null => {
    if (selected.size === 0) return "Select at least one service.";
    for (const svc of selected) {
      const f = forms[svc];
      if (!f.targetServerId) return `${svc}: Select a target server.`;

      if (svc === "search" && f.searchMode === "contribution") {
        if (!f.contribITCSearchDBPath.trim())  return "search: Enter the ITC Search Database Path.";
        if (!f.contribApi.trim())              return "search: Enter the API endpoint.";
        if (!f.contribPythonScriptPath.trim()) return "search: Enter the Python script path.";
        if (approvedPOICount === 0)            return "search: No approved contributions available to update.";
        continue;
      }

      if (!f.script.trim()) return `${svc}: Enter a script`;
      
      if (f.hasCustomOutputPath && !f.outputPath.trim()) {
        return `${svc}: Enter an output path.`;
      }
      if (f.hasCustomInputPath && !f.filePath.trim()) {
        return `${svc}: Enter an input path.`;
      }
      if (svc === "search" && f.includeContributions) {
        if (!f.contributionApiEndpoint.trim()) return "search: Enter an API endpoint for contribution data.";
        if (f.contributionGtfsIncluded) {
          if (!f.contributionGtfsServerId) return "search: Select a GTFS server.";
        }
      }
    }
    return null;
  };

  const submitBlockingReason = validate();

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    setConfirmOpen(false);
    setSubmitting(true);
    onClose();
    toast.success("Generation started successfully.");

    const findServer = (id: string | undefined) => {
      if (!id) return undefined;
      return servers.find((s) => s.id === id) || PRESET_SERVERS.find((p) => p.id === id);
    };

    const pickPort    = (s: any) => s?.port || "22";
    const pickAddress = (s: any) => s?.ipAddress || s?.host || s?.name || "";

    const searchForm = forms.search;

    try {
      if (selected.has("search") && searchForm.searchMode === "contribution") {
        const targetServer = findServer(searchForm.targetServerId) as any;
        const payload = {
          type: "contribution",
          services: ["search"],
          runId: `run_${Math.random().toString(36).slice(2, 8)}`,
          isnotify: searchForm.isnotify ? "true" : "false",
          backup: searchForm.backup,
          version: searchForm.configVersion || "undefined",
          targetServer: targetServer?.name || searchForm.targetServerId,
          targetServerAddress: pickAddress(targetServer),
          targetServerPort: pickPort(targetServer),
          pythonScriptPath: searchForm.contribPythonScriptPath.trim(),
          ITCSearchDatabasePath: searchForm.contribITCSearchDBPath.trim(),
          mode: searchForm.contribMode.trim(),
          api: searchForm.contribApi.trim(),
          contributionIds: approvedPOIIds,
        };
        const res = await fetch(`${N8N_WEBHOOK_URL}/data-pipeline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData?.message || "Failed to start contribution generation.");
        }
        return;
      }

      const runId  = `run_${Math.random().toString(36).slice(2, 8)}`;
      const firstSvc = Array.from(selected)[0] || "search";
      const payload: Record<string, any> = {
        type: "generation",
        services: Array.from(selected),
        runId,
        isnotify: forms[firstSvc].isnotify ? "true" : "false",
        backup: forms[firstSvc].backup,
        version: forms[firstSvc].configVersion || "undefined",
      };

      let devServerName = "";
      let sourcePath    = "";
      const serviceTransfers: GenerationServiceTransferMeta[] = [];

      for (const svc of Array.from(selected)) {
        const f      = forms[svc];
        const target = findServer(f.targetServerId) as any;
        const source = findServer(f.sourceServerId) as any;
        const targetServerName = target?.name || f.targetServerId;
        const serviceOutputPath = f.hasCustomOutputPath ? (f.outputPath?.trim() || "") : "";

        if (!devServerName && targetServerName) devServerName = targetServerName;
        if (serviceOutputPath && !sourcePath) sourcePath = serviceOutputPath;
        if (serviceOutputPath) {
          serviceTransfers.push({
            service: svc,
            from: targetServerName,
            source: serviceOutputPath,
            gtfsEnabled: svc === "routing" ? !!f.routingGtfsIncluded : undefined,
          });
        }

        const inputFileName = (() => {
          if (f.inputFile) return f.inputFile;
          if (f.inputMode === "copy") {
            const src = f.sourceFilePath?.trim();
            if (src) return src.split(/[/\\]/).pop() || src;
          }
          if (f.inputMode === "path") {
            const path = f.filePath?.trim();
            if (path) return path.split(/[/\\]/).pop() || path;
          }
          if (f.inputMode === "import" && f.importFile?.name) return f.importFile.name;
          return "<inputFile>";
        })();

        const base = {
          targetServerId: f.targetServerId,
          targetServer: target?.name || f.targetServerId,
          targetServerAddress: pickAddress(target),
          targetServerPort: pickPort(target),
          inputMode: f.inputMode,
          copyServerUser: (source?.user || source?.name || "").toString().toLowerCase(),
          serverPort: pickPort(source),
          copySourceServer: pickAddress(source),
          copySourcePath: f.sourceFilePath,
          fileInputPath: f.hasCustomInputPath ? f.filePath.trim() : undefined,
          inputFile: f.hasCustomInputPath ? inputFileName : undefined,
          outputPath: f.hasCustomOutputPath ? (serviceOutputPath || undefined) : undefined,
          scriptPath: f.scriptDisplayPath,
          backupPath: f.backup ? (f.backupPath?.trim() || undefined) : undefined,
          scriptFile: f.script,
          command: buildCommand(f),
          levelL1: f.levelL1.trim(),
          levelL2: f.levelL2.trim(),
        };

        console.log(`Prepared payload for ${svc}:`, base);

        if (svc === "routing" && selected.has("routing")) {
          payload.routing = { 
            ...base, 
            gtfsEnabled: !!f.routingGtfsIncluded 
          };
        }
        if (svc === "search") {
          payload.search = {
            ...base,
            includeContributions: f.includeContributions,
            contributionApiEndpoint: f.contributionApiEndpoint,
            contributionGtfsIncluded: f.contributionGtfsIncluded,
            contributionGtfsServer: f.contributionGtfsServerId,
            contributionGtfsFilePath: f.contributionGtfsFilePath,
            osmRunOrder: f.osmRunOrder,
          };
        }
        if (svc === "tile") {
          payload.tile = {
            ...base,
            osmRunOrder: f.osmRunOrder,
          };
        }
      }

      const res = await fetch(`${N8N_WEBHOOK_URL}/data-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData?.message || "Failed to start generation.");
        return;
      }

      const data = await res.json();
      const generationId = data?._id ?? data?.id ?? data?.generationId ?? data?.data?._id ?? data?.data?.id;

      onClose({
        runId,
        generationId,
        services: Array.from(selected),
        outputPath: sourcePath,
        devServerName,
        sourcePath,
        serviceTransfers,
      });
    } catch (e: any) {
      console.error("Generation error:", e);
      toast.error(e?.message || "Failed to start generation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-[90%] h-full flex flex-col animate-slide-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-xl z-10">
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Data Generation Pipeline</h2>
          </div>
          <button
            onClick={() => onClose()}
            title="Close generation modal"
            aria-label="Close generation modal"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 flex-1 overflow-y-auto bg-muted/20">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,360px)]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 1</p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Select Services</h3>
              <p className="mt-1 text-sm text-muted-foreground">Choose the services you want in this generation run. You can configure one service at a time after selection.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {SERVICES.map(({ key, label, color, desc }) => {
                  const active = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleService(key)}
                      className={`relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? `${color} border-current shadow-sm`
                          : "bg-card border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30"
                      }`}
                    >
                      {active ? (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-current/20">
                          <span className="h-2.5 w-2.5 rounded-full bg-current" />
                        </span>
                      ) : null}
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/80">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="mt-1 text-[11px] opacity-75">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Run Settings</p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Common Options</h3>
              <p className="mt-1 text-sm text-muted-foreground">These switches apply globally and do not change how the payload is constructed.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Notify</p>
                    <p className="text-[11px] text-muted-foreground">Send notification after the run finishes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateGlobalToggles({ isnotify: !forms.search.isnotify })}
                    title="Toggle notifications"
                    aria-label="Toggle notifications"
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${forms.search.isnotify ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${forms.search.isnotify ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Backup</p>
                    <p className="text-[11px] text-muted-foreground">Store generated data backup when available.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateGlobalToggles({ backup: !forms.search.backup })}
                    title="Toggle backup"
                    aria-label="Toggle backup"
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${forms.search.backup ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${forms.search.backup ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                  {selected.size === 0 ? "Select a service to begin configuration." : `${selected.size} service${selected.size > 1 ? "s" : ""} selected.`}
                </div>
              </div>
            </div>
          </div>

          {selected.size > 0 && currentService && (
            <div>
              <div className="mb-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 2</p>
                <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Configure Services</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Focus on one service workspace at a time to keep the form lighter and easier to review.</p>
                  </div>
                  <div className="rounded-full border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Active service: <span className="font-semibold text-foreground">{currentService.label}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                <div className="min-w-0">
                <div className="flex gap-4 overflow-x-auto">
                {[currentService].filter(Boolean).map(({ key, label, color }) => {
                  const f        = forms[key];
                  const fileList = filesState[key]?.list || [];
                  const targetServerName = getServerName(key, "target");
                  const sourceServerName = getServerName(key, "source");
                  // Show "no config" banner when server is selected but has no configured paths
                  const showNoConfigBanner = !!f.targetServerId && !f.hasConfiguredPaths;

                  const selectedPathValue = (() => {
                    const full  = f.filePath?.trim() || "";
                    const nFull = normalizePath(full);
                    const base  = nFull.split("/").pop() || nFull;
                    if (!fileList.length) return "";
                    const normList = fileList.map(normalizePath);
                    if (normList.includes(nFull)) return full;
                    if (normList.includes(base)) return base;
                    const ends = normList.find((x) => x.endsWith(base));
                    if (ends) return ends.includes("/") ? ends : base;
                    return "";
                  })();

                  const selectedSourceValue = (() => {
                    const full  = f.sourceFilePath?.trim() || "";
                    const nFull = normalizePath(full);
                    const base  = nFull.split("/").pop() || nFull;
                    if (!fileList.length) return "";
                    const normList = fileList.map(normalizePath);
                    if (normList.includes(nFull)) return full;
                    if (normList.includes(base)) return base;
                    const ends = normList.find((x) => x.endsWith(base));
                    if (ends) return ends.includes("/") ? ends : base;
                    return "";
                  })();

                  return (
                    <div key={key} className="border rounded-xl overflow-hidden flex-1 min-w-[320px]">
                      {/* Service card header */}
                      <div className={`flex items-center gap-2 px-4 py-3 border-b border-border ${color}`}>
                        <Server className="w-4 h-4" />
                        <span className="text-sm font-semibold">{label} Service</span>
                      </div>

                      <div className="px-4 py-4 space-y-4 bg-card">
                        <TooltipProvider>

                          {/* No-config banner */}
                          {showNoConfigBanner && (
                            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <p className="text-[11px] leading-relaxed">
                                No configured paths found for this server. All paths default to <code className="font-mono bg-amber-500/10 px-1 rounded">/home</code>. Use the <strong>Browse</strong> button to navigate and select folders.
                              </p>
                            </div>
                          )}

                          {/* Search mode selector */}
                          {/* {key === "search" && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <label className="block text-xs font-medium text-foreground">Generation Type</label>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                    Select the type of generation: Full Search DB for a complete build or Contribution Update for incremental updates.
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="flex rounded-lg border border-border overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => updateForm(key, { searchMode: "full" })}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                                    f.searchMode === "full"
                                      ? "bg-blue-600 text-white"
                                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                                  }`}
                                >
                                  <Database className="w-3.5 h-3.5" />
                                  Full Search DB Generation
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateForm(key, { searchMode: "contribution" })}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                                    f.searchMode === "contribution"
                                      ? "bg-orange-600 text-white"
                                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                                  }`}
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  Contribution Update
                                </button>
                              </div>
                            </div>
                          )} */}

                          {/* Contribution Update Config */}
                          {key === "search" && f.searchMode === "contribution" ? (
                            <>
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <label className="block text-xs font-medium text-foreground">
                                    Target Server <span className="text-red-500">*</span>
                                    {(() => {
                                      const downloadServer = getDownloadServerName(key);
                                      if (!downloadServer) return null;
                                      return (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono">
                                          Downloaded on: {downloadServer}
                                        </span>
                                      );
                                    })()}
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                      Select the server where the generation process will be executed.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {loadingServers ? (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Loading servers...
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <select
                                      value={f.targetServerId}
                                      onChange={(e) => updateForm(key, { targetServerId: e.target.value })}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                    >
                                      <option value="">Select a server…</option>
                                      {PRESET_SERVERS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                      {servers.filter((s) => s.environment !== "production").map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name.toLowerCase()} — ({s.environment})
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                )}
                              </div>

                              <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                                !poiCountLoading && approvedPOICount === 0
                                  ? "border-muted bg-muted/30"
                                  : "border-orange-500/20 bg-orange-500/5"
                              }`}>
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  !poiCountLoading && approvedPOICount === 0 ? "bg-muted" : "bg-orange-500/10"
                                }`}>
                                  <MapPin className={`w-4 h-4 ${
                                    !poiCountLoading && approvedPOICount === 0 ? "text-muted-foreground" : "text-orange-500"
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-foreground">Approved POI Contributions</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {poiCountLoading ? "Checking contributions…"
                                      : approvedPOICount > 0 ? "Approved but not yet live on server"
                                      : "No contribution data to approve"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {poiCountLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                  ) : (
                                    <span className={`text-lg font-bold ${approvedPOICount === 0 ? "text-muted-foreground" : "text-orange-600"}`}>
                                      {approvedPOICount}
                                    </span>
                                  )}
                                  <button type="button" onClick={fetchApprovedPOI} className="p-1 hover:bg-muted rounded-md transition-colors">
                                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                                  </button>
                                </div>
                              </div>

                              <div className={`space-y-3 border border-border rounded-xl p-4 bg-muted/30 ${!poiCountLoading && approvedPOICount === 0 ? "opacity-50 pointer-events-none" : ""}`}>
                                <p className="text-xs font-semibold text-foreground mb-2">Contribution Configuration</p>

                                {/* Python Script Path */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">
                                      Python Script Path <span className="text-red-500">*</span>
                                    </label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        The full directory path on the target server containing the generation scripts.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <PathInputWithBrowser
                                    value={f.contribPythonScriptPath}
                                    onChange={(val) => updateForm(key, { contribPythonScriptPath: val })}
                                    serverName={targetServerName}
                                    showBrowser={openBrowser === `${key}_contribPythonScriptPath`}
                                    onToggleBrowser={() => toggleBrowser(`${key}_contribPythonScriptPath`)}
                                    onCloseBrowser={closeBrowser}
                                    showViewFiles={true}
                                    viewFilesLoading={filesState[key]?.loading || false}
                                    onViewFiles={() => handleViewFiles(key)}
                                  />
                                </div>

                                {/* ITC Search DB Path */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">
                                      ITC Search Database Path <span className="text-red-500">*</span>
                                    </label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        The absolute path to the existing ITC Search SQLite database file on the server.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <PathInputWithBrowser
                                    value={f.contribITCSearchDBPath}
                                    onChange={(val) => updateForm(key, { contribITCSearchDBPath: val })}
                                    serverName={targetServerName}
                                    showBrowser={openBrowser === `${key}_contribITCSearchDBPath`}
                                    onToggleBrowser={() => toggleBrowser(`${key}_contribITCSearchDBPath`)}
                                    onCloseBrowser={closeBrowser}
                                    showViewFiles={true}
                                    viewFilesLoading={filesState[key]?.loading || false}
                                    onViewFiles={() => handleViewFiles(key)}
                                  />
                                </div>

                                {/* Mode */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">
                                      Mode <span className="text-red-500">*</span>
                                    </label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        Environment mode for the generation process (STAGING or PRODUCTION).
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="relative">
                                    <select
                                      value={f.contribMode}
                                      onChange={(e) => updateForm(key, { contribMode: e.target.value })}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                    >
                                      <option value="STAGING">STAGING</option>
                                      <option value="PRODUCTION">PRODUCTION</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>

                                {/* API Endpoint */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">
                                      API Endpoint <span className="text-red-500">*</span>
                                    </label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        The API URL used to fetch contribution data for the update.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <input
                                    type="text"
                                    value={f.contribApi}
                                    onChange={(e) => updateForm(key, { contribApi: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Full Generation Config */}

                              {/* Target Server */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <label className="block text-xs font-medium text-foreground">
                                    Target Server <span className="text-red-500">*</span>
                                    {(() => {
                                      const downloadServer = getDownloadServerName(key);
                                      if (!downloadServer) return null;
                                      return (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono">
                                          Downloaded on: {downloadServer}
                                        </span>
                                      );
                                    })()}
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                      Select the server where the generation process will be executed.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {loadingServers ? (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Loading servers...
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <select
                                      value={f.targetServerId}
                                      onChange={(e) => updateForm(key, { targetServerId: e.target.value, hasConfiguredPaths: false })}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                    >
                                      <option value="">Select a server…</option>
                                      {PRESET_SERVERS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name.toLowerCase()}</option>
                                      ))}
                                      {servers.filter((s) => s.environment !== "production").map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name.toLowerCase()} — ({s.environment})
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                )}
                              </div>

                              {/* OSM Run Priority (tiles and search only) */}
                              {(key === "search" || key === "tile") && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">OSM Run Priority</label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        Choose whether to process sub regions or large OSM regions first.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="flex rounded-lg border border-border overflow-hidden bg-background">
                                    <button
                                      type="button"
                                      onClick={() => updateForm(key, { osmRunOrder: "sub_regions" })}
                                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                                        f.osmRunOrder === "sub_regions"
                                          ? "bg-primary text-primary-foreground font-semibold"
                                          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                                      }`}
                                    >
                                      Sub Regions First
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateForm(key, { osmRunOrder: "large_regions" })}
                                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                                        f.osmRunOrder === "large_regions"
                                          ? "bg-primary text-primary-foreground font-semibold"
                                          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                                      }`}
                                    >
                                      Large Regions First
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Optional Input Path Selector */}
                              <div>
                                {f.hasCustomInputPath ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1.5">
                                        <label className="block text-xs font-medium text-foreground">Input Path</label>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                            The directory or file path on the target server containing the input data.
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => updateForm(key, { hasCustomInputPath: false, filePath: "" })}
                                        className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <PathInputWithBrowser
                                      value={f.filePath || ""}
                                      onChange={(val) => updateForm(key, { filePath: val })}
                                      placeholder="/home/data"
                                      serverName={targetServerName}
                                      showBrowser={openBrowser === `${key}_filePath`}
                                      onToggleBrowser={() => toggleBrowser(`${key}_filePath`)}
                                      onCloseBrowser={closeBrowser}
                                      showViewFiles={true}
                                      viewFilesLoading={filesState[key]?.loading || false}
                                      onViewFiles={() => handleViewFiles(key)}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!f.targetServerId}
                                    onClick={() => updateForm(key, { hasCustomInputPath: true, filePath: f.responseInputPath || "/home" })}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                                    + Add Input Path
                                  </button>
                                )}
                              </div>

                              {/* Optional Output Path Selector */}
                              <div>
                                {f.hasCustomOutputPath ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1.5">
                                        <label className="block text-xs font-medium text-foreground">Output Path</label>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                            The directory on the target server where output files will be stored.
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => updateForm(key, { hasCustomOutputPath: false, outputPath: "" })}
                                        className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <PathInputWithBrowser
                                      value={f.outputPath || ""}
                                      onChange={(val) => updateForm(key, { outputPath: val })}
                                      placeholder="/home/output"
                                      serverName={targetServerName}
                                      showBrowser={openBrowser === `${key}_outputPath`}
                                      onToggleBrowser={() => toggleBrowser(`${key}_outputPath`)}
                                      onCloseBrowser={closeBrowser}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!f.targetServerId}
                                    onClick={() => updateForm(key, { hasCustomOutputPath: true, outputPath: f.responseOutputPath || "/home" })}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                                    + Add Output Path
                                  </button>
                                )}
                              </div>

                              {/* Script Path */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <label className="block text-xs font-medium text-foreground">
                                    Script Path <span className="text-red-500">*</span>
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                      The directory path on the target server where the generation tool or script is located.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <PathInputWithBrowser
                                  value={f.scriptDisplayPath || ""}
                                  onChange={(val) => updateForm(key, { scriptDisplayPath: val })}
                                  placeholder="/home/mkandula/Projects/TileGen/tilemaker"
                                  serverName={targetServerName}
                                  showBrowser={openBrowser === `${key}_scriptDisplayPath`}
                                  onToggleBrowser={() => toggleBrowser(`${key}_scriptDisplayPath`)}
                                  onCloseBrowser={closeBrowser}
                                />

                                <div className="flex items-center gap-1.5 mb-1 mt-4">
                                  <label className="block text-xs font-medium text-foreground">Script File <span className="text-red-500">*</span></label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                      The name of the Python script to be executed.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <input
                                  type="text"
                                  placeholder="tilesPipe.py"
                                  value={f.script}
                                  onChange={(e) => updateForm(key, { script: e.target.value })}
                                  className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                />
                              </div>

                              {/* Output Path (shown when routing + GTFS) */}
                              {/* {shouldUseOutputPath(key, f) && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">
                                      Output Path <span className="text-red-500">*</span>
                                    </label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        The directory where generated output will be saved.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <PathInputWithBrowser
                                    value={f.outputPath}
                                    onChange={(val) => updateForm(key, { outputPath: val })}
                                    placeholder="/home/mkandula/Projects/TileGen/Gen"
                                    serverName={targetServerName}
                                    showBrowser={openBrowser === `${key}_outputPath`}
                                    onToggleBrowser={() => toggleBrowser(`${key}_outputPath`)}
                                    onCloseBrowser={closeBrowser}
                                    showViewFiles={false}
                                    viewFilesLoading={filesState[key]?.loading || false}
                                    onViewFiles={() => handleViewFiles(key)}
                                  />
                                </div>
                              )} */}

                              {/* Level range */}
                              {/* {((key === "search" && !f.contributionGtfsIncluded) || (key === "routing" && !f.routingGtfsIncluded) || key === "tile") && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <label className="block text-xs font-medium text-foreground">Language Code</label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                        The zoom level range (L1 to L2) for tile generation.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="l1"
                                      value={f.levelL1}
                                      onChange={(e) => updateForm(key, { levelL1: e.target.value })}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                    />
                                    <span className="text-muted-foreground text-sm font-mono">:</span>
                                    <input
                                      type="text"
                                      placeholder="l2"
                                      value={f.levelL2}
                                      onChange={(e) => updateForm(key, { levelL2: e.target.value })}
                                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                    />
                                  </div>
                                </div>
                              )} */}

                              {/* Contribution Data toggle — search only */}
                              {/* {key === "search" && (
                                <div className={`space-y-3 border border-border rounded-xl p-4 bg-muted/30 ${!poiCountLoading && approvedPOICount === 0 ? "opacity-60" : ""}`}>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <p className="text-xs font-semibold text-foreground">Include Contribution Data</p>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                            Toggle to include approved POI contributions in the search generation.
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">
                                        {poiCountLoading ? "Checking contributions…"
                                          : approvedPOICount > 0 ? `${approvedPOICount} contribution${approvedPOICount !== 1 ? "s" : ""} to update`
                                          : "No contribution data to approve"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={poiCountLoading || approvedPOICount === 0}
                                      onClick={() => updateForm(key, { includeContributions: !f.includeContributions })}
                                      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                                        poiCountLoading || approvedPOICount === 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                      } ${f.includeContributions && approvedPOICount > 0 ? "bg-primary" : "bg-muted-foreground/30"}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${f.includeContributions ? "translate-x-4" : "translate-x-0"}`} />
                                    </button>
                                  </div>

                                  {f.includeContributions && (
                                    <div className="space-y-3 pt-1">
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <label className="block text-xs font-medium text-foreground">
                                            API Endpoint <span className="text-red-500">*</span>
                                          </label>
                                        </div>
                                        <input
                                          type="text"
                                          placeholder="https://contributions.example.com/api/v1/data"
                                          value={f.contributionApiEndpoint}
                                          onChange={(e) => updateForm(key, { contributionApiEndpoint: e.target.value })}
                                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                        />
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="text-xs font-medium text-foreground">Routing GTFS Included</p>
                                          <p className="text-[11px] text-muted-foreground">Contribution package includes GTFS routing data.</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => updateForm(key, { contributionGtfsIncluded: !f.contributionGtfsIncluded })}
                                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${f.contributionGtfsIncluded ? "bg-primary" : "bg-muted-foreground/30"}`}
                                        >
                                          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${f.contributionGtfsIncluded ? "translate-x-4" : "translate-x-0"}`} />
                                        </button>
                                      </div>
                                      {f.contributionGtfsIncluded && (
                                        <div className="space-y-2 pl-3 border-l-2 border-primary/30">
                                          <div>
                                            <div className="flex items-center gap-1.5 mb-1">
                                              <label className="block text-xs font-medium text-foreground">
                                                GTFS Server <span className="text-red-500">*</span>
                                              </label>
                                            </div>
                                            {loadingServers ? (
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Loading servers...
                                              </div>
                                            ) : (
                                              <div className="relative">
                                                <select
                                                  value={f.contributionGtfsServerId}
                                                  onChange={(e) => updateForm(key, { contributionGtfsServerId: e.target.value })}
                                                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                                                >
                                                  <option value="">Select a server…</option>
                                                  {servers.filter((s) => s.environment !== "production").map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name.toLowerCase()} — ({s.environment})</option>
                                                  ))}
                                                </select>
                                                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                              </div>
                                            )}
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-1.5 mb-1">
                                              <label className="block text-xs font-medium text-foreground">
                                                GTFS File Path <span className="text-red-500">*</span>
                                              </label>
                                            </div>
                                            <PathInputWithBrowser
                                              value={f.contributionGtfsFilePath}
                                              onChange={(val) => updateForm(key, { contributionGtfsFilePath: val })}
                                              placeholder="/home/data/gtfs.zip"
                                              serverName={targetServerName}
                                              showBrowser={openBrowser === `${key}_contributionGtfsFilePath`}
                                              onToggleBrowser={() => toggleBrowser(`${key}_contributionGtfsFilePath`)}
                                              onCloseBrowser={closeBrowser}
                                              showViewFiles={true}
                                              viewFilesLoading={filesState[key]?.loading || false}
                                              onViewFiles={() => handleViewFiles(key)}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )} */}

                              {/* Routing GTFS */}
                              {key === "routing" && (
                                <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/30">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <p className="text-xs font-semibold text-foreground">GTFS</p>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                            Provide a GTFS file to include in routing graph generation.
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">Provide a GTFS file to include in routing graph generation.</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => updateForm(key, { routingGtfsIncluded: !f.routingGtfsIncluded })}
                                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${f.routingGtfsIncluded ? "bg-primary" : "bg-muted-foreground/30"}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${f.routingGtfsIncluded ? "translate-x-4" : "translate-x-0"}`} />
                                    </button>
                                  </div>
                                  {/* GTFS option toggle only */}
                                </div>
                              )}

                              {/* Generated command preview */}
                              {/* <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                                  <label className="text-xs font-medium text-foreground">Generated Command</label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                                      The command that will be executed on the target server.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <pre className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground font-mono whitespace-pre-wrap break-all leading-relaxed">
                                  {buildCommand(f, true)}
                                </pre>
                              </div> */}
                            </>
                          )}
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                })}
              </div>
                </div>

                <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Service Navigator</p>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">Selected Services</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Use these buttons to switch the workspace. Each card shows the current server and input mode.</p>

                  <div className="mt-4 space-y-3">
                    {selectedServices.map(({ key, label, color }) => {
                      const active = currentService.key === key;
                      const serviceForm = forms[key];
                      const serviceTarget = getServerName(key, "target");
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveService(key)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                            active
                              ? `${color} border-current shadow-sm ring-2 ring-current/10`
                              : "border-border bg-background hover:border-muted-foreground/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-background/80" : "bg-muted"}`}>
                                <Server className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{label}</p>
                                <p className="text-[11px] text-muted-foreground">{serviceTarget || "Target server pending"}</p>
                              </div>
                            </div>
                            {active ? (
                              <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">Active</span>
                            ) : null}
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Input mode</span>
                            <span className="font-medium uppercase text-foreground">{serviceForm.inputMode}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>
              </div>

              {currentForm && (
                <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review</p>
                      <h4 className="text-sm font-semibold text-foreground">Generated Command</h4>
                    </div>
                  </div>
                  <pre className="w-full rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-foreground font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {buildCommand(currentForm, true)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 px-6 py-4 border-t border-border bg-card rounded-b-xl flex-shrink-0 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {selected.size === 0
                ? "No services selected"
                : `${selected.size} service${selected.size > 1 ? "s" : ""} selected`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {submitBlockingReason || "The request payload and generation flow remain unchanged. This refactor only simplifies the UI."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || Boolean(submitBlockingReason)}
              title={submitBlockingReason || "Review generation before starting"}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
              ) : (
                <><Play className="w-4 h-4" /> Start Generation</>
              )}
            </button>
          </div>
        </div>

        {confirmOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
            <div className="w-full max-w-6xl rounded-3xl border border-border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Confirmation</p>
                  <h3 className="mt-1 text-lg font-semibold text-foreground">Review Generation Setup</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Confirm the service configuration below before the generation request is sent.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  title="Close confirmation"
                  aria-label="Close confirmation"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <div className="space-y-4">
                  {serviceReviewCards.map(({ key, label, color, targetServerName, sourceServerName, inputPath, outputPath, command, form }) => (
                    <div
                      key={key}
                      className={`w-full rounded-3xl border p-5 shadow-sm bg-card ${color}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4" />
                          <h4 className="text-sm font-semibold">{label}</h4>
                        </div>
                        <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground">
                          Included
                        </span>
                      </div>

                      <div className="mt-4 space-y-3 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Target server</span>
                          <span className="max-w-[60%] break-all text-right font-medium text-foreground">{targetServerName || "Not selected"}</span>
                        </div>

                        {/* <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Output path</span>
                          <span className="max-w-[60%] break-all text-right font-mono text-foreground">{outputPath}</span>
                        </div> */}
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Notify</span>
                          <span className="max-w-[60%] text-right font-medium text-foreground">{forms.search.isnotify ? "Enabled" : "Disabled"}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Backup</span>
                          <span className="max-w-[60%] text-right font-medium text-foreground">{forms.search.backup ? "Enabled" : "Disabled"}</span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-border bg-background/70 p-3">
                        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                          <Terminal className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Command</span>
                        </div>
                        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">{command}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">{submitBlockingReason || "All selected services are ready. Confirm to start generation."}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || Boolean(submitBlockingReason)}
                    title={submitBlockingReason || "Confirm and start generation"}
                    className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                    ) : (
                      <><Play className="w-4 h-4" /> Confirm Generation</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
