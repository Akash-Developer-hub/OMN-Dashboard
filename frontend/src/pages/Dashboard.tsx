import { MapPin, GitPullRequest, Users, Activity, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

const recentActivity = [
  { id: 1, action: "POI Updated", detail: "Central Park - Hours changed", time: "2 min ago", user: "Sarah K." },
  { id: 2, action: "Contribution Approved", detail: "New restaurant in Brooklyn", time: "8 min ago", user: "Mike R." },
  { id: 3, action: "Road Closure Added", detail: "5th Ave - Construction", time: "15 min ago", user: "System" },
  { id: 4, action: "Ticket Resolved", detail: "#4521 - Wrong location fix", time: "22 min ago", user: "Admin" },
  { id: 5, action: "Data Pipeline", detail: "Search index v1.3.0 completed", time: "1 hr ago", user: "System" },
];

const serviceStatus = [
  { name: "Search API", status: "healthy" as const, latency: "120ms", uptime: "99.9%" },
  { name: "Routing Engine", status: "healthy" as const, latency: "85ms", uptime: "99.8%" },
  { name: "Tile Server", status: "degraded" as const, latency: "450ms", uptime: "98.5%" },
  { name: "Auth Service", status: "healthy" as const, latency: "45ms", uptime: "99.99%" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your map platform operations</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={MapPin} label="Total POIs" value="128,459" change="+342 this week" changeType="positive" />
        <MetricCard icon={GitPullRequest} label="Pending Reviews" value="87" change="12 urgent" changeType="negative" />
        <MetricCard icon={Users} label="Active Users" value="24.3K" change="+8.2% vs last month" changeType="positive" />
        <MetricCard icon={Activity} label="Services" value="3/4 Healthy" change="Tile Server degraded" changeType="negative" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Recent Activity</h2>
            <button className="text-xs text-primary hover:underline">View all</button>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((item) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{item.time}</p>
                  <p className="text-xs text-muted-foreground">{item.user}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service Status */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Service Health</h2>
          </div>
          <div className="divide-y divide-border">
            {serviceStatus.map((svc) => (
              <div key={svc.name} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">{svc.latency} · {svc.uptime}</p>
                </div>
                <StatusBadge status={svc.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
