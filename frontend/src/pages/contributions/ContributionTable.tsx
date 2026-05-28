import { useState, useMemo, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { toast } from "sonner";
import { MoreHorizontal, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { api } from "@/utils/api";

export interface ApiContribution {
  id: string;
  user_id: string;
  action: string;
  category: string;
  basicInfo?: { name?: string; description?: string };
  cardData?: { title?: string; locationText?: string };
  address?: { street?: string; area?: string; city?: string; state?: string; country?: string; pincode?: string };
  location?: { lat: number; lng: number };
  status: string | number;
  created_at: number;
  updated_at?: number;
  ownerInfo?: { name?: string; phone?: string };
  contact?: { phone?: string; email?: string };
  extra?: Record<string, unknown>;
  app_name?: string;
  mapunit?: string;
  approved_by?: string;
  contributionProgress?: { contributePercentage?: number };
  contributionName?: string;
  reviewedName?: string;
  commentsCount?: number;
  attachmentsCount?: number;
  images?: string[];
  media?: { images?: string[]; logo?: string | null; coverPhoto?: string | null };
  osm_id?: string;
  priority?: string;
  name?: string;
  isCreatedBy?: string;
  approvedByname?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function ContributionTableSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {["w-10", "w-20", "w-40", "w-24", "w-20", "w-32", "w-20", "w-20", "w-24", "w-10"].map((w, i) => (
              <TableHead key={i}><Skeleton className={`h-4 ${w}`} /></TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-20 mt-1" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-12" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16 mt-1" /></TableCell>
              <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-6 w-6 rounded" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ContributionTable({ contributions, onSelect, onStatusChange, highlightId, loading }: {
  contributions: ApiContribution[];
  onSelect: (c: ApiContribution) => void;
  onStatusChange?: (id: string, status: "approved" | "rejected") => void;
  highlightId?: string | null;
  loading?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<"created_at" | "category" | "action" | "status" | "priority">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, "approve" | "reject" | null>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [categoryFieldCount, setCategoryFieldCount] = useState<Record<string, number>>({});

  useEffect(() => {
    api.get("/admin-dashboard/contributors/categories")
      .then(res => {
        const cats: { category: string; fields: unknown[] }[] = res.data?.data || [];
        const map: Record<string, number> = {};
        cats.forEach(c => { map[c.category] = c.fields?.length || 0; });
        setCategoryFieldCount(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => setPage(1), [contributions]);

  const sorted = useMemo(() => {
    const copy = [...contributions];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "created_at") cmp = (a.created_at || 0) - (b.created_at || 0);
      else cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [contributions, sortField, sortDir]);

  if (loading) return <ContributionTableSkeleton />;

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(c => c.id)));
  };

  const bulkAction = (action: string) => {
    toast.success(`${selected.size} contributions ${action}`);
    setSelected(new Set());
  };

  const handleReview = async (e: React.MouseEvent, id: string, approved: boolean) => {
    e.stopPropagation();
    const type = approved ? "approve" : "reject";
    setActionLoading(prev => ({ ...prev, [id]: type }));
    try {
      await api.post("/admin-dashboard/contributors/approve", { id, approved });
      const newStatus = approved ? "approved" : "rejected";
      toast.success(`Contribution ${newStatus}`);
      onStatusChange?.(id, newStatus);
    } catch {
      toast.error(`Failed to ${type} contribution`);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const statusMap: Record<string, "pending" | "approved" | "rejected" | "modified"> = {
    0: "pending", pending: "pending",
    1: "approved", approved: "approved",
    2: "rejected", rejected: "rejected",
    3: "modified", modified: "modified",
  };

  const formatDate = (ts: number) => {
    if (!ts) return "—";
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString();
  };

  const SortHeader = ({ field, children }: { field: typeof sortField; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2">
          <span className="text-sm text-foreground font-medium">{selected.size} selected</span>
          <button className="h-7 text-xs px-2 rounded border border-border hover:bg-muted transition-colors" onClick={() => bulkAction("approved")}>Approve All</button>
          <button className="h-7 text-xs px-2 rounded border border-border text-destructive hover:bg-muted transition-colors" onClick={() => bulkAction("rejected")}>Reject All</button>
          <button className="h-7 text-xs px-2 rounded hover:bg-muted transition-colors" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input type="checkbox" className="rounded border-border" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleAll} />
              </TableHead>
              <TableHead className="text-xs">POI Name</TableHead>
              <TableHead className="text-xs"><SortHeader field="category">Category</SortHeader></TableHead>
              <TableHead className="text-xs">OSM Tags</TableHead>
              <TableHead className="text-xs">Contributor</TableHead>
              {/* <TableHead className="text-xs"><SortHeader field="action">Type</SortHeader></TableHead> */}
              <TableHead className="text-xs"><SortHeader field="priority">Priority</SortHeader></TableHead>
              <TableHead className="text-xs"><SortHeader field="status">Status</SortHeader></TableHead>
              {/* <TableHead className="text-xs">Trust</TableHead> */}
              <TableHead className="text-xs"><SortHeader field="created_at">Date</SortHeader></TableHead>
              <TableHead className="text-xs w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((c) => (
              <TableRow key={c.id} className={`cursor-pointer ${c.id === highlightId ? "animate-row-approved" : ""}`} onClick={() => onSelect(c)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="rounded border-border" checked={selected.has(c.id)} onChange={() => {}} onClick={(e) => toggleSelect(c.id, e)} />
                </TableCell>
                <TableCell>
                  <p className="text-sm text-foreground truncate max-w-[160px]">{c.basicInfo?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{c.address?.city || "—"}</p>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-info/15 text-info border-info/30">
                    {c.category || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {categoryFieldCount[c.category] ? `${categoryFieldCount[c.category]} tags` : "—"}
                </TableCell>
                <TableCell>
                  <p className="text-sm text-foreground">{c.name || "—"}</p>  
                  <p className="text-xs text-muted-foreground">{c.isCreatedBy || "—"}</p>
                </TableCell>
                {/* <TableCell className="text-xs text-foreground capitalize">{c.action || "—"}</TableCell> */}
                <TableCell>
                  {c.priority ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      c.priority.toLowerCase() === 'high' ? 'bg-red-500/20 text-red-500 border-red-500/40' :
                      c.priority.toLowerCase() === 'medium' ? 'bg-orange-500/20 text-orange-500 border-orange-500/40' :
                      'bg-green-500/20 text-green-500 border-green-500/40'
                    }`}>
                      {c.priority}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell><StatusBadge status={statusMap[String(c.status)] || "pending"} /></TableCell>
                {/* <TableCell className="text-xs text-muted-foreground">—</TableCell> */}
                <TableCell className="text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()} className="relative">
                  <button
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {openMenuId === c.id && (
                    <div className="absolute right-0 top-8 z-50 min-w-[140px] bg-popover border border-border rounded-lg shadow-lg py-1">
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={(e) => { e.stopPropagation(); onSelect(c); setOpenMenuId(null); }}
                      >View Details</button>
                      {(c.status === "pending" || c.status === 0) && (
                        <>
                          <button
                            disabled={!!actionLoading[c.id]}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                            onClick={(e) => { handleReview(e, c.id, true); setOpenMenuId(null); }}
                          >{actionLoading[c.id] === "approve" ? "Approving..." : "Approve"}</button>
                          <button
                            disabled={!!actionLoading[c.id]}
                            className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-muted transition-colors disabled:opacity-50"
                            onClick={(e) => { handleReview(e, c.id, false); setOpenMenuId(null); }}
                          >{actionLoading[c.id] === "reject" ? "Rejecting..." : "Reject"}</button>
                        </>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-7 w-16 text-xs rounded border border-border bg-card text-foreground px-1 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>{sorted.length} total</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="h-7 w-7 p-0 flex items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30 transition-colors" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground px-2">{safePage} / {totalPages}</span>
          <button className="h-7 w-7 p-0 flex items-center justify-center rounded border border-border hover:bg-muted disabled:opacity-30 transition-colors" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
