import { useCallback, useRef, useState } from "react";
import { MapPin, Globe, AlertTriangle, ArrowDown, ArrowUp, Flame, CircleDot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ADMap from "@/components/ADMap";
import maplibregl from "maplibre-gl";
import type { RegionItem, CityItem, HeatmapPoint } from "./types";

type MapMode = "markers" | "heatmap";

// Abu Dhabi emirate bounds
const ABU_DHABI_BOUNDS: [[number, number], [number, number]] = [[54.0, 24.0], [55.0, 24.65]];
const ABU_DHABI_CENTER: [number, number] = [24.4539, 54.3773];
const CONTRIBUTIONS_SOURCE_ID = "insight-contributions-source";
const CONTRIBUTIONS_HEAT_LAYER_ID = "insight-contributions-heat";
const CONTRIBUTIONS_POINTS_LAYER_ID = "insight-contributions-points";

interface InsightGeographicProps {
  regionRanking: RegionItem[];
  cityRanking: CityItem[];
  heatmapPoints: HeatmapPoint[];
  highestContributionRegion: RegionItem | null;
  mostPendingRegion: RegionItem | null;
  lowestContributionRegions: RegionItem[];
  loading: boolean;
}

type ViewMode = "region" | "city";

function StatusBar({ approved, pending, rejected, total }: { approved: number; pending: number; rejected: number; total: number }) {
  if (total === 0) return <div className="h-1.5 bg-muted rounded-full" />;
  const ap = (approved / total) * 100;
  const pp = (pending / total) * 100;
  const rp = (rejected / total) * 100;
  return (
    <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-muted">
      <div className="bg-emerald-500 transition-all" style={{ width: `${ap}%` }} />
      <div className="bg-amber-500 transition-all" style={{ width: `${pp}%` }} />
      <div className="bg-red-500 transition-all" style={{ width: `${rp}%` }} />
    </div>
  );
}

export function InsightGeographic({
  regionRanking, cityRanking, heatmapPoints,
  highestContributionRegion, mostPendingRegion, lowestContributionRegions, loading,
}: InsightGeographicProps) {
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("region");
  const [mapMode, setMapMode] = useState<MapMode>("markers");

  const applyMapLayer = useCallback((map: maplibregl.Map, mode: MapMode) => {
    if (map.getLayer(CONTRIBUTIONS_HEAT_LAYER_ID)) {
      map.removeLayer(CONTRIBUTIONS_HEAT_LAYER_ID);
    }
    if (map.getLayer(CONTRIBUTIONS_POINTS_LAYER_ID)) {
      map.removeLayer(CONTRIBUTIONS_POINTS_LAYER_ID);
    }
    if (map.getSource(CONTRIBUTIONS_SOURCE_ID)) {
      map.removeSource(CONTRIBUTIONS_SOURCE_ID);
    }

    if (heatmapPoints.length === 0) return;

    const featureCollection = {
      type: "FeatureCollection",
      features: heatmapPoints.map((point) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.lng, point.lat],
        },
        properties: {
          status: Number(point.status),
          weight: 1,
        },
      })),
    } as const;

    map.addSource(CONTRIBUTIONS_SOURCE_ID, {
      type: "geojson",
      data: featureCollection as any,
    });

    if (mode === "heatmap") {
      map.addLayer({
        id: CONTRIBUTIONS_HEAT_LAYER_ID,
        type: "heatmap",
        source: CONTRIBUTIONS_SOURCE_ID,
        maxzoom: 14,
        paint: {
          "heatmap-weight": ["coalesce", ["get", "weight"], 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 14, 1.4],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 12, 20, 14, 26],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.45, 14, 0.8],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(59,130,246,0)",
            0.2,
            "#3b82f6",
            0.4,
            "#22c55e",
            0.6,
            "#f59e0b",
            0.8,
            "#f97316",
            1,
            "#ef4444",
          ],
        },
      });
    } else {
      map.addLayer({
        id: CONTRIBUTIONS_POINTS_LAYER_ID,
        type: "circle",
        source: CONTRIBUTIONS_SOURCE_ID,
        paint: {
          "circle-color": [
            "match",
            ["to-number", ["get", "status"]],
            1,
            "#22c55e",
            0,
            "#f59e0b",
            2,
            "#ef4444",
            "#3b82f6",
          ],
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6,
          "circle-opacity": 0.95,
        },
      });
    }

    map.fitBounds(ABU_DHABI_BOUNDS, { padding: 30, duration: 0 });
  }, [heatmapPoints]);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapInstanceRef.current = map;
    applyMapLayer(map, mapMode);
  }, [applyMapLayer, mapMode]);

  const toggleMapMode = useCallback((mode: MapMode) => {
    setMapMode(mode);
    if (mapInstanceRef.current) {
      applyMapLayer(mapInstanceRef.current, mode);
    }
  }, [applyMapLayer]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[400px] rounded-lg lg:col-span-2" />
          <Skeleton className="h-[400px] rounded-lg" />
        </div>
      </div>
    );
  }

  const currentData = viewMode === "region"
    ? regionRanking.map((r) => ({ name: r.region, ...r }))
    : cityRanking.map((c) => ({ name: c.city, total: c.total, approved: c.approved, pending: c.pending, rejected: c.rejected }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Geographic Insights
        </h2>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          <Button variant={viewMode === "region" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setViewMode("region")}>
            By Region
          </Button>
          <Button variant={viewMode === "city" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setViewMode("city")}>
            By City
          </Button>
        </div>
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {highestContributionRegion && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-500 uppercase">Highest Contributions</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{highestContributionRegion.region}</p>
            <p className="text-xs text-muted-foreground">{highestContributionRegion.total} total contributions</p>
          </div>
        )}
        {mostPendingRegion && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-amber-500 uppercase">Most Pending</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{mostPendingRegion.region}</p>
            <p className="text-xs text-muted-foreground">{mostPendingRegion.pending} pending items</p>
          </div>
        )}
        {lowestContributionRegions.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDown className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-red-500 uppercase">Coverage Gaps</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {lowestContributionRegions.map((r) => r.region).join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">Lowest contribution regions</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Contribution Density Map
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5 bg-muted/50 rounded p-0.5">
                <button
                  onClick={() => toggleMapMode("markers")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    mapMode === "markers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CircleDot className="w-3 h-3" /> Markers
                </button>
                <button
                  onClick={() => toggleMapMode("heatmap")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    mapMode === "heatmap" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Flame className="w-3 h-3" /> Heatmap
                </button>
              </div>
              {mapMode === "markers" && [
                { color: "#22c55e", label: "Approved" },
                { color: "#f59e0b", label: "Pending" },
                { color: "#ef4444", label: "Rejected" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
              <span className="text-[10px] text-muted-foreground">{heatmapPoints.length} points</span>
            </div>
          </div>
          <ADMap
            center={ABU_DHABI_CENTER}
            zoom={10}
            height={400}
            className="rounded-none"
            onMapReady={handleMapReady}
          />
        </div>

        {/* Region/City ranking table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">
              {viewMode === "region" ? "Region" : "City"} Ranking
            </h3>
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {currentData.length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center">No data available</p>
            )}
            {currentData.map((item, i) => (
              <div key={item.name} className="px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-5">#{i + 1}</span>
                    <span className="text-sm font-medium text-foreground truncate max-w-[140px]">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{item.total}</span>
                </div>
                <StatusBar approved={item.approved} pending={item.pending} rejected={item.rejected} total={item.total} />
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-emerald-500">{item.approved} approved</span>
                  <span className="text-[10px] text-amber-500">{item.pending} pending</span>
                  <span className="text-[10px] text-red-500">{item.rejected} rejected</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
