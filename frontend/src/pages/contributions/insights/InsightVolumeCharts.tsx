import { useState } from "react";
import {
  Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";
import { TrendingUp, BarChart3, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { DailyTrendItem, CategoryDistItem } from "./types";

interface InsightVolumeChartsProps {
  dailyTrend: DailyTrendItem[];
  categoryDistribution: CategoryDistItem[];
  growthPercent: number;
  loading: boolean;
}

type Granularity = "day" | "week" | "month";

function aggregateByWeek(data: DailyTrendItem[]): DailyTrendItem[] {
  const weeks: Record<string, DailyTrendItem> = {};
  data.forEach((d) => {
    const date = new Date(d.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weeks[key]) {
      weeks[key] = { date: `W ${key}`, total: 0, approved: 0, rejected: 0, pending: 0 };
    }
    weeks[key].total += d.total;
    weeks[key].approved += d.approved;
    weeks[key].rejected += d.rejected;
    weeks[key].pending += d.pending;
  });
  return Object.values(weeks);
}

function aggregateByMonth(data: DailyTrendItem[]): DailyTrendItem[] {
  const months: Record<string, DailyTrendItem> = {};
  data.forEach((d) => {
    const key = d.date.slice(0, 7);
    if (!months[key]) {
      months[key] = { date: key, total: 0, approved: 0, rejected: 0, pending: 0 };
    }
    months[key].total += d.total;
    months[key].approved += d.approved;
    months[key].rejected += d.rejected;
    months[key].pending += d.pending;
  });
  return Object.values(months);
}

const COLORS = {
  total: "hsl(210, 72%, 55%)",
  approved: "hsl(152, 68%, 46%)",
  rejected: "hsl(0, 72%, 55%)",
  pending: "hsl(38, 92%, 50%)",
};

const CATEGORY_COLORS = [
  "hsl(210, 72%, 55%)", "hsl(152, 68%, 46%)", "hsl(38, 92%, 50%)",
  "hsl(280, 60%, 55%)", "hsl(174, 72%, 46%)", "hsl(0, 72%, 55%)",
  "hsl(320, 60%, 50%)", "hsl(45, 80%, 55%)", "hsl(200, 60%, 50%)",
  "hsl(120, 50%, 40%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  },
};

export function InsightVolumeCharts({
  dailyTrend, categoryDistribution, growthPercent, loading,
}: InsightVolumeChartsProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[350px] rounded-lg" />
          <Skeleton className="h-[350px] rounded-lg" />
        </div>
      </div>
    );
  }

  const trendData =
    granularity === "week" ? aggregateByWeek(dailyTrend) :
    granularity === "month" ? aggregateByMonth(dailyTrend) :
    dailyTrend;

  const maxCount = categoryDistribution.length > 0 ? categoryDistribution[0].count : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Contribution Volume Insights
        </h2>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {(["day", "week", "month"] as Granularity[]).map((g) => (
            <Button
              key={g}
              variant={granularity === g ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setGranularity(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Line Chart - Contributions over time */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Contributions Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.total} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.total} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.approved} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.approved} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip {...tooltipStyle} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="total" stroke={COLORS.total} fill="url(#gradTotal)" strokeWidth={2} name="Total" />
              <Area type="monotone" dataKey="approved" stroke={COLORS.approved} fill="url(#gradApproved)" strokeWidth={2} name="Approved" />
              <Line type="monotone" dataKey="rejected" stroke={COLORS.rejected} strokeWidth={2} dot={false} name="Rejected" />
              <Line type="monotone" dataKey="pending" stroke={COLORS.pending} strokeWidth={2} dot={false} name="Pending" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top Category Contributions - Ranked */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Top Category Contributions
          </h3>
          {categoryDistribution.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No category data available</p>
          ) : (
            <div className="space-y-2.5">
              {categoryDistribution.map((cat, i) => {
                const barWidth = maxCount > 0 ? (cat.count / maxCount) * 100 : 0;
                const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                return (
                  <div key={cat.category} className="group">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
                        {medal || `#${i + 1}`}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate flex-1 capitalize">
                        {cat.category}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                        {cat.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="ml-8 h-2 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Growth Summary */}
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center justify-center lg:col-span-2">
          <TrendingUp className={`w-12 h-12 mb-3 ${growthPercent >= 0 ? "text-emerald-500" : "text-red-500"}`} />
          <p className="text-sm text-muted-foreground mb-1">Period-over-Period Growth</p>
          <p className={`text-4xl font-bold ${growthPercent >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {growthPercent > 0 ? "+" : ""}{growthPercent}%
          </p>
          <p className="text-xs text-muted-foreground mt-2">Compared to previous period</p>
          <div className="mt-4 w-full max-w-md grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-muted/30 rounded">
              <p className="text-lg font-semibold text-foreground">{dailyTrend.reduce((s, d) => s + d.total, 0)}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-2 bg-emerald-500/10 rounded">
              <p className="text-lg font-semibold text-emerald-500">{dailyTrend.reduce((s, d) => s + d.approved, 0)}</p>
              <p className="text-[10px] text-muted-foreground">Approved</p>
            </div>
            <div className="text-center p-2 bg-red-500/10 rounded">
              <p className="text-lg font-semibold text-red-500">{dailyTrend.reduce((s, d) => s + d.rejected, 0)}</p>
              <p className="text-[10px] text-muted-foreground">Rejected</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
