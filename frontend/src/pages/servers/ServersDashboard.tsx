import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Server, RefreshCw, Pencil, Trash2, PowerOff, Power, MapPin } from "lucide-react";
import { toast } from "sonner";
import { serversApi, Server as ServerType, ServerEnvironment } from "./serversApi";
import { ServerForm } from "./ServerForm";

const ENV_META: Record<
  ServerEnvironment,
  { label: string; badgeClass: string; sectionClass: string; dotClass: string }
> = {
  development: {
    label: "Development",
    badgeClass: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    sectionClass: "border-blue-500/30",
    dotClass: "bg-blue-500",
  },
  staging: {
    label: "Staging",
    badgeClass: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    sectionClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  production: {
    label: "Production",
    badgeClass: "bg-green-500/10 text-green-500 border border-green-500/20",
    sectionClass: "border-green-500/30",
    dotClass: "bg-green-500",
  },
};

const ENVIRONMENTS: ServerEnvironment[] = ["development", "staging", "production"];

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 animate-slide-in">
        <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              destructive
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  server: ServerType;
  onEdit: (s: ServerType) => void;
  onToggleStatus: (s: ServerType) => void;
  onDelete: (s: ServerType) => void;
}) {
  const meta = ENV_META[server.environment];
  const createdDate = new Date(server.createdAt).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const updatedDate = new Date(server.updatedAt).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + name */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 w-9 h-9 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center">
            <Server className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-sm truncate">{server.name}</span>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                {meta.label}
              </span>
              <span
                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                  server.isActive
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {server.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{server.ipAddress}</p>
            {server.location && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{server.location}</span>
              </div>
            )}
            {server.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{server.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            title="Edit"
            onClick={() => onEdit(server)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            title={server.isActive ? "Deactivate" : "Activate"}
            onClick={() => onToggleStatus(server)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {server.isActive ? (
              <PowerOff className="w-3.5 h-3.5" />
            ) : (
              <Power className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </button>
          <button
            title="Delete"
            onClick={() => onDelete(server)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        <span>Created {createdDate}</span>
        <span>Updated {updatedDate}</span>
      </div>
    </div>
  );
}

export default function ServersDashboard() {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editServer, setEditServer] = useState<ServerType | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "delete" | "toggle";
    server: ServerType;
  } | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await serversApi.getAll();
      const body = res.data as any;
      const list: ServerType[] = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      setServers(list);
    } catch {
      toast.error("Failed to load servers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const filtered = servers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.ipAddress.toLowerCase().includes(q) ||
      (s.location ?? "").toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = ENVIRONMENTS.reduce<Record<ServerEnvironment, ServerType[]>>(
    (acc, env) => {
      acc[env] = filtered.filter((s) => s.environment === env);
      return acc;
    },
    { development: [], staging: [], production: [] }
  );

  const openAdd = () => { setEditServer(null); setFormOpen(true); };
  const openEdit = (s: ServerType) => { setEditServer(s); setFormOpen(true); };

  const handleToggleStatus = async (server: ServerType) => {
    try {
      await serversApi.setStatus(server.id, !server.isActive);
      toast.success(server.isActive ? "Server deactivated." : "Server activated.");
      fetchServers();
    } catch {
      toast.error("Failed to update server status.");
    }
    setConfirm(null);
  };

  const handleDelete = async (server: ServerType) => {
    try {
      await serversApi.delete(server.id);
      toast.success("Server deleted.");
      fetchServers();
    } catch {
      toast.error("Failed to delete server.");
    }
    setConfirm(null);
  };

  const totalActive = servers.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {servers.length} server{servers.length !== 1 ? "s" : ""} &bull; {totalActive} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchServers}
            className="flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading servers...</span>
        </div>
      )}

      {/* Environment sections */}
      {!loading && (
        <div className="space-y-8">
          {ENVIRONMENTS.map((env) => {
            const meta = ENV_META[env];
            const list = grouped[env];

            return (
              <section key={env}>
                {/* Section header */}
                <div className={`flex items-center gap-3 mb-4 pb-3 border-b-2 ${meta.sectionClass}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                  <h2 className="text-base font-semibold text-foreground">{meta.label}</h2>
                  <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {list.length} server{list.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {list.length === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-10 bg-card border border-dashed border-border rounded-xl text-center">
                    <Server className="w-8 h-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No {meta.label.toLowerCase()} servers found.</p>
                    <button
                      onClick={openAdd}
                      className="mt-3 text-xs text-primary hover:underline"
                    >
                      + Add one
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {list.map((s) => (
                      <ServerCard
                        key={s.id}
                        server={s}
                        onEdit={openEdit}
                        onToggleStatus={(server) =>
                          setConfirm({ type: "toggle", server })
                        }
                        onDelete={(server) =>
                          setConfirm({ type: "delete", server })
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Add / Edit form modal */}
      {formOpen && (
        <ServerForm
          server={editServer}
          onClose={() => setFormOpen(false)}
          onSaved={fetchServers}
        />
      )}

      {/* Confirm dialog */}
      {confirm?.type === "delete" && (
        <ConfirmDialog
          title="Delete Server"
          message={`Are you sure you want to permanently delete "${confirm.server.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => handleDelete(confirm.server)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === "toggle" && (
        <ConfirmDialog
          title={confirm.server.isActive ? "Deactivate Server" : "Activate Server"}
          message={
            confirm.server.isActive
              ? `Deactivate "${confirm.server.name}"? It will remain in the system but marked inactive.`
              : `Activate "${confirm.server.name}"?`
          }
          confirmLabel={confirm.server.isActive ? "Deactivate" : "Activate"}
          destructive={confirm.server.isActive}
          onConfirm={() => handleToggleStatus(confirm.server)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
