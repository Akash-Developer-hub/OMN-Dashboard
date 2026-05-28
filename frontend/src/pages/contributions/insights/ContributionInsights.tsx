import { useState, useEffect, useCallback } from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { InsightFilters } from "./InsightFilters";
import { InsightKPICards } from "./InsightKPICards";
import { InsightVolumeCharts } from "./InsightVolumeCharts";
import { InsightGeographic } from "./InsightGeographic";
import type { InsightsData, InsightFilters as Filters } from "./types";

export default function ContributionInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({ dateRange: "month" });

  const fetchInsights = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { dateRange: f.dateRange };
      if (f.startDate) params.startDate = String(f.startDate);
      if (f.endDate) params.endDate = String(f.endDate);
      if (f.category) params.category = f.category;
      if (f.status) params.status = f.status;
      if (f.region) params.region = f.region;
      if (f.contributionType) params.contributionType = f.contributionType;
      if (f.contributor) params.contributor = f.contributor;

      const res = await api.get("/admin-dashboard/contributors/insights", { params });
      const insightsData: InsightsData = res.data?.data;
      setData(insightsData);

      // Extract unique regions for filter dropdown
      if (insightsData?.geographicInsights?.regionRanking) {
        setRegions(insightsData.geographicInsights.regionRanking.map((r) => r.region).filter((r) => r !== "Unknown"));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to fetch insights");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch categories once
  useEffect(() => {
    api.get("/admin-dashboard/contributors/categories")
      .then((res) => {
        const cats = (res.data?.data || []).map((c: { category: string }) => c.category);
        setCategories(cats);
      })
      .catch(() => {});
  }, []);

  // Fetch insights when filters change
  useEffect(() => {
    fetchInsights(filters);
  }, [filters, fetchInsights]);

  const handleFiltersChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-primary" />
            Contribution Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor contribution activity, quality, trends, and geographic distribution
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchInsights(filters)}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <InsightFilters
        filters={filters}
        onChange={handleFiltersChange}
        categories={categories}
        regions={regions}
      />

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Section 1: KPI Cards */}
      <InsightKPICards data={data?.kpiCards || null} loading={loading} />

      {/* Section 2: Volume Insights */}
      <InsightVolumeCharts
        dailyTrend={data?.volumeInsights?.dailyTrend || []}
        categoryDistribution={data?.volumeInsights?.categoryDistribution || []}
        growthPercent={data?.volumeInsights?.growthPercent || 0}
        loading={loading}
      />

      {/* Section 3: Geographic Insights */}
      <InsightGeographic
        regionRanking={data?.geographicInsights?.regionRanking || []}
        cityRanking={data?.geographicInsights?.cityRanking || []}
        heatmapPoints={data?.geographicInsights?.heatmapPoints || []}
        highestContributionRegion={data?.geographicInsights?.highestContributionRegion || null}
        mostPendingRegion={data?.geographicInsights?.mostPendingRegion || null}
        lowestContributionRegions={data?.geographicInsights?.lowestContributionRegions || []}
        loading={loading}
      />

      {/* Top Contributors */}
      {data?.topContributors && data.topContributors.length > 0 && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Top Contributors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Rank</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Contributions</th>
                </tr>
              </thead>
              <tbody>
                {data.topContributors.map((c) => (
                  <tr key={c.rank} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-mono text-muted-foreground">#{c.rank}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">{c.contributions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
