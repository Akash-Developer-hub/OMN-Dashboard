export interface KPIMetric {
  value: number;
  current?: number;
  previous?: number;
  trend: "up" | "down" | "flat";
  unit?: string;
}

export interface KPICards {
  totalContributions: KPIMetric;
  activeContributors: KPIMetric;
  newContributorsWeek: KPIMetric;
  newContributorsMonth: KPIMetric;
  approved: KPIMetric;
  rejected: KPIMetric;
  pending: KPIMetric;
  growthPercent: KPIMetric;
}

export interface DailyTrendItem {
  date: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface CategoryDistItem {
  category: string;
  count: number;
}

export interface RegionItem {
  region: string;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface CityItem {
  city: string;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  status: number | string;
  category: string;
}

export interface TopContributor {
  rank: number;
  userId: string | null;
  name: string;
  contributions: number;
}

export interface InsightsData {
  dateRange: {
    type: string;
    start: number;
    end: number;
    prevStart: number;
    prevEnd: number;
  };
  kpiCards: KPICards;
  volumeInsights: {
    dailyTrend: DailyTrendItem[];
    categoryDistribution: CategoryDistItem[];
    hourlyDistribution: HourlyDistItem[];
    peakHour: { hour: number; count: number };
    growthPercent: number;
  };
  geographicInsights: {
    regionRanking: RegionItem[];
    cityRanking: CityItem[];
    heatmapPoints: HeatmapPoint[];
    highestContributionRegion: RegionItem | null;
    mostPendingRegion: RegionItem | null;
    lowestContributionRegions: RegionItem[];
  };
  topContributors: TopContributor[];
}

export interface InsightFilters {
  dateRange: "today" | "week" | "month" | "custom";
  startDate?: number;
  endDate?: number;
  category?: string;
  status?: string;
  region?: string;
  contributionType?: string;
  contributor?: string;
}
