// import { useEffect, useState } from "react";
// import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
// import { TrendingUp, CheckCircle, Clock, Users, Tag } from "lucide-react";
// import { MetricCard } from "@/components/dashboard/MetricCard";
// import { api } from "@/utils/api";

// const monthlyData = [
//   { month: "Jul", approved: 320, rejected: 45, pending: 28 },
//   { month: "Aug", approved: 410, rejected: 62, pending: 35 },
//   { month: "Sep", approved: 380, rejected: 51, pending: 42 },
//   { month: "Oct", approved: 520, rejected: 73, pending: 31 },
//   { month: "Nov", approved: 470, rejected: 58, pending: 48 },
//   { month: "Dec", approved: 390, rejected: 44, pending: 55 },
//   { month: "Jan", approved: 550, rejected: 67, pending: 38 },
//   { month: "Feb", approved: 610, rejected: 82, pending: 44 },
//   { month: "Mar", approved: 580, rejected: 71, pending: 52 },
// ];

// const categoryBreakdown = [
//   { name: "New POI", value: 42, color: "hsl(174, 72%, 46%)" },
//   { name: "Hours Update", value: 23, color: "hsl(210, 72%, 55%)" },
//   { name: "Name Fix", value: 15, color: "hsl(38, 92%, 50%)" },
//   { name: "Photo Add", value: 12, color: "hsl(280, 60%, 55%)" },
//   { name: "Location Fix", value: 8, color: "hsl(150, 60%, 45%)" },
// ];

// const sourceData = [
//   { source: "Users", contributions: 1420 },
//   { source: "Partners", contributions: 890 },
//   { source: "Internal", contributions: 340 },
//   { source: "Vendors", contributions: 560 },
// ];

// const dailyTrend = [
//   { day: "Mon", count: 78 },
//   { day: "Tue", count: 92 },
//   { day: "Wed", count: 105 },
//   { day: "Thu", count: 88 },
//   { day: "Fri", count: 115 },
//   { day: "Sat", count: 45 },
//   { day: "Sun", count: 32 },
// ];

// const topContributors = [
//   { name: "Alex M.", contributions: 142, accepted: 128, score: 94 },
//   { name: "Maria S.", contributions: 118, accepted: 109, score: 91 },
//   { name: "Partner API", contributions: 890, accepted: 856, score: 96 },
//   { name: "John D.", contributions: 87, accepted: 72, score: 83 },
//   { name: "Sarah K.", contributions: 65, accepted: 61, score: 94 },
// ];

// const regionData = [
//   { region: "North America", contributions: 1240, approval: 89 },
//   { region: "Europe", contributions: 980, approval: 91 },
//   { region: "Asia Pacific", contributions: 670, approval: 85 },
//   { region: "Middle East", contributions: 210, approval: 88 },
//   { region: "Africa", contributions: 110, approval: 82 },
// ];

// const avgReviewTime = [
//   { month: "Jul", hours: 4.2 },
//   { month: "Aug", hours: 3.8 },
//   { month: "Sep", hours: 5.1 },
//   { month: "Oct", hours: 3.5 },
//   { month: "Nov", hours: 4.0 },
//   { month: "Dec", hours: 6.2 },
//   { month: "Jan", hours: 3.1 },
//   { month: "Feb", hours: 2.9 },
//   { month: "Mar", hours: 3.3 },
// ];

// const tooltipStyle = {
//   contentStyle: {
//     backgroundColor: "hsl(220, 18%, 10%)",
//     border: "1px solid hsl(220, 14%, 18%)",
//     borderRadius: "8px",
//     fontSize: "12px",
//     color: "hsl(210, 20%, 92%)",
//   },
//   itemStyle: { color: "hsl(210, 20%, 80%)" },
// };

// export default function ContributionAnalytics() {
//   const [osmTagCount, setOsmTagCount] = useState<number | null>(null);

//   useEffect(() => {
//     api.get("/admin-dashboard/contributors/categories")
//       .then(res => {
//         const categories: { fields: unknown[] }[] = res.data?.data || [];
//         const total = categories.reduce((sum, cat) => sum + (cat.fields?.length || 0), 0);
//         setOsmTagCount(total);
//       })
//       .catch(() => setOsmTagCount(null));
//   }, []);

//   return (
//     <div className="space-y-6 animate-slide-in">
//       <div>
//         <h1 className="text-2xl font-bold text-foreground">Contribution Analytics</h1>
//         <p className="text-sm text-muted-foreground mt-1">Insights into POI contributions, review performance, and contributor activity</p>
//       </div>

//       {/* Metric cards */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
//         <MetricCard icon={TrendingUp} label="Total This Month" value="674" change="+12.3% vs last month" changeType="positive" />
//         <MetricCard icon={CheckCircle} label="Approval Rate" value="89.2%" change="+2.1% vs last month" changeType="positive" />
//         <MetricCard icon={Clock} label="Avg Review Time" value="3.3 hrs" change="-18% faster" changeType="positive" />
//         <MetricCard icon={Users} label="Active Contributors" value="247" change="+34 new this month" changeType="positive" />
//         <MetricCard
//           icon={Tag}
//           label="OSM Tags"
//           value={osmTagCount === null ? "Not Available" : String(osmTagCount)}
//           change={osmTagCount === null ? "" : "Total tags across categories"}
//           changeType="neutral"
//         />
//       </div>

//       {/* Charts row 1 */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//         {/* Monthly trend */}
//         <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">Monthly Contributions</h2>
//           <ResponsiveContainer width="100%" height={280}>
//             <BarChart data={monthlyData} barGap={2}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
//               <XAxis dataKey="month" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <Tooltip {...tooltipStyle} />
//               <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 50%)" }} />
//               <Bar dataKey="approved" fill="hsl(174, 72%, 46%)" radius={[3, 3, 0, 0]} name="Approved" />
//               <Bar dataKey="rejected" fill="hsl(0, 72%, 55%)" radius={[3, 3, 0, 0]} name="Rejected" />
//               <Bar dataKey="pending" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} name="Pending" />
//             </BarChart>
//           </ResponsiveContainer>
//         </div>

//         {/* Category breakdown */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">By Type</h2>
//           <ResponsiveContainer width="100%" height={200}>
//             <PieChart>
//               <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
//                 {categoryBreakdown.map((entry, i) => (
//                   <Cell key={i} fill={entry.color} />
//                 ))}
//               </Pie>
//               <Tooltip {...tooltipStyle} />
//             </PieChart>
//           </ResponsiveContainer>
//           <div className="space-y-2 mt-2">
//             {categoryBreakdown.map((cat) => (
//               <div key={cat.name} className="flex items-center justify-between text-xs">
//                 <div className="flex items-center gap-2">
//                   <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
//                   <span className="text-muted-foreground">{cat.name}</span>
//                 </div>
//                 <span className="font-mono text-foreground">{cat.value}%</span>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       {/* Charts row 2 */}
//       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//         {/* Daily trend */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">Daily Activity (This Week)</h2>
//           <ResponsiveContainer width="100%" height={220}>
//             <AreaChart data={dailyTrend}>
//               <defs>
//                 <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="5%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
//                   <stop offset="95%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
//                 </linearGradient>
//               </defs>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
//               <XAxis dataKey="day" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <Tooltip {...tooltipStyle} />
//               <Area type="monotone" dataKey="count" stroke="hsl(174, 72%, 46%)" fill="url(#areaGrad)" strokeWidth={2} name="Contributions" />
//             </AreaChart>
//           </ResponsiveContainer>
//         </div>

//         {/* Avg review time */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">Avg Review Time (hours)</h2>
//           <ResponsiveContainer width="100%" height={220}>
//             <LineChart data={avgReviewTime}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
//               <XAxis dataKey="month" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <Tooltip {...tooltipStyle} />
//               <Line type="monotone" dataKey="hours" stroke="hsl(280, 60%, 55%)" strokeWidth={2} dot={{ fill: "hsl(280, 60%, 55%)", r: 3 }} name="Hours" />
//             </LineChart>
//           </ResponsiveContainer>
//         </div>
//       </div>

//       {/* Row 3: Source + Region + Top Contributors */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//         {/* By source */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">By Source</h2>
//           <ResponsiveContainer width="100%" height={200}>
//             <BarChart data={sourceData} layout="vertical" barSize={16}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" horizontal={false} />
//               <XAxis type="number" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
//               <YAxis type="category" dataKey="source" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
//               <Tooltip {...tooltipStyle} />
//               <Bar dataKey="contributions" fill="hsl(210, 72%, 55%)" radius={[0, 4, 4, 0]} name="Contributions" />
//             </BarChart>
//           </ResponsiveContainer>
//         </div>

//         {/* Region table */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">By Region</h2>
//           <div className="space-y-3">
//             {regionData.map((r) => (
//               <div key={r.region}>
//                 <div className="flex items-center justify-between text-xs mb-1">
//                   <span className="text-muted-foreground">{r.region}</span>
//                   <span className="font-mono text-foreground">{r.contributions.toLocaleString()}</span>
//                 </div>
//                 <div className="h-1.5 bg-muted rounded-full overflow-hidden">
//                   <div
//                     className="h-full rounded-full bg-primary"
//                     style={{ width: `${(r.contributions / 1240) * 100}%` }}
//                   />
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>

//         {/* Top contributors */}
//         <div className="bg-card border border-border rounded-lg p-5">
//           <h2 className="text-sm font-semibold text-foreground mb-4">Top Contributors</h2>
//           <div className="space-y-3">
//             {topContributors.map((c, i) => (
//               <div key={c.name} className="flex items-center gap-3">
//                 <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
//                 <div className="flex-1 min-w-0">
//                   <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
//                   <p className="text-xs text-muted-foreground">{c.accepted}/{c.contributions} accepted</p>
//                 </div>
//                 <div className="text-right">
//                   <span className={`text-xs font-mono font-semibold ${c.score >= 90 ? "text-success" : "text-warning"}`}>
//                     {c.score}%
//                   </span>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, CheckCircle, Clock, Users, Tag,
  RefreshCw, AlertCircle, Filter, Calendar,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { api } from "@/utils/api";
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface MonthlyTrendItem {
  _id: { year: number; month: number };
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  modified: number;
  avgReviewTimeMs: number;
}
 
interface TopContributor {
  rank: number;
  name: string;
  contributions: number;
  contributorAccounts: number;
}
 
interface MonthWiseReviewTime {
  year: number;
  month: number;
  avgReviewTimeHours: number;
}
 
interface ByTypeItem {
  _id: string;
  count: number;
}
 
interface AnalyticsData {
  summary: {
    totalContributions: number;
    approvalRate: string;
    avgReviewTime: string;
    activeContributors: number;
  };
  monthComparison: {
    currentMonth: { totalContributions: number; approvalRate: number; avgReviewTimeHours: number; activeContributions: number };
    lastMonth: { totalContributions: number; approvalRate: number; avgReviewTimeHours: number; activeContributions: number };
    delta: { totalContributions: number; approvalRate: number; avgReviewTimeHours: number; activeContributions: number };
  };
  byStatus: Record<string, number>;
  bySource: { user: number; admin: number; vendor: number; unknown: number };
  byRegion: Record<string, number>;
  currentWeekContributionByDay: Record<string, number>;
  topContributors: TopContributor[];
  monthWiseAverageReviewTimeHours: MonthWiseReviewTime[];
  monthlyTrend: MonthlyTrendItem[];
  byType: ByTypeItem[];
}
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};
 
const TYPE_COLORS: Record<string, string> = {
  create: "hsl(174, 72%, 46%)",
  update: "hsl(210, 72%, 55%)",
  delete: "hsl(0, 72%, 55%)",
  modify: "hsl(38, 92%, 50%)",
  review: "hsl(280, 60%, 55%)",
};
 
const SOURCE_COLORS: Record<string, string> = {
  user: "hsl(174, 72%, 46%)",
  admin: "hsl(210, 72%, 55%)",
  vendor: "hsl(38, 92%, 50%)",
  unknown: "hsl(215, 12%, 40%)",
};
 
const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(220, 18%, 10%)",
    border: "1px solid hsl(220, 14%, 20%)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(210, 20%, 92%)",
  },
  itemStyle: { color: "hsl(210, 20%, 80%)" },
};
 
// ─── Filter Bar ───────────────────────────────────────────────────────────────
 
const CATEGORIES = ["all", "bank", "restaurant", "hospital", "hotel", "school", "shop", "park"];
 
interface FilterBarProps {
  category: string;
  startDate: string;
  endDate: string;
  onCategoryChange: (v: string) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onApply: () => void;
  loading: boolean;
}
 
function FilterBar({ category, startDate, endDate, onCategoryChange, onStartChange, onEndChange, onApply, loading }: FilterBarProps) {
  const inputCls = "text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer";

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 bg-card border border-border rounded-lg">
      {/* Label */}
      <div className="flex items-center gap-1.5 text-muted-foreground pb-1.5">
        <Filter size={13} />
        <span className="text-xs font-medium uppercase tracking-wider">Filters</span>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Category</span>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          disabled={loading}
          className="text-xs bg-background border border-border rounded-md px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All Categories" : c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Date Range</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              disabled={loading}
              style={{ colorScheme: "dark" }}
              className={`${inputCls} pl-6`}
            />
          </div>
          <span className="text-xs text-muted-foreground">→</span>
          <div className="relative">
            <Calendar size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndChange(e.target.value)}
              disabled={loading}
              style={{ colorScheme: "dark" }}
              className={`${inputCls} pl-6`}
            />
          </div>
        </div>
      </div>

      {/* Apply button — aligned to bottom via items-end on parent */}
      <button
        onClick={onApply}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        {loading ? "Loading…" : "Apply"}
      </button>
    </div>
  );
}
 
// ─── Empty / Error States ─────────────────────────────────────────────────────
 
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
      <AlertCircle size={28} className="opacity-40" />
      <p className="text-xs">{message}</p>
    </div>
  );
}
 
// ─── Skeleton ─────────────────────────────────────────────────────────────────
 
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />;
}
 
// ─── Delta Badge ──────────────────────────────────────────────────────────────
 
function DeltaBadge({ value, suffix = "", inverse = false }: { value: number; suffix?: string; inverse?: boolean }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">No change</span>;
  const positive = inverse ? value < 0 : value > 0;
  return (
    <span className={`text-xs font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}>
      {value > 0 ? "+" : ""}{value}{suffix} vs last month
    </span>
  );
}
 
// ─── Main Component ───────────────────────────────────────────────────────────
 
export default function ContributionAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [osmTagCount, setOsmTagCount] = useState<number | null>(null);
 
  // Filter state
  const [category, setCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
 
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/admin-dashboard/contributors/analytics", {
        category: category === "all" ? undefined : category,
        ...(startDate && { startDate: new Date(startDate).getTime() }),
        ...(endDate && { endDate: new Date(endDate + "T23:59:59").getTime() }),
      });
      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError("Failed to fetch analytics data.");
      }
    } catch {
      setError("An error occurred while fetching analytics data.");
    } finally {
      setLoading(false);
    }
  }, [category, startDate, endDate]);
 
  useEffect(() => {
    fetchAnalytics();
  }, []);
 
  useEffect(() => {
    api.get("/admin-dashboard/contributors/categories")
      .then((res) => {
        const categories: { fields: unknown[] }[] = res.data?.data || [];
        const total = categories.reduce((sum, cat) => sum + (cat.fields?.length || 0), 0);
        setOsmTagCount(total);
      })
      .catch(() => setOsmTagCount(null));
  }, []);
 
  // ── Derived chart data ────────────────────────────────────────────────────
 
  const monthlyTrendChart = (data?.monthlyTrend ?? []).map((item) => ({
    month: `${MONTH_NAMES[(item._id.month - 1) % 12]} '${String(item._id.year).slice(2)}`,
    approved: item.approved,
    rejected: item.rejected,
    pending: item.pending,
    modified: item.modified,
    total: item.total,
  }));
 
  const dailyChart = DAY_NAMES.map((day) => ({
    day: DAY_LABELS[day],
    count: data?.currentWeekContributionByDay?.[day] ?? 0,
  }));
 
  const reviewTimeChart = (data?.monthWiseAverageReviewTimeHours ?? []).map((item) => ({
    month: `${MONTH_NAMES[(item.month - 1) % 12]} '${String(item.year).slice(2)}`,
    hours: parseFloat(item.avgReviewTimeHours.toFixed(2)),
  }));
 
  const byTypeChart = (data?.byType ?? []).map((item, i) => ({
    name: item._id.charAt(0).toUpperCase() + item._id.slice(1),
    value: item.count,
    color: TYPE_COLORS[item._id] ?? `hsl(${(i * 60) % 360}, 60%, 55%)`,
  }));
 
  const bySourceChart = Object.entries(data?.bySource ?? {}).map(([key, val]) => ({
    source: key.charAt(0).toUpperCase() + key.slice(1),
    contributions: val,
    color: SOURCE_COLORS[key] ?? "hsl(215, 12%, 40%)",
  }));
 
  const byRegionData = Object.entries(data?.byRegion ?? {}).map(([region, count]) => ({
    region: region.charAt(0).toUpperCase() + region.slice(1),
    contributions: count,
  })).sort((a, b) => b.contributions - a.contributions);
 
  const maxRegion = Math.max(...byRegionData.map((r) => r.contributions), 1);
 
  const statusMap: Record<string, string> = { "1": "Approved", "2": "Pending", "3": "Rejected", "4": "Modified" };
  const statusColors: Record<string, string> = {
    "1": "hsl(174, 72%, 46%)", "2": "hsl(38, 92%, 50%)", "3": "hsl(0, 72%, 55%)", "4": "hsl(280, 60%, 55%)",
  };
  const byStatusChart = Object.entries(data?.byStatus ?? {}).map(([key, val]) => ({
    name: statusMap[key] ?? `Status ${key}`,
    value: val,
    color: statusColors[key] ?? "hsl(215, 40%, 50%)",
  }));
 
  const delta = data?.monthComparison?.delta;
 
  // ── Render ─────────────────────────────────────────────────────────────────
 
  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contribution Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time insights into POI contributions, review performance, and contributor activity
          </p>
        </div>
        {!loading && data && (
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        )}
      </div>
 
      {/* Filters */}
      <FilterBar
        category={category}
        startDate={startDate}
        endDate={endDate}
        onCategoryChange={setCategory}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
        onApply={fetchAnalytics}
        loading={loading}
      />
 
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
 
      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <MetricCard
              icon={TrendingUp}
              label="Total This Month"
              value={String(data?.summary?.totalContributions ?? "—")}
              change={delta ? <DeltaBadge value={delta.totalContributions} /> : ""}
              changeType={delta && delta.totalContributions >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              icon={CheckCircle}
              label="Approval Rate"
              value={data ? `${parseFloat(data.summary.approvalRate).toFixed(1)}%` : "—"}
              change={delta ? <DeltaBadge value={delta.approvalRate} suffix="%" /> : ""}
              changeType={delta && delta.approvalRate >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              icon={Clock}
              label="Avg Review Time"
              value={data ? `${parseFloat(data.summary.avgReviewTime).toFixed(1)} hrs` : "—"}
              change={delta ? <DeltaBadge value={delta.avgReviewTimeHours} suffix=" hrs" inverse /> : ""}
              changeType={delta && delta.avgReviewTimeHours <= 0 ? "positive" : "negative"}
            />
            <MetricCard
              icon={Users}
              label="Active Contributors"
              value={String(data?.summary?.activeContributors ?? "—")}
              change={delta ? <DeltaBadge value={delta.activeContributions} /> : ""}
              changeType={delta && delta.activeContributions >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              icon={Tag}
              label="OSM Tags"
              value={osmTagCount === null ? "N/A" : String(osmTagCount)}
              change={osmTagCount !== null ? "Total tags across categories" : ""}
              changeType="neutral"
            />
          </>
        )}
      </div>
 
      {/* ── Charts Row 1: Monthly Trend + By Type ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Monthly Contributions</h2>
            {data?.monthlyTrend?.length === 0 && !loading && (
              <span className="text-xs text-muted-foreground">No data for period</span>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-[280px]" />
          ) : monthlyTrendChart.length === 0 ? (
            <EmptyState message="No monthly trend data available for this period." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyTrendChart} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="month" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 50%)" }} />
                <Bar dataKey="approved" fill="hsl(174, 72%, 46%)" radius={[3, 3, 0, 0]} name="Approved" />
                <Bar dataKey="rejected" fill="hsl(0, 72%, 55%)" radius={[3, 3, 0, 0]} name="Rejected" />
                <Bar dataKey="pending" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} name="Pending" />
                <Bar dataKey="modified" fill="hsl(280, 60%, 55%)" radius={[3, 3, 0, 0]} name="Modified" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
 
        {/* By Type */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Type</h2>
          {loading ? (
            <Skeleton className="h-[200px]" />
          ) : byTypeChart.length === 0 ? (
            <EmptyState message="No type data." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byTypeChart} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                    {byTypeChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {byTypeChart.map((item) => {
                  const total = byTypeChart.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{item.value}</span>
                        <span className="font-mono text-foreground">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
 
      {/* ── Charts Row 2: By Status + Daily + Review Time ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Status Pie */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Status</h2>
          {loading ? (
            <Skeleton className="h-[200px]" />
          ) : byStatusChart.length === 0 ? (
            <EmptyState message="No status data." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={byStatusChart} cx="50%" cy="50%" outerRadius={75} dataKey="value" stroke="none">
                    {byStatusChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {byStatusChart.map((item) => {
                  const total = byStatusChart.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{item.value}</span>
                        <span className="font-mono text-foreground">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
 
        {/* Daily Activity */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Daily Activity (This Week)</h2>
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyChart}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="day" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="hsl(174, 72%, 46%)" fill="url(#areaGrad)" strokeWidth={2} name="Contributions" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
 
        {/* Avg Review Time */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Avg Review Time (hrs)</h2>
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : reviewTimeChart.length === 0 ? (
            <EmptyState message="No review time data." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={reviewTimeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="month" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="hours" stroke="hsl(280, 60%, 55%)" strokeWidth={2} dot={{ fill: "hsl(280, 60%, 55%)", r: 3 }} name="Hours" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
 
      {/* ── Row 3: By Source + By Region + Top Contributors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Source */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Source</h2>
          {loading ? (
            <Skeleton className="h-[200px]" />
          ) : bySourceChart.length === 0 ? (
            <EmptyState message="No source data." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySourceChart} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="source" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="contributions" radius={[0, 4, 4, 0]} name="Contributions">
                  {bySourceChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
 
        {/* By Region */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Region</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : byRegionData.length === 0 ? (
            <EmptyState message="No region data." />
          ) : (
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
              {byRegionData.map((r) => (
                <div key={r.region}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground truncate max-w-[140px]" title={r.region}>{r.region}</span>
                    <span className="font-mono text-foreground ml-2">{r.contributions.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(r.contributions / maxRegion) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
 
        {/* Top Contributors */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Top Contributors</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (data?.topContributors ?? []).length === 0 ? (
            <EmptyState message="No contributors data." />
          ) : (
            <div className="space-y-3">
              {(data?.topContributors ?? []).map((c) => {
                const acceptanceRate = c.contributions > 0
                  ? Math.round((c.contributions / c.contributions) * 100) // API doesn't give accepted separately
                  : 0;
                return (
                  <div key={c.rank} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-4">{c.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.contributions} contribution{c.contributions !== 1 ? "s" : ""}
                        {" · "}
                        {c.contributorAccounts} account{c.contributorAccounts !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {/* Rank badge */}
                    <div className={`
                      flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                      ${c.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                        c.rank === 2 ? "bg-slate-400/20 text-slate-300" :
                        c.rank === 3 ? "bg-amber-700/20 text-amber-500" :
                        "bg-muted text-muted-foreground"}
                    `}>
                      #{c.rank}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
 
      {/* ── Month Comparison Row ── */}
      {data?.monthComparison && !loading && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Month-over-Month Comparison</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total Contributions",
                current: data.monthComparison.currentMonth.totalContributions,
                last: data.monthComparison.lastMonth.totalContributions,
                delta: delta?.totalContributions,
                suffix: "",
              },
              {
                label: "Approval Rate",
                current: `${data.monthComparison.currentMonth.approvalRate}%`,
                last: `${data.monthComparison.lastMonth.approvalRate}%`,
                delta: delta?.approvalRate,
                suffix: "%",
              },
              {
                label: "Avg Review Time",
                current: `${data.monthComparison.currentMonth.avgReviewTimeHours.toFixed(1)} hrs`,
                last: `${data.monthComparison.lastMonth.avgReviewTimeHours.toFixed(1)} hrs`,
                delta: delta?.avgReviewTimeHours,
                suffix: " hrs",
                inverse: true,
              },
              {
                label: "Active Contributions",
                current: data.monthComparison.currentMonth.activeContributions,
                last: data.monthComparison.lastMonth.activeContributions,
                delta: delta?.activeContributions,
                suffix: "",
              },
            ].map((item) => (
              <div key={item.label} className="space-y-2 p-3 bg-background rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold text-foreground font-mono">{item.current}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Last: {item.last}</span>
                  {item.delta !== undefined && (
                    <DeltaBadge value={item.delta} suffix={item.suffix} inverse={item.inverse} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}