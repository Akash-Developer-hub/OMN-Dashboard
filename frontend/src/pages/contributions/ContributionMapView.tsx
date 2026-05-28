import { useEffect, useRef, useMemo } from "react";
import type { ApiContribution } from "./ContributionTable";
import maplibregl from "maplibre-gl";
import ADMap from "@/components/ADMap";

const statusColor: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  modified: "#3b82f6",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  modified: "Modified",
};

function resolveStatus(s: string | number): string {
  const map: Record<string | number, string> = { 0: "pending", 1: "approved", 2: "rejected", 3: "modified" };
  return map[s] ?? String(s);
}

export function ContributionMapView({ contributions, onSelect, onClose }: {
  contributions: ApiContribution[];
  onSelect: (c: ApiContribution) => void;
  onClose?: () => void;
}) {
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const mapped = useMemo(
    () => contributions.filter(c => c.location?.lat && c.location?.lng).slice(0, 500),
    [contributions]
  );

  const plotContributions = (map: maplibregl.Map) => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    mapped.forEach((contribution) => {
      const status = resolveStatus(contribution.status);
      const color = statusColor[status] || "#64748b";

      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.style.width = "10px";
      markerElement.style.height = "10px";
      markerElement.style.borderRadius = "9999px";
      markerElement.style.border = "2px solid white";
      markerElement.style.background = color;
      markerElement.style.boxShadow = `0 0 6px ${color}88`;
      markerElement.style.cursor = "pointer";

      const tooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "leaflet-rc-tooltip",
        offset: 14,
      })
        .setLngLat([contribution.location!.lng, contribution.location!.lat])
        .setHTML(`<div style="font-size:11px;max-width:220px">
            <strong>${contribution.basicInfo?.name || contribution.osm_id || "—"}</strong><br/>
            <span style="opacity:0.8">${contribution.category || "—"} · ${contribution.address?.city || "—"}</span><br/>
            <span style="color:${color};font-weight:600">${statusLabel[status] || status}</span>
            ${contribution.priority ? ` · <span style="opacity:0.7">${contribution.priority}</span>` : ""}
          </div>`);

      markerElement.addEventListener("mouseenter", () => tooltip.addTo(map));
      markerElement.addEventListener("mouseleave", () => tooltip.remove());
      markerElement.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectRef.current?.(contribution);
        onClose?.();
      });

      const marker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([contribution.location!.lng, contribution.location!.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (mapped.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      mapped.forEach((contribution) => bounds.extend([contribution.location!.lng, contribution.location!.lat]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 7, duration: 0 });
      }
    }
  };

  const handleMapReady = (map: maplibregl.Map) => {
    mapInstance.current = map;
    plotContributions(map);
  };

  useEffect(() => {
    if (!mapInstance.current) return;
    plotContributions(mapInstance.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapped, onClose]);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-lg px-4 py-2">
        <span className="text-xs text-muted-foreground font-medium">Status:</span>
        {Object.entries(statusColor).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-foreground capitalize">{statusLabel[status]}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Showing {mapped.length} of {contributions.length}</span>
      </div>

      <ADMap center={[24.4539, 54.3773]} zoom={7} height={520} className="w-full rounded-lg border border-border" onMapReady={handleMapReady} />
    </div>
  );
}
