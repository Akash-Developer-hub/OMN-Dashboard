import {
  TrendingUp, TrendingDown, Users, UserPlus, CheckCircle,
  XCircle, Clock, BarChart3
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { KPICards } from "./types";

interface InsightKPICardsProps {
  data: KPICards | null;
  loading: boolean;
}

interface KPICardDef {
  key: keyof KPICards;
  label: string;
  icon: React.ElementType;
  format: (v: number) => string;
  color?: string;
  invertTrend?: boolean;
}

const cardDefs: KPICardDef[] = [
  { key: "totalContributions", label: "Total Contributions", icon: BarChart3, format: (v) => v.toLocaleString() },
  { key: "activeContributors", label: "Active Contributors", icon: Users, format: (v) => v.toLocaleString() },
  { key: "newContributorsWeek", label: "New Contributors (Week)", icon: UserPlus, format: (v) => v.toLocaleString() },
  { key: "newContributorsMonth", label: "New Contributors (Month)", icon: UserPlus, format: (v) => v.toLocaleString() },
  { key: "approved", label: "Approved", icon: CheckCircle, format: (v) => v.toLocaleString(), color: "text-emerald-500" },
  { key: "rejected", label: "Rejected", icon: XCircle, format: (v) => v.toLocaleString(), color: "text-red-500", invertTrend: true },
  { key: "pending", label: "Pending Review", icon: Clock, format: (v) => v.toLocaleString(), color: "text-amber-500", invertTrend: true },
  { key: "growthPercent", label: "Growth", icon: TrendingUp, format: (v) => `${v > 0 ? "+" : ""}${v}%` },
];

function TrendBadge({ trend, invertTrend, current, previous }: { trend: string; invertTrend?: boolean; current?: number; previous?: number }) {
  const isUp = trend === "up";
  const isGood = invertTrend ? !isUp : isUp;
  const color = isGood ? "text-emerald-500" : trend === "flat" ? "text-muted-foreground" : "text-red-500";
  const bgColor = isGood ? "bg-emerald-500/10" : trend === "flat" ? "bg-muted/50" : "bg-red-500/10";

  const diff = current !== undefined && previous !== undefined ? current - previous : null;

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded ${color} ${bgColor}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : null}
      {diff !== null && <span>{diff > 0 ? `+${diff}` : diff}</span>}
      {diff === null && <span>{isUp ? "↑" : trend === "down" ? "↓" : "—"}</span>}
    </span>
  );
}

export function InsightKPICards({ data, loading }: InsightKPICardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">KPI Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cardDefs.map((def) => {
          const metric = data[def.key];
          if (!metric) return null;
          const Icon = def.icon;

          return (
            <div
              key={def.key}
              className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">
                  {def.label}
                </p>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Icon className={`w-4 h-4 ${def.color || "text-primary"}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${def.color || "text-foreground"}`}>
                {def.format(metric.value)}
              </p>
              <div className="mt-1">
                <TrendBadge
                  trend={metric.trend}
                  invertTrend={def.invertTrend}
                  current={metric.current}
                  previous={metric.previous}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
