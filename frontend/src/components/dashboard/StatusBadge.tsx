type Status = "healthy" | "degraded" | "down" | "checking" | "pending" | "approved" | "rejected" | "modified" | "active" | "draft" | "completed" | "running" | "failed" | "idle" | "scheduled" | "expired" | "inactive" | "reported" | "investigating" | "confirmed" | "resolved" | "dismissed" | "archived" | "live" | "needs_info";

const statusConfig: Record<Status, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-success/15 text-success border-success/30" },
  degraded: { label: "Degraded", className: "bg-warning/15 text-warning border-warning/30" },
  down: { label: "Down", className: "bg-destructive/15 text-destructive border-destructive/30" },
  checking: { label: "Checking", className: "bg-info/15 text-info border-info/30" },
  pending: { label: "Pending", className: "bg-warning/15 text-warning border-warning/30" },
  approved: { label: "Approved", className: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive border-destructive/30" },
  active: { label: "Active", className: "bg-success/15 text-success border-success/30" },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30" },
  running: { label: "Running", className: "bg-info/15 text-info border-info/30" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive border-destructive/30" },
  idle: { label: "Idle", className: "bg-muted text-muted-foreground border-border" },
  scheduled: { label: "Scheduled", className: "bg-info/15 text-info border-info/30" },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground border-border" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-border" },
  reported: { label: "Reported", className: "bg-warning/15 text-warning border-warning/30" },
  investigating: { label: "Investigating", className: "bg-info/15 text-info border-info/30" },
  confirmed: { label: "Confirmed", className: "bg-primary/15 text-primary border-primary/30" },
  resolved: { label: "Resolved", className: "bg-success/15 text-success border-success/30" },
  dismissed: { label: "Dismissed", className: "bg-muted text-muted-foreground border-border" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground border-border" },
  live: { label: "Live", className: "bg-success/15 text-success border-success/30" },
  modified: { label: "Modified", className: "bg-info/15 text-info border-info/30" },
  needs_info: { label: "Needs Info", className: "bg-warning/15 text-warning border-warning/30" },
};

const fallbackConfig = { label: "Unknown", className: "bg-muted text-muted-foreground border-border" };

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as Status] ?? fallbackConfig;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
