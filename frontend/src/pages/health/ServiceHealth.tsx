import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  serversApi,
  type Server as ServerType,
} from "@/pages/servers/serversApi";
import {
  Activity,
  Clock,
  Database,
  Pencil,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Wifi,
  Maximize2,
  Trash2,
} from "lucide-react";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  serviceHealthApi,
  type ResponseTimeTrendPoint,
  type ResponseTimeTrendRange,
  type ResponseTimeTrendResponse,
} from "./serviceHealthApi";
import { useHealthCheck } from "@/contexts/HealthCheckContext";
import { ServiceHealthSkeleton } from "./ServiceHealthSkeleton";
import { toast } from "sonner";
import { api } from "@/utils/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const getServiceIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("auth")) return Shield;
  if (
    n.includes("cache") ||
    n.includes("redis") ||
    n.includes("sql") ||
    n.includes("db") ||
    n.includes("postgres") ||
    n.includes("validation")
  )
    return Database;
  if (n.includes("routing") || n.includes("wifi")) return Wifi;
  if (n.includes("server") || n.includes("gateway")) return Server;
  return Activity;
};

const formatZero = (value: number | string | undefined, suffix = "") => {
  const num = Number(value);
  return num === 0 ? "-" : `${num}${suffix}`;
};

const formatCheckedAt = (value?: string) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
};
const PM2_SERVICE_OPTIONS = [
  // "validation"
];

type TrendRange = "24h" | "48h";

const responseTimeTrends: Record<TrendRange,
  {
    label: string;
    peakAvg: number;
    currentAvg: number;
    peakDelta: string;
    currentDelta: string;
    linePath: string;
    labels: [string, string, string, string, string];
  }
> = {
  "24h": {
    label: "Last 24 Hours",
    peakAvg: 142,
    currentAvg: 48,
    peakDelta: "12% vs last period",
    currentDelta: "5% vs last hour",
    linePath: "M28 216 C74 118 126 104 176 132 C238 166 294 126 336 56 C382 -18 444 42 470 125 C500 220 530 290 584 222 C626 168 622 56 668 -20 C724 -114 820 -60 850 120",
    labels: ["24H AGO", "18H", "12H", "6H", "NOW"],
  },
  "48h": {
    label: "Last 48 Hours",
    peakAvg: 196,
    currentAvg: 72,
    peakDelta: "18% vs last period",
    currentDelta: "9% vs last hour",
    linePath:
      "M28 218 C62 74 118 110 154 146 C210 224 270 84 320 30 C372 -28 424 50 454 116 C494 206 528 244 574 92 C616 -34 676 -8 714 50 C770 138 806 -72 850 76",
    labels: ["48H AGO", "36H", "24H", "12H", "NOW"],
  },
};

function ResponseTimeTrends() {
  const [trendRange, setTrendRange] = useState<TrendRange>("24h");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const activeTrend = responseTimeTrends[trendRange];
  const viewBoxWidth = 880 / zoomLevel;
  const viewBoxHeight = 300 / zoomLevel;
  const viewBoxX = (880 - viewBoxWidth) / 2;
  const viewBoxY = (300 - viewBoxHeight) / 2;
  const chartViewBox = `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;
  const previewViewBox = "0 -120 880 430";

  const renderTrendChart = (isPreview = false) => {
    const suffix = isPreview ? "preview" : "card";
    const baselineY = 250;

    return (
      <svg
        key={`${trendRange}-${suffix}-${isPreview ? "full" : zoomLevel}`}
        className="absolute inset-0 h-full w-full animate-in fade-in zoom-in-95 duration-500"
        viewBox={isPreview ? previewViewBox : chartViewBox}
        preserveAspectRatio="none"
        role="img"
        aria-label="Response time trend chart"
      >
        <defs>
          <linearGradient id={`responseAreaGradient-${suffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.34" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.04" />
          </linearGradient>
          <clipPath id={`responseTrendClip-${suffix}`}>
            <rect
              x="0"
              y={isPreview ? "-120" : "0"}
              width="880"
              height={isPreview ? "430" : "300"}
              rx="8"
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#responseTrendClip-${suffix})`}>
          {[
            { y: 90, label: "75ms" },
            { y: 186, label: "30ms" },
          ].map((line) => (
            <line
              key={line.y}
              x1="28"
              x2="850"
              y1={line.y}
              y2={line.y}
              stroke="hsl(var(--border))"
              strokeDasharray="5 6"
              strokeOpacity="0.9"
            />
          ))}
          <line
            x1="28"
            x2="850"
            y1={baselineY}
            y2={baselineY}
            stroke="hsl(var(--border))"
            strokeOpacity="0.45"
          />

          <path
            d={`${activeTrend.linePath} L850 ${baselineY} L28 ${baselineY} Z`}
            fill={`url(#responseAreaGradient-${suffix})`}
            className="transition-all duration-700 ease-out"
          />
          <path
            d={activeTrend.linePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_14px_hsl(var(--primary)/0.25)] transition-all duration-700 ease-out"
          />
        </g>

        <g className="fill-muted-foreground text-[12px]">
          <text x="12" y="93">75ms</text>
          <text x="12" y="189">30ms</text>
          <text x="12" y="254">0ms</text>
          <text x="28" y="284">{activeTrend.labels[0]}</text>
          <text x="280" y="284">{activeTrend.labels[1]}</text>
          <text x="476" y="284">{activeTrend.labels[2]}</text>
          <text x="675" y="284">{activeTrend.labels[3]}</text>
          <text x="820" y="284">{activeTrend.labels[4]}</text>
        </g>
      </svg>
    );
  };
  

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-foreground">
          Response Time Trends
        </h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span>Avg Response Time (ms)</span>
          </div>
          <Select
            value={trendRange}
            onValueChange={(value) => {
              setTrendRange(value as TrendRange);
              setZoomLevel(1);
            }}
          >
            <SelectTrigger className="h-8 w-[140px] border-border bg-card px-3 text-xs text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="48h">Last 48 Hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.95fr)]">
        <div className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-card">
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
              aria-label="Maximize response time trend"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          {renderTrendChart()}
          <div className="absolute bottom-3 right-4 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {Math.round(zoomLevel * 100)}%
          </div>
        </div>

        <div
          key={`${trendRange}-summary`}
          className="flex min-h-[300px] flex-col justify-center rounded-lg border border-border bg-card px-8 py-8 animate-in fade-in slide-in-from-right-2 duration-500"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Peak Avg
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold leading-none text-foreground">
                {activeTrend.peakAvg}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">ms</span>
            </div>
            <p className="mt-3 text-xs font-medium text-destructive">
              ▲ {activeTrend.peakDelta}
            </p>
          </div>

          <div className="my-8 h-px bg-border" />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Avg
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold leading-none text-primary">
                {activeTrend.currentAvg}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">ms</span>
            </div>
            <p className="mt-3 text-xs font-medium text-success">
              ▼ {activeTrend.currentDelta}
            </p>
          </div>
        </div>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="text-lg">Response Time Trends</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {activeTrend.label} preview with full peak visibility.
            </p>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-lg border border-border bg-background">
              {renderTrendChart(true)}
            </div>
            <div className="rounded-lg border border-border bg-background p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Peak Avg
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-foreground">
                  {activeTrend.peakAvg}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">ms</span>
              </div>
              <p className="mt-3 text-xs font-medium text-destructive">
                ▲ {activeTrend.peakDelta}
              </p>

              <div className="my-8 h-px bg-border" />

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Avg
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-primary">
                  {activeTrend.currentAvg}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">ms</span>
              </div>
              <p className="mt-3 text-xs font-medium text-success">
                ▼ {activeTrend.currentDelta}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type TrendServiceOption = {
  name: string;
  pm2Name: string;
};

const emptyTrend: ResponseTimeTrendResponse = {
  range: "24h",
  dataPoints: [],
  peakAvg: 0,
  currentAvg: 0,
};

const getTrendRangeLabel = (range: ResponseTimeTrendRange) =>
  range === "48h" ? "Last 48 Hours" : "Last 24 Hours";

const getTrendXAxisLabels = (
  range: ResponseTimeTrendRange,
): [string, string, string, string, string] =>
  range === "48h"
    ? ["48H AGO", "36H", "24H", "12H", "NOW"]
    : ["24H AGO", "18H", "12H", "6H", "NOW"];

const getTrendMax = (points: ResponseTimeTrendPoint[]) => {
  const max = Math.max(100, ...points.map((point) => Number(point.avg) || 0));
  return Math.ceil((max * 1.2) / 25) * 25;
};

type TrendCoordinate = {
  x: number;
  y: number;
  avg: number;
  hourLabel: string;
};

const formatTrendHour = (timestamp: string) => {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return "-";

  const hoursAgo = Math.max(0, Math.round((Date.now() - time) / 3_600_000));
  if (hoursAgo === 0) return "Now";
  return `${hoursAgo}hr${hoursAgo === 1 ? "" : "s"}`;
};

const getTrendCoordinates = (
  points: ResponseTimeTrendPoint[],
  maxYValue: number,
): TrendCoordinate[] => {
  const chartLeft = 28;
  const chartRight = 850;
  const chartTop = 30;
  const baselineY = 250;

  if (points.length === 0) return [];

  const drawableWidth = chartRight - chartLeft;
  const drawableHeight = baselineY - chartTop;
  return points.map((point, index) => {
    const avg = Number(point.avg) || 0;
    const x =
      points.length === 1
        ? chartLeft
        : chartLeft + (index / (points.length - 1)) * drawableWidth;
    const y =
      baselineY -
      Math.min(1, avg / maxYValue) * drawableHeight;
    return {
      x,
      y,
      avg,
      hourLabel: formatTrendHour(point.timestamp),
    };
  });
};

const createTrendPath = (
  points: ResponseTimeTrendPoint[],
  maxYValue: number,
) => {
  const chartRight = 850;
  const mapped = getTrendCoordinates(points, maxYValue);

  if (mapped.length === 0) return "";

  if (mapped.length === 1) {
    const point = mapped[0];
    return `M${point.x} ${point.y} L${chartRight} ${point.y}`;
  }

  return mapped.reduce((path, point, index) => {
    if (index === 0) return `M${point.x} ${point.y}`;

    const previous = mapped[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C${controlX} ${previous.y} ${controlX} ${point.y} ${point.x} ${point.y}`;
  }, "");
};

function ResponseTimeTrendsReal({ services }: { services: TrendServiceOption[] }) {
  const [trendRange, setTrendRange] =
    useState<ResponseTimeTrendRange>("24h");
  const [selectedTrendService, setSelectedTrendService] = useState("");
  const [trendData, setTrendData] =
    useState<ResponseTimeTrendResponse>(emptyTrend);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hoveredTrendPoint, setHoveredTrendPoint] =
    useState<TrendCoordinate | null>(null);
  const viewBoxWidth = 880 / zoomLevel;
  const viewBoxHeight = 300 / zoomLevel;
  const viewBoxX = (880 - viewBoxWidth) / 2;
  const viewBoxY = (300 - viewBoxHeight) / 2;
  const chartViewBox = `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;
  const previewViewBox = "0 -120 880 430";
  const xAxisLabels = getTrendXAxisLabels(trendRange);
  const maxYValue = getTrendMax(trendData.dataPoints);
  const trendCoordinates = useMemo(
    () => getTrendCoordinates(trendData.dataPoints, maxYValue),
    [trendData.dataPoints, maxYValue],
  );
  const activeTrendPath = createTrendPath(trendData.dataPoints, maxYValue);
  const hasTrendData = trendData.dataPoints.some(
    (point) => Number(point.avg) > 0,
  );
  const trendServiceOptions = useMemo(
    () => services.filter((service) => Boolean(service.pm2Name)),
    [services],
  );
  const selectedServiceLabel =
    trendServiceOptions.find(
      (service) => service.pm2Name === selectedTrendService,
    )?.name || selectedTrendService;

  useEffect(() => {
    const hasSelectedService = trendServiceOptions.some(
      (service) => service.pm2Name === selectedTrendService,
    );

    if ((!selectedTrendService || !hasSelectedService) && trendServiceOptions.length > 0) {
      setSelectedTrendService(trendServiceOptions[0].pm2Name);
    }
  }, [selectedTrendService, trendServiceOptions]);

  useEffect(() => {
    if (!selectedTrendService) {
      setTrendData(emptyTrend);
      return;
    }

    let isMounted = true;

    const fetchTrendData = async () => {
      try {
        setIsTrendLoading(true);
        const response = await serviceHealthApi.getResponseTimeTrends(
          selectedTrendService,
          trendRange,
        );
        if (isMounted) setTrendData(response.data.data);
      } catch (err) {
        console.error("Failed to fetch response time trends:", err);
        if (isMounted) setTrendData(emptyTrend);
      } finally {
        if (isMounted) setIsTrendLoading(false);
      }
    };

    fetchTrendData();

    return () => {
      isMounted = false;
    };
  }, [selectedTrendService, trendRange]);

  const zoomInTrend = () =>
    setZoomLevel((current) => Math.min(1.6, Number((current + 0.2).toFixed(1))));

  const zoomOutTrend = () =>
    setZoomLevel((current) => Math.max(0.8, Number((current - 0.2).toFixed(1))));

  const handleTrendHover = (
    event: MouseEvent<SVGSVGElement>,
    isPreview = false,
  ) => {
    if (trendCoordinates.length === 0 || !hasTrendData) {
      setHoveredTrendPoint(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const activeViewBox = isPreview
      ? { x: 0, width: 880 }
      : { x: viewBoxX, width: viewBoxWidth };
    const pointerX =
      activeViewBox.x +
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) *
        activeViewBox.width;
    const nearestPoint = trendCoordinates.reduce((nearest, point) =>
      Math.abs(point.x - pointerX) < Math.abs(nearest.x - pointerX)
        ? point
        : nearest,
    );

    setHoveredTrendPoint(nearestPoint);
  };

  const renderTrendChart = (isPreview = false) => {
    const suffix = isPreview ? "real-preview" : "real-card";
    const baselineY = 250;
    const tooltipPoint = hoveredTrendPoint;
    const tooltipX = tooltipPoint
      ? Math.min(740, Math.max(48, tooltipPoint.x + 18))
      : 0;
    const tooltipY = tooltipPoint
      ? Math.min(214, Math.max(38, tooltipPoint.y - 72))
      : 0;

    return (
      <svg
        key={`${trendRange}-${selectedTrendService}-${suffix}-${isPreview ? "full" : zoomLevel}`}
        className="absolute inset-0 h-full w-full animate-in fade-in zoom-in-95 duration-500"
        viewBox={isPreview ? previewViewBox : chartViewBox}
        preserveAspectRatio="none"
        role="img"
        aria-label="Response time trend chart"
        onMouseMove={(event) => handleTrendHover(event, isPreview)}
        onMouseLeave={() => setHoveredTrendPoint(null)}
      >
        <defs>
          <linearGradient id={`responseAreaGradient-${suffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.34" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.04" />
          </linearGradient>
          <clipPath id={`responseTrendClip-${suffix}`}>
            <rect
              x="0"
              y={isPreview ? "-120" : "0"}
              width="880"
              height={isPreview ? "430" : "300"}
              rx="8"
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#responseTrendClip-${suffix})`}>
          {[
            { y: 90, label: "75" },
            { y: 186, label: "30" },
          ].map((line) => (
            <line
              key={line.y}
              x1="28"
              x2="850"
              y1={line.y}
              y2={line.y}
              stroke="hsl(var(--border))"
              strokeDasharray="5 6"
              strokeOpacity="0.9"
            />
          ))}
          <line
            x1="28"
            x2="850"
            y1={baselineY}
            y2={baselineY}
            stroke="hsl(var(--border))"
            strokeOpacity="0.45"
          />

          {activeTrendPath ? (
            <>
              <path
                d={`${activeTrendPath} L850 ${baselineY} L28 ${baselineY} Z`}
                fill={`url(#responseAreaGradient-${suffix})`}
                className="transition-all duration-700 ease-out"
              />
              <path
                d={activeTrendPath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_14px_hsl(var(--primary)/0.25)] transition-all duration-700 ease-out"
              />
              <path
                d={activeTrendPath}
                fill="none"
                stroke="transparent"
                strokeWidth="26"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cursor-crosshair"
              />
            </>
          ) : null}
        </g>

        {tooltipPoint ? (
          <g className="pointer-events-none">
            <line
              x1={tooltipPoint.x}
              x2={tooltipPoint.x}
              y1="30"
              y2={baselineY}
              stroke="hsl(var(--primary))"
              strokeDasharray="4 6"
              strokeOpacity="0.45"
            />
            <circle
              cx={tooltipPoint.x}
              cy={tooltipPoint.y}
              r="7"
              fill="hsl(var(--background))"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width="126"
              height="58"
              rx="8"
              fill="hsl(var(--background))"
              stroke="hsl(var(--border))"
            />
            <text x={tooltipX + 12} y={tooltipY + 22} className="fill-foreground text-[12px] font-semibold">
              {tooltipPoint.avg}ms avg
            </text>
            <text x={tooltipX + 12} y={tooltipY + 42} className="fill-muted-foreground text-[11px]">
              Hour: {tooltipPoint.hourLabel}
            </text>
          </g>
        ) : null}

        <g className="fill-muted-foreground text-[12px]">
          <text x="12" y="93">{Math.round(maxYValue * 0.75)}ms</text>
          <text x="12" y="189">{Math.round(maxYValue * 0.3)}ms</text>
          <text x="12" y="254">0ms</text>
          <text x="28" y="284">{xAxisLabels[0]}</text>
          <text x="280" y="284">{xAxisLabels[1]}</text>
          <text x="476" y="284">{xAxisLabels[2]}</text>
          <text x="675" y="284">{xAxisLabels[3]}</text>
          <text x="820" y="284">{xAxisLabels[4]}</text>
        </g>
      </svg>
    );
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-bold text-foreground">
            Response Time Trends
          </h2>
          <Select
            value={selectedTrendService}
            onValueChange={(value) => {
              setSelectedTrendService(value);
              setZoomLevel(1);
            }}
          >
            <SelectTrigger className="h-8 w-[180px] border-border bg-card px-3 text-xs">
              <SelectValue placeholder="Select service" />
            </SelectTrigger>
            <SelectContent>
              {trendServiceOptions.map((service) => (
                <SelectItem key={service.pm2Name} value={service.pm2Name}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span>Avg Response Time (ms)</span>
          </div>
          <Select
            value={trendRange}
            onValueChange={(value) => {
              setTrendRange(value as ResponseTimeTrendRange);
              setZoomLevel(1);
            }}
          >
            <SelectTrigger className="h-8 w-[140px] border-border bg-card px-3 text-xs text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="48h">Last 48 Hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.95fr)]">
        <div className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-card">
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
              aria-label="Maximize response time trend"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          {renderTrendChart()}
          {!hasTrendData && !isTrendLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No response time logs for {selectedServiceLabel || "this service"}.
            </div>
          )}
          {isTrendLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/40 text-sm text-muted-foreground backdrop-blur-[1px]">
              Loading trend data...
            </div>
          )}
          <div className="absolute bottom-3 right-4 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {Math.round(zoomLevel * 100)}%
          </div>
        </div>

        <div
          key={`${trendRange}-${selectedTrendService}-summary`}
          className="flex min-h-[300px] flex-col justify-center rounded-lg border border-border bg-card px-8 py-8 animate-in fade-in slide-in-from-right-2 duration-500"
        >
          <p className="mb-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {selectedServiceLabel || "No service selected"}
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Peak Avg
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold leading-none text-foreground">
                {trendData.peakAvg}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">ms</span>
            </div>
            <p className="mt-3 text-xs font-medium text-destructive">
              Peak in {getTrendRangeLabel(trendRange).toLowerCase()}
            </p>
          </div>

          <div className="my-8 h-px bg-border" />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Avg
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold leading-none text-primary">
                {trendData.currentAvg}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">ms</span>
            </div>
            <p className="mt-3 text-xs font-medium text-success">
              Latest logged average
            </p>
          </div>
        </div>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-[92vw]">
          <DialogHeader>
            <DialogTitle className="text-lg">Response Time Trends</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selectedServiceLabel} - {getTrendRangeLabel(trendRange)} preview with full peak visibility.
            </p>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-lg border border-border bg-background">
              {renderTrendChart(true)}
              {!hasTrendData && !isTrendLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  No response time logs for {selectedServiceLabel || "this service"}.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Peak Avg
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-foreground">
                  {trendData.peakAvg}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">ms</span>
              </div>
              <p className="mt-3 text-xs font-medium text-destructive">
                Peak in {getTrendRangeLabel(trendRange).toLowerCase()}
              </p>

              <div className="my-8 h-px bg-border" />

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Avg
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-primary">
                  {trendData.currentAvg}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">ms</span>
              </div>
              <p className="mt-3 text-xs font-medium text-success">
                Latest logged average
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function ServiceHealth() {
  const { health, isInitialLoading, refreshHealth, applyHealthSnapshot } =
    useHealthCheck();
  const [isLoading, setIsLoading] = useState(false);
  const [checkingService, setCheckingService] = useState<string | null>(null);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [stoppingService, setStoppingService] = useState<string | null>(null);
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [selectedService, setSelectedService] = useState("");
  const [selectedServer, setSelectedServer] = useState("");
  const [selectedPm2Service, setSelectedPm2Service] = useState("");
  const [customServiceOptions, setCustomServiceOptions] = useState<string[]>([]);
  const [customPm2ServiceOptions, setCustomPm2ServiceOptions] = useState<string[]>([]);
  const [newServiceInput, setNewServiceInput] = useState("");
  const [newPm2ServiceInput, setNewPm2ServiceInput] = useState("");
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isPm2DialogOpen, setIsPm2DialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | null>(null);
  const [confirmServiceName, setConfirmServiceName] = useState("");
  const [isEditServiceDialogOpen, setIsEditServiceDialogOpen] = useState(false);
  const [editServiceIndex, setEditServiceIndex] = useState<number | null>(null);
  const [editServiceInput, setEditServiceInput] = useState("");
  const [isActionEditOpen, setIsActionEditOpen] = useState(false);
  const [actionEditPm2Name, setActionEditPm2Name] = useState("");
  const [actionEditServiceName, setActionEditServiceName] = useState("");
  const [isSavingActionEdit, setIsSavingActionEdit] = useState(false);
  const [deletingService, setDeletingService] = useState<string | null>(null);
  const [deleteConfirmService, setDeleteConfirmService] = useState<{
    pm2Name: string;
    name: string;
  } | null>(null);
  const [servers, setServers] = useState<ServerType[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [pm2Names, setPm2Names] = useState<string[]>([]);
  const [isLoadingPm2Names, setIsLoadingPm2Names] = useState(false);
  const [existingServiceDefinitions, setExistingServiceDefinitions] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<"pm2" | "api">("pm2");
  const [healthUrl, setHealthUrl] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiMethod, setApiMethod] = useState("GET");
  const [apiTimeout, setApiTimeout] = useState("5000");
  const [apiHeaders, setApiHeaders] = useState("");
  const [apiQueryParams, setApiQueryParams] = useState("");
  const [apiBody, setApiBody] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedMailToList, setSelectedMailToList] = useState<string[]>([]);

  const fetchServers = useCallback(async () => {
    try {
      setIsLoadingServers(true);
      const response = await serversApi.getAll({ isActive: true });
      setServers(response.data.data);
    } catch (err) {
      console.error("Failed to fetch servers:", err);
    } finally {
      setIsLoadingServers(false);
    }
  }, []);

  const fetchPm2Names = useCallback(async (serverName: string) => {
    if (!serverName) {
      setPm2Names([]);
      return;
    }

    try {
      setIsLoadingPm2Names(true);
      const response = await serviceHealthApi.getPm2Names(serverName);
      setPm2Names(response.data.data.pm2names);
    } catch (err) {
      console.error("Failed to fetch PM2 names:", err);
      setPm2Names([]);
    } finally {
      setIsLoadingPm2Names(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const fetchExistingConfigs = useCallback(async () => {
    try {
      const response = await serviceHealthApi.getConfigurationList();
      console.log("Frontend: configurations ",response)
      const definitions = (response.data.data ?? []).map(
        (c) => c.serviceDefinition,
      );
      setExistingServiceDefinitions(definitions);
    } catch (err) {
      console.error("Failed to fetch existing configurations:", err);
    }
  }, []);

  useEffect(() => {
    if (isConfigureOpen) {
      fetchExistingConfigs();
    }
  }, [isConfigureOpen, fetchExistingConfigs]);

  useEffect(() => {
    fetchPm2Names(selectedServer);
  }, [selectedServer, fetchPm2Names]);

  useEffect(() => {
    api.get("/admin-dashboard/users")
      .then(({ data }) => {
        const list = data?.data?.users;
        if (Array.isArray(list)) setUsers(list);
      })
      .catch(() => {});
  }, []);

  const confirmThenExecute = async () => {
    const serviceName = confirmServiceName;
    setIsConfirmOpen(false);
    setConfirmAction(null);
    setConfirmServiceName("");

    if (confirmAction === "restart") {
      try {
        setRestartingService(serviceName);
        await serviceHealthApi.restart(serviceName);
        await refreshHealth();
      } catch (err) {
        console.error("Service restart failed:", err);
      } finally {
        setRestartingService(null);
      }
    } else if (confirmAction === "stop") {
      try {
        setStoppingService(serviceName);
        await serviceHealthApi.stop(serviceName);
        await refreshHealth();
      } catch (err) {
        console.error("Service stop failed:", err);
      } finally {
        setStoppingService(null);
      }
    }
  };

  const requestStop = (serviceName: string) => {
    setConfirmAction("stop");
    setConfirmServiceName(serviceName);
    setIsConfirmOpen(true);
  };

  const requestRestart = (serviceName: string) => {
    setConfirmAction("restart");
    setConfirmServiceName(serviceName);
    setIsConfirmOpen(true);
  };

  const SERVICE_OPTIONS = useMemo(() => {
    const defaultOptions = [
      // "Validation",
      // "Sample",
    ];
    const dbOptions = (health?.services ?? []).map((s) => s.name);
    return Array.from(new Set([...defaultOptions, ...dbOptions]));
  }, [health]);

  const usedPm2Names = useMemo(() => {
    return new Set((health?.services ?? []).map((s) => s.pm2Name));
  }, [health]);

  const allPm2ServiceOptions = useMemo(() => {
    const availablePm2Names = pm2Names.filter(
      (name) => !usedPm2Names.has(name),
    );
    return [...availablePm2Names, ...customPm2ServiceOptions];
  }, [pm2Names, customPm2ServiceOptions, usedPm2Names]);

  const checkService = async (serviceName: string) => {
    try {
      setCheckingService(serviceName);
      const response = await serviceHealthApi.checkSingle(serviceName);
      applyHealthSnapshot(response.data.data);
    } catch (err) {
      console.error("Failed to check single service:", err);
    } finally {
      setCheckingService(null);
    }
  };

  const checkAllServices = async () => {
    try {
      setIsLoading(true);
      const response = await serviceHealthApi.checkAll();
      applyHealthSnapshot(response.data.data);
    } catch (err) {
      console.error("Failed to check all services:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const isConfigureReady = selectedService && (
    selectedType === "pm2" ? selectedServer && selectedPm2Service : apiUrl && apiMethod
  );

  const confirmConfiguration = async () => {
    if (!isConfigureReady) return;

    try {
      //  const payload: Record<string, string> = { serviceDefinition: selectedService, type: selectedType};
      const payload: Parameters<typeof serviceHealthApi.saveConfiguration>[0] = { server: "", serviceDefinition: selectedService, type: selectedType};

      if (selectedType === "pm2") {
        payload.server = selectedServer;
        payload.pm2Name = selectedPm2Service;
        if (healthUrl) payload.healthUrl = healthUrl;
      } else {
        payload.pm2Name = apiUrl;
        payload.apiUrl = apiUrl;
        payload.apiMethod = apiMethod;
        payload.apiTimeout = apiTimeout;
        if (apiHeaders) payload.apiHeaders = apiHeaders;
        if (apiQueryParams) payload.apiQueryParams = apiQueryParams;
        if (apiBody) payload.apiBody = apiBody;
      }
      payload.mailTo = selectedMailToList;
      await serviceHealthApi.saveConfiguration(payload);

      const remaining = customServiceOptions.filter(
        (s) => s !== selectedService,
      );
      setCustomServiceOptions(remaining);
      setSelectedService(remaining.length > 0 ? remaining[0] : "");
      setSelectedPm2Service("");
      setPm2Names([]);
      setSelectedServer("");
      setHealthUrl("");
      setSelectedType("pm2");

      if (remaining.length === 0) {
        setCustomPm2ServiceOptions([]);
        setExistingServiceDefinitions([]);
        setApiUrl("");
        setApiMethod("GET");
        setApiTimeout("5000");
        setApiHeaders("");
        setApiQueryParams("");
        setApiBody("");
        setIsConfigureOpen(false);
      }

      refreshHealth();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Failed to save configuration.";
      toast.error(message, { duration: 3000 });
    }
  };

  const addCustomServiceOption = () => {
    const value = newServiceInput.trim();
    if (!value) return;
    if (
      SERVICE_OPTIONS.includes(value) ||
      customServiceOptions.includes(value) ||
      existingServiceDefinitions.includes(value)
    )
      return;

    setCustomServiceOptions((prev) => [...prev, value]);
    setSelectedService(value);
    setNewServiceInput("");
    setIsServiceDialogOpen(false);
  };

  const addCustomPm2ServiceOption = () => {
    const value = newPm2ServiceInput.trim();
    if (!value) return;
    if (
      PM2_SERVICE_OPTIONS.includes(value) ||
      customPm2ServiceOptions.includes(value)
    )
      return;

    setCustomPm2ServiceOptions((prev) => [...prev, value]);
    setSelectedPm2Service(value);
    setNewPm2ServiceInput("");
    setIsPm2DialogOpen(false);
  };

  const editCustomServiceOption = () => {
    const value = editServiceInput.trim();
    if (!value || editServiceIndex === null) return;
    if (
      customServiceOptions[editServiceIndex] !== value &&
      (SERVICE_OPTIONS.includes(value) ||
        customServiceOptions.includes(value) ||
        existingServiceDefinitions.includes(value))
    )
      return;

    setCustomServiceOptions((prev) => {
      const updated = [...prev];
      updated[editServiceIndex] = value;
      return updated;
    });

    if (selectedService === customServiceOptions[editServiceIndex]) {
      setSelectedService(value);
    }

    setEditServiceInput("");
    setEditServiceIndex(null);
    setIsEditServiceDialogOpen(false);
  };

  const openActionEdit = (pm2Name: string, serviceName: string) => {
    setActionEditPm2Name(pm2Name);
    setActionEditServiceName(serviceName);
    setIsActionEditOpen(true);
  };

  const saveActionServiceName = async () => {
    const serviceDefinition = actionEditServiceName.trim();
    if (!actionEditPm2Name || !serviceDefinition) return;

    try {
      setIsSavingActionEdit(true);
      await serviceHealthApi.editServiceName({
        pm2Name: actionEditPm2Name,
        serviceDefinition,
      });
      setIsActionEditOpen(false);
      setActionEditPm2Name("");
      setActionEditServiceName("");
      await refreshHealth();
      toast.success("Service name updated.", { duration: 2500 });
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Failed to update service name.";
      toast.error(message, { duration: 3000 });
    } finally {
      setIsSavingActionEdit(false);
    }
  };

  const requestDeleteConfiguredService = (pm2Name: string, name: string) => {
    setDeleteConfirmService({ pm2Name, name });
  };

  const deleteConfiguredService = async () => {
    if (!deleteConfirmService) return;

    const { pm2Name } = deleteConfirmService;

    try {
      setDeletingService(pm2Name);
      await serviceHealthApi.deleteService(pm2Name);
      setDeleteConfirmService(null);
      await refreshHealth();
      toast.success("Service deleted.", { duration: 2500 });
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Failed to delete service.";
      toast.error(message, { duration: 3000 });
    } finally {
      setDeletingService(null);
    }
  };

  const deleteCustomPm2ServiceOption = (index: number) => {
    setCustomPm2ServiceOptions((prev) => prev.filter((_, i) => i !== index));
    if (selectedPm2Service === customPm2ServiceOptions[index]) {
      setSelectedPm2Service("");
    }
  };

  const displayServices = useMemo(() => {
    return (health?.services ?? []).map((service) => {
      const pm2Name = service.pm2Name || service.name;
      const isApi = service.type === "api";
      return {
        name: service.name,
        status: service.status,
        statusCode: service.statusCode,
        responseTimeMs: service.responseTimeMs,
        lastChecked: formatCheckedAt(service.lastChecked),
        uptime: service.uptime,
        canRestart: true,
        pm2Name,
        icon: getServiceIcon(service.name),
        isApi,
        cpu: service.cpu,
        memoryMB: service.memoryMB,
        restarts: service.restarts,
      };
    });
  }, [health]);

  const healthy = displayServices.filter((s) => s.status === "healthy").length;
  const degraded = displayServices.filter((s) => s.status === "degraded").length;
  const down = displayServices.filter((s) => s.status === "down").length;
  // const hung = displayServices.filter((s) => s.status === "hung").length;

  if (isInitialLoading) {
    return <ServiceHealthSkeleton />;
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Service Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last checked:{" "}
            {health ? formatCheckedAt(health.checkedAt) : "Today 10:30 AM"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 border border-border bg-card text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            onClick={() => setIsConfigureOpen(true)}
          >
            <Settings className="w-4 h-4" />
            Configure
          </button>
          <button
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            onClick={checkAllServices}
            disabled={isLoading}
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Checking" : "Check All"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Server}
          label="Total Services"
          value={String(displayServices.length)}
        />
        <MetricCard
          icon={Activity}
          label="Healthy"
          value={String(healthy)}
          changeType="positive"
          change="Running normally"
        />
        <MetricCard
          icon={Clock}
          label="Degraded"
          value={String(degraded)}
          changeType="negative"
          change="Slow response"
        />
        <MetricCard
          icon={Activity}
          label="Down"
          value={String(down)}
          changeType="negative"
          change="Needs attention"
        />
      </div>

      <ResponseTimeTrendsReal services={displayServices} />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="min-w-max w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Service
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Status
              </th>
              {/* Response Time Tab*/}
              {/* <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Response
              </th> */}
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Last Checked
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Uptime
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                CPU
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Memory
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Restarts
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayServices.map((svc) => {
              const Icon = svc.icon;
              return (
                <tr
                  key={svc.name}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-medium text-foreground cursor-default">
                              {svc.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{svc.pm2Name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={svc.status} />
                      {svc.isApi && svc.statusCode ? (
                        <span className="text-xs font-mono text-muted-foreground">
                          {svc.statusCode}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {/* Response Time Tab*/}
                  {/* <td className="px-5 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                    {svc.responseTimeMs}
                  </td> */}
                  <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {svc.lastChecked}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                    {svc.uptime}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                    {formatZero(svc.cpu)}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                    {svc.memoryMB === "0 MB" || svc.memoryMB === "0" ? "-" : svc.memoryMB}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                    {formatZero(svc.restarts)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <button
                      className="text-xs text-primary hover:underline disabled:opacity-60"
                      onClick={() => checkService(svc.pm2Name)}
                      disabled={checkingService === svc.pm2Name || isLoading}
                    >
                      {checkingService === svc.pm2Name ? "Checking" : "Check"}
                    </button>
                    {!svc.isApi && (
                      <>
                        <button
                          className="text-xs text-red-500 hover:underline ml-3 disabled:opacity-60"
                          onClick={() => requestStop(svc.pm2Name)}
                          disabled={stoppingService === svc.pm2Name}
                        >
                          {stoppingService === svc.pm2Name ? "Stopping" : "Stop"}
                        </button>
                        <button
                          className="text-xs text-amber-500 hover:underline ml-3 disabled:opacity-60"
                          onClick={() => requestRestart(svc.pm2Name)}
                          disabled={restartingService === svc.pm2Name}
                        >
                          {restartingService === svc.pm2Name
                            ? "Restarting"
                            : "Restart"}
                        </button>
                      </>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex items-center justify-center ml-3 text-muted-foreground hover:text-foreground disabled:opacity-60"
                          disabled={deletingService === svc.pm2Name}
                          aria-label={`Open settings for ${svc.name}`}
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-40 rounded-lg border-border bg-card p-2 text-foreground shadow-xl"
                      >
                        <DropdownMenuItem
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground focus:bg-muted focus:text-foreground"
                          onClick={() => openActionEdit(svc.pm2Name, svc.name)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => requestDeleteConfiguredService(svc.pm2Name, svc.name)}
                          disabled={deletingService === svc.pm2Name}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingService === svc.pm2Name ? "Deleting" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={isConfigureOpen} onOpenChange={setIsConfigureOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Configure Service Health
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Select the process type and configure the service health check.
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Type Selection */}
            <div className="border-l-4 border-l-emerald-500 pl-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Select Type
                  </h3>
                </div>
              </div>
              <Select value={selectedType} onValueChange={(v) => setSelectedType(v as "pm2" | "api")}>
                <SelectTrigger className="border-border bg-background w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pm2">PM2</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* HealthURL (PM2 only) */}
            {selectedType === "pm2" && 
            (
              <div className="border-l-4 border-l-cyan-500 pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Health URL (check deadlocks)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional health endpoint for deadlock detection
                    </p>
                  </div>
                </div>
                <div>
                    <Input
                      type="text"
                      placeholder="https://sandbox.vmmaps.com/osmValidator/health"
                      value={healthUrl}
                      onChange={(e) => setHealthUrl(e.target.value)}
                      className="border-border bg-background text-foreground"
                    />
                  </div>
                  
              </div>
            )}

            {/* Server Node Section (PM2 only) */}
            {selectedType === "pm2" && 
            (
              <div className="border-l-4 border-l-primary pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Server Node
                    </h3>
                  </div>
                </div>
                <Select value={selectedServer} onValueChange={setSelectedServer}>
                  <SelectTrigger className="border-border bg-background w-full">
                    <SelectValue
                      placeholder={
                        isLoadingServers
                          ? "Loading servers..."
                          : "Select a server"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem key={server._id} value={server.name}>
                        {server.name} ({server.environment})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Select the physical or virtual host providing the environment.
                </p>
              </div>
            )}

            {/* Service Definition Section */}
            <div className="border-l-4 border-l-cyan-500 pl-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Service Definition
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Linked Service
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-cyan-500 hover:underline font-medium"
                  onClick={() => setIsServiceDialogOpen(true)}
                >
                  + Add Service
                </button>
              </div>

              {customServiceOptions.length > 0 ? (
                <div className="space-y-2">
                  {customServiceOptions.map((service, index) => (
                    <div
                      key={`${service}-${index}`}
                      className={`flex items-center justify-between gap-4 border rounded px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selectedService === service
                          ? "border-cyan-500 bg-cyan-500/10 text-foreground"
                          : "border-border bg-muted/30 text-foreground hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedService(service)}
                    >
                      <span>{service}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditServiceIndex(index);
                            setEditServiceInput(service);
                            setIsEditServiceDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No services added yet.
                </p>
              )}
            </div>

            {/* PM2 Process Fields (PM2 only) */}
            {selectedType === "pm2" && (
              <div className="border-l-4 border-l-emerald-500 pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Process Management
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      PM2 Process Name
                    </p>
                  </div>
                </div>
                <Select
                  value={selectedPm2Service}
                  onValueChange={(value) => {
                    if (!selectedServer) {
                      alert("Please select a server first");
                      return;
                    }
                    setSelectedPm2Service(value);
                  }}
                >
                  <SelectTrigger className="border-border bg-background w-full">
                    <SelectValue placeholder="Select PM2 process" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPm2ServiceOptions.map((service) => (
                      <SelectItem key={service} value={service}>
                        {service}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  {!selectedServer
                    ? "Select a server first to choose a PM2 process."
                    : "Select the PM2 process associated with this service."}
                </p>

                {/* {customPm2ServiceOptions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Custom processes:
                    </p>
                    {customPm2ServiceOptions.map((service, index) => (
                      <div
                        key={`${service}-${index}`}
                        className="flex items-center justify-between gap-4 bg-muted/30 border border-border rounded px-3 py-2 text-sm text-foreground"
                      >
                        <span>{service}</span>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline"
                          onClick={() => deleteCustomPm2ServiceOption(index)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )} */}
              </div>
            )}

            {/* API Fields (API only) */}
            {selectedType === "api" && (
              <div className="border-l-4 border-l-emerald-500 pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      API Configuration
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Endpoint Details
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1 block">
                      API URL
                    </label>
                    <Input
                      type="text"
                      placeholder="https://api.example.com/health"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      className="border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 block">
                        Method
                      </label>
                      <Select value={apiMethod} onValueChange={setApiMethod}>
                        <SelectTrigger className="border-border bg-background w-full">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1 block">
                        Timeout (ms)
                      </label>
                      <Input
                        type="text"
                        placeholder="5000"
                        value={apiTimeout}
                        onChange={(e) => setApiTimeout(e.target.value)}
                        className="border-border bg-background text-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1 block">
                      Headers (JSON)
                    </label>
                    <textarea
                      placeholder='{"Authorization": "Bearer token"}'
                      value={apiHeaders}
                      onChange={(e) => setApiHeaders(e.target.value)}
                      className="w-full border border-border bg-background text-foreground rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1 block">
                      Query Params (JSON)
                    </label>
                    <textarea
                      placeholder='{"key": "value"}'
                      value={apiQueryParams}
                      onChange={(e) => setApiQueryParams(e.target.value)}
                      className="w-full border border-border bg-background text-foreground rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground mb-1 block">
                      Body (JSON)
                    </label>
                    <textarea
                      placeholder='{"data": "value"}'
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      className="w-full border border-border bg-background text-foreground rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-y"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-l-4 border-l-amber-500 pl-4">
            <h3 className="text-sm font-medium text-foreground mb-1">
              Mail To
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Select recipients for service health alerts.
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm">
                  {selectedMailToList.length === 0 ? (
                    <span className="text-muted-foreground">
                      {users.length === 0 ? "Loading users..." : "Select users"}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {selectedMailToList.map((email) => (
                        <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                          {email}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMailToList((prev) => prev.filter((e) => e !== email));
                            }}
                            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 leading-none px-0.5"
                          >
                            &times;
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-2" align="start">
                <div className="space-y-1">
                  {users.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">No users found</p>
                  ) : (
                    users.map((user) => {
                      const checked = selectedMailToList.includes(user.email);
                      return (
                        <label
                          key={user.id || user.email}
                          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              setSelectedMailToList((prev) =>
                                checked
                                  ? prev.filter((e) => e !== user.email)
                                  : [...prev, user.email]
                              );
                            }}
                          />
                          <span>{user.name} ({user.email})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter className="mt-6 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() =>{ 
                setSelectedServer("");
                setSelectedService("");
                setSelectedPm2Service("");
                setPm2Names([]);
                setCustomServiceOptions([]);
                setCustomPm2ServiceOptions([]);
                setExistingServiceDefinitions([]);
                setSelectedType("pm2");
                setHealthUrl("");
                setApiUrl("");
                setApiMethod("GET");
                setApiTimeout("5000");
                setApiHeaders("");
                setApiQueryParams("");
                setApiBody("");
                setSelectedMailToList([]);
                setIsConfigureOpen(false);
              }}
              className="mr-2"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmConfiguration}
              disabled={!isConfigureReady}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Add Custom Service Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="text"
              placeholder="Enter service name"
              value={newServiceInput}
              onChange={(e) => setNewServiceInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomServiceOption()}
              className="border-border bg-background text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={addCustomServiceOption}
              disabled={!newServiceInput.trim()}
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditServiceDialogOpen}
        onOpenChange={setIsEditServiceDialogOpen}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Edit Service Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="text"
              placeholder="Enter service name"
              value={editServiceInput}
              onChange={(e) => setEditServiceInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && editCustomServiceOption()
              }
              className="border-border bg-background text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={editCustomServiceOption}
              disabled={!editServiceInput.trim()}
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPm2DialogOpen} onOpenChange={setIsPm2DialogOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Add Custom PM2 Service Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="text"
              placeholder="Enter PM2 service name"
              value={newPm2ServiceInput}
              onChange={(e) => setNewPm2ServiceInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && addCustomPm2ServiceOption()
              }
              className="border-border bg-background text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={addCustomPm2ServiceOption}
              disabled={!newPm2ServiceInput.trim()}
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isActionEditOpen} onOpenChange={setIsActionEditOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Edit Service Name
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Update the service definition name shown in Service Health.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Service Definition Name
            </label>
            <Input
              type="text"
              placeholder="Enter service name"
              value={actionEditServiceName}
              onChange={(e) => setActionEditServiceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveActionServiceName()}
              className="border-border bg-background text-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsActionEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveActionServiceName}
              disabled={!actionEditServiceName.trim() || isSavingActionEdit}
            >
              {isSavingActionEdit ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteConfirmService}
        onOpenChange={(open) => {
          if (!open && !deletingService) setDeleteConfirmService(null);
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Delete Service
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <strong className="text-foreground">
                {deleteConfirmService?.name}
              </strong>
              ? This will remove the complete service configuration from the database.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmService(null)}
              disabled={!!deletingService}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteConfiguredService}
              disabled={!!deletingService}
            >
              {deletingService ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {confirmAction === "restart" ? "Restart" : "Stop"} Service
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to {confirmAction}{" "}
              <strong className="text-foreground">{confirmServiceName}</strong>?
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmAction === "stop" ? "destructive" : "default"}
              onClick={confirmThenExecute}
            >
              {confirmAction === "restart" ? "Restart" : "Stop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}