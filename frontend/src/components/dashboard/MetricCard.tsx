import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  change?: ReactNode;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

export function MetricCard({ label, value, change, changeType = "neutral", icon: Icon }: MetricCardProps) {
  const changeColor = {
    positive: "text-success",
    negative: "text-destructive",
    neutral: "text-muted-foreground",
  }[changeType];

  return (
    <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {change && (
            <div className={`text-xs mt-1 ${changeColor}`}>{change}</div>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
