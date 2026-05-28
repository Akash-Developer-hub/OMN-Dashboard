import { useState, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { MapPin, Loader2, X } from "lucide-react";
import ADMap from "@/components/ADMap";
import POISearchBar from "@/components/search/POISearchBar";
import type { SearchItem } from "@/components/search/AdminSearchRequest";
import { Button } from "@/components/ui/button";

export interface PickedPlace {
  name: string;
  f_id: string;
  lat: number;
  lng: number;
  category?: string;
  area?: string;
  address?: string;
}

interface PlacePickerProps {
  /** Initial map center [lat, lng] */
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  /** Called when user confirms selection */
  onSelect: (place: PickedPlace) => void;
  onCancel?: () => void;
}

const ABU_DHABI: [number, number] = [24.463050376878368, 54.37751337987654];

export default function PlacePicker({
  center = ABU_DHABI,
  zoom = 12,
  height = 400,
  onSelect,
  onCancel,
}: PlacePickerProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const handleFeaturePick = useCallback(
    (_feature: any | null, lngLat: { lng: number; lat: number }) => {
      const { lat, lng } = lngLat;
      const name =
        _feature?.properties?.name ||
        _feature?.properties?.NAME ||
        _feature?.properties?.place_name ||
        "";
      const rawFid =
        _feature?.properties?.f_id ||
        _feature?.properties?.fid ||
        _feature?.properties?.F_ID ||
        "";
      const f_id = rawFid.replace(/[{}]/g, "");
      const category = _feature?.properties?.class || "";
      const address = _feature?.properties?.address || _feature?.properties?.street_name || "";

      setPicked({ name, f_id, lat, lng, category, address });
      setLoading(false);
    },
    []
  );

  const handlePlaceSelect = useCallback(
    (item: SearchItem) => {
      const pos = item.pos;
      if (!pos || pos.length < 2) return;
      const [lon, lat] = pos;

      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lon, lat], zoom: 16, duration: 1000 });
      } else {
        setMapCenter([lat, lon]);
      }

      const label = item.primaryText || item.place_name?.[0] || item.name?.[0] || "";
      // Extract f_id from info field if available
      const infoStr = (item.info as string) || "";
      const fidMatch = infoStr.match(/f_id[:\s]*"([^"]+)"/i);
      const f_id = (fidMatch?.[1] ?? "").replace(/[{}]/g, "");
      const category = item.category?.[0] || "";
      const address = Array.isArray(item.address) ? item.address[0] || "" : item.address || "";

      setPicked({ name: label, f_id, lat, lng: lon, category, address });
      setLoading(false);
    },
    []
  );

  const handleConfirm = () => {
    if (picked) onSelect(picked);
  };

  const handleClear = () => {
    setPicked(null);
  };

  return (
    <div className="space-y-3">
      {/* Map + Search */}
      <div className="relative rounded-xl border border-border overflow-hidden">
        <ADMap
          center={mapCenter}
          zoom={zoom}
          height={height}
          onMapReady={handleMapReady}
          onFeaturePick={handleFeaturePick}
        />

        {/* Search overlay */}
        <div className="absolute top-2 left-2 right-2 z-[1000]">
          <POISearchBar
            onSearchChange={() => {}}
            onPlaceSelect={handlePlaceSelect}
            autoSelectFirst
            placeholder="Search for a place..."
          />
        </div>

        {/* Selected place overlay */}
        {picked && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="w-[85%] max-w-xs rounded-xl border border-border bg-card shadow-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  {loading
                    ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    : <MapPin className="w-4 h-4 text-primary" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {picked.name || "Unnamed location"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
                  </p>
                  {picked.f_id && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
                      f_id: {picked.f_id}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handleConfirm} className="flex-1" size="sm">
                  Select Place
                </Button>
                {onCancel && (
                  <Button type="button" variant="outline" onClick={onCancel} size="sm">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hint text when nothing selected */}
      {!picked && (
        <p className="text-xs text-muted-foreground text-center">
          Click on the map or search to select a place
        </p>
      )}
    </div>
  );
}
