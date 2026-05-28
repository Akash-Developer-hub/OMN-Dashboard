import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, CheckCircle, Clock, Users, AlertTriangle, Shield } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import type { Contribution } from "./mockData";
import { useMemo } from "react";

const tooltipStyle = {
  contentStyle: { backgroundColor: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", fontSize: "12px", color: "hsl(210, 20%, 92%)" },
  itemStyle: { color: "hsl(210, 20%, 80%)" },
};

export function ContributionCharts({ contributions }: { contributions: Contribution[] }) {
  const stats = useMemo(() => {
    const pending = contributions.filter(c => c.status === "pending").length;
    const approved = contributions.filter(c => c.status === "approved").length;
    const rejected = contributions.filter(c => c.status === "rejected").length;
    const needsInfo = contributions.filter(c => c.status === "needs_info").length;
    const flagged = contributions.filter(c => c.flagged).length;
    const total = contributions.length;
    const approvalRate = total > 0 ? ((approved / (approved + rejected)) * 100).toFixed(1) : "0";

    // By type
    const byType: Record<string, number> = {};
    contributions.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
    const typeData = Object.entries(byType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // By source
    const bySource: Record<string, { total: number; approved: number }> = {};
    contributions.forEach(c => {
      if (!bySource[c.source]) bySource[c.source] = { total: 0, approved: 0 };
      bySource[c.source].total++;
      if (c.status === "approved") bySource[c.source].approved++;
    });
    const sourceData = Object.entries(bySource).map(([source, d]) => ({ source, total: d.total, approved: d.approved }));

    // By city
    const byCity: Record<string, number> = {};
    contributions.forEach(c => { byCity[c.city] = (byCity[c.city] || 0) + 1; });
    const cityData = Object.entries(byCity).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 7);

    // Trust distribution
    const trustBuckets = [
      { range: "60-69%", count: contributions.filter(c => c.trustScore >= 60 && c.trustScore < 70).length },
      { range: "70-79%", count: contributions.filter(c => c.trustScore >= 70 && c.trustScore < 80).length },
      { range: "80-89%", count: contributions.filter(c => c.trustScore >= 80 && c.trustScore < 90).length },
      { range: "90-100%", count: contributions.filter(c => c.trustScore >= 90).length },
    ];

    // Priority breakdown
    const byPriority = [
      { name: "High", value: contributions.filter(c => c.priority === "high").length, color: "hsl(0, 72%, 55%)" },
      { name: "Medium", value: contributions.filter(c => c.priority === "medium").length, color: "hsl(38, 92%, 50%)" },
      { name: "Low", value: contributions.filter(c => c.priority === "low").length, color: "hsl(215, 12%, 50%)" },
    ];

    return { pending, approved, rejected, needsInfo, flagged, total, approvalRate, typeData, sourceData, cityData, trustBuckets, byPriority };
  }, [contributions]);

  const typeColors = ["hsl(174, 72%, 46%)", "hsl(210, 72%, 55%)", "hsl(38, 92%, 50%)", "hsl(280, 60%, 55%)", "hsl(150, 60%, 45%)", "hsl(0, 72%, 55%)", "hsl(330, 60%, 55%)", "hsl(60, 70%, 50%)"];

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <MetricCard icon={Clock} label="Pending Review" value={String(stats.pending)} change={`${stats.needsInfo} need info`} changeType="neutral" />
        <MetricCard icon={CheckCircle} label="Approved" value={String(stats.approved)} change={`${stats.approvalRate}% rate`} changeType="positive" />
        <MetricCard icon={TrendingUp} label="Total" value={String(stats.total)} change="All time" changeType="neutral" />
        <MetricCard icon={AlertTriangle} label="Rejected" value={String(stats.rejected)} change="" changeType="negative" />
        <MetricCard icon={Shield} label="Flagged" value={String(stats.flagged)} change="Needs attention" changeType="negative" />
        <MetricCard icon={Users} label="Sources" value={String(stats.sourceData.length)} change="" changeType="neutral" />
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By type bar */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Contributions by Type</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.typeData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 10 }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Count">
                {stats.typeData.map((_, i) => <Cell key={i} fill={typeColors[i % typeColors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority pie */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Priority</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats.byPriority} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                {stats.byPriority.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {stats.byPriority.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                  <span className="text-muted-foreground">{p.name}</span>
                </div>
                <span className="font-mono text-foreground">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By source */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By Source</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.sourceData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="source" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" fill="hsl(210, 72%, 55%)" radius={[3, 3, 0, 0]} name="Total" />
              <Bar dataKey="approved" fill="hsl(174, 72%, 46%)" radius={[3, 3, 0, 0]} name="Approved" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By city */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">By City</h2>
          <div className="space-y-3">
            {stats.cityData.map((c) => (
              <div key={c.city}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{c.city}</span>
                  <span className="font-mono text-foreground">{c.count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / (stats.cityData[0]?.count || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust distribution */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Contributor Trust Score Distribution</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stats.trustBuckets} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="range" tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215, 12%, 50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" fill="hsl(174, 72%, 46%)" radius={[4, 4, 0, 0]} name="Contributors" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
