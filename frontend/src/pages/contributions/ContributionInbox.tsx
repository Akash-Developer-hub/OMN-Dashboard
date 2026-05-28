import { useState, useMemo, useEffect } from "react";
import { Search, Download, Edit, Map, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContributionFilters } from "./ContributionFilters";
import { ContributionTable, ApiContribution } from "./ContributionTable";
import { ContributionCharts } from "./ContributionCharts";
import { ContributionMapView } from "./ContributionMapView";
import { ContributionDetail } from "./ContributionDetail";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/utils/api";

export default function ContributionInbox() {
  const [allContributions, setAllContributions] = useState<ApiContribution[]>([]);
  const [cards, setCards] = useState({ pending: 0, approved: 0, rejected: 0, modified: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Status");
  const [isCreatedBy, setisCreatedBy] = useState("All Sources");
  const [priority, setPriority] = useState("All Priorities");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedContribution, setSelectedContribution] = useState<ApiContribution | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);

  const normalizeStatus = (s: string | number): string => {
    const map: Record<number, string> = { 0: "pending", 1: "approved", 2: "rejected", 3: "modified" };
    return typeof s === "number" ? (map[s] ?? "pending") : s;
  };

  useEffect(() => {
    api.get("/admin-dashboard/contributors/list")
      .then(res => {
        const data = (res.data?.data || []).map((c: ApiContribution) => ({ ...c, status: normalizeStatus(c.status) }));
        setAllContributions(data);
        const c = res.data?.meta?.cards;
        if (c) setCards({ pending: c.pending, approved: c.approved, rejected: c.rejected, modified: c.modified, total: res.data?.meta?.pagination?.total || 0 });
      })
      .catch(() => setAllContributions([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return allContributions.filter((c) => {
      if (activeTab === "pending" && c.status !== "pending") return false;
      if (activeTab === "approved" && c.status !== "approved") return false;
      if (activeTab === "modified" && c.status !== "modified") return false;
      if (activeTab === "rejected" && c.status !== "rejected") return false;
      if (status !== "All Status" && c.status !== status) return false;
      if (isCreatedBy !== "All Sources" && c.isCreatedBy !== isCreatedBy) return false;
      if (priority !== "All Priorities" && (c.priority || "").toLowerCase() !== priority.toLowerCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.id.toLowerCase().includes(q) ||
          (c.basicInfo?.name || "").toLowerCase().includes(q) ||
          (c.isCreatedBy || "").toLowerCase().includes(q) ||
          (c.osm_id || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, status, isCreatedBy, priority, activeTab, allContributions]);

  const { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, modified: modifyCount, total: totalCount } = cards;

  const handleStatusChange = (id: string, status: "approved" | "rejected") => {
    setAllContributions(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (status === "approved") {
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 2500);
    }
  };

  const handleDelete = (id: string) => {
    setAllContributions(prev => prev.filter(c => c.id !== id));
  };

  const openDetail = (c: ApiContribution) => {
    setSelectedContribution(c);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POI Contributions</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowMap(v => !v)}>
            {showMap ? <X className="w-4 h-4" /> : <Map className="w-4 h-4" />}
            {showMap ? "Close Map" : "View Map"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      {/* Map View */}
      {showMap && <ContributionMapView contributions={allContributions} onSelect={openDetail} onClose={() => setShowMap(false)} />}

      {/* Quick metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : (
          <>
            <MetricCard icon={Clock} label="Pending Review" value={String(pendingCount)} change="Awaiting action" changeType="neutral" />
            <MetricCard icon={CheckCircle} label="Approved" value={String(approvedCount)} change={totalCount ? `${((approvedCount / totalCount) * 100).toFixed(0)}% rate` : "0% rate"} changeType="positive" />
            <MetricCard icon={XCircle} label="Rejected" value={String(rejectedCount)} change="" changeType="negative" />
            <MetricCard icon={Edit} label="Modified" value={String(modifyCount)} change="Needs review" changeType="neutral" />
          </>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ID, POI, contributor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
        <ContributionFilters status={status} setStatus={setStatus} source={isCreatedBy} setSource={setisCreatedBy} priority={priority} setPriority={setPriority} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedCount})</TabsTrigger>
          <TabsTrigger value="modified">Modified ({modifyCount})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="pending"><ContributionTable contributions={filtered} onSelect={openDetail} onStatusChange={handleStatusChange} highlightId={highlightId} loading={loading} /></TabsContent>
        <TabsContent value="approved"><ContributionTable contributions={filtered} onSelect={openDetail} onStatusChange={handleStatusChange} highlightId={highlightId} loading={loading} /></TabsContent>
        <TabsContent value="rejected"><ContributionTable contributions={filtered} onSelect={openDetail} onStatusChange={handleStatusChange} highlightId={highlightId} loading={loading} /></TabsContent>
        <TabsContent value="modified"><ContributionTable contributions={filtered} onSelect={openDetail} onStatusChange={handleStatusChange} highlightId={highlightId} loading={loading} /></TabsContent>
        <TabsContent value="all"><ContributionTable contributions={filtered} onSelect={openDetail} onStatusChange={handleStatusChange} highlightId={highlightId} loading={loading} /></TabsContent>
        <TabsContent value="analytics"><ContributionCharts contributions={[]} /></TabsContent>
      </Tabs>

      <ContributionDetail contribution={selectedContribution} open={detailOpen} onOpenChange={setDetailOpen} onStatusChange={handleStatusChange} onDelete={handleDelete} />
    </div>
  );
}
