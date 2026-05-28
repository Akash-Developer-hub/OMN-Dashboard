import { useEffect, useId, useRef, useState } from "react";
import maplibregl, { type MapGeoJSONFeature, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapStyleUrl from "@/config/map/style.json?url";

const ABU_DHABI: [number, number] = [24.463050376878368, 54.37751337987654];

type PickedFeature = MapGeoJSONFeature & {
  sourceLayer?: string;
};

function isRoadClosureFeature(feature: PickedFeature) {
  const layerId = feature?.layer?.id || "";
  const sourceId = String(feature?.source || "");
  const sourceLayer = String(feature?.sourceLayer || "");
  const cls = String(feature?.properties?.class || "");
  const closureType = String(feature?.properties?.CLOSURE_TYPE || "");
  const hasEventName = Boolean(feature?.properties?.EVENT_NAME);

  return (
    /roadclosure|road[_-]?closure|roadblock/i.test(layerId) ||
    /roadclosure|road[_-]?closure|roadblock/i.test(sourceId) ||
    /roadclosure|road[_-]?closure|roadblock/i.test(sourceLayer) ||
    /roadblock|closure/i.test(cls) ||
    /road_closed|partial|closure/i.test(closureType) ||
    hasEventName
  );
}

function isBusStopFeature(feature: PickedFeature) {
  const layerId = feature?.layer?.id || "";
  const sourceLayer = String(feature?.sourceLayer || "");
  const cls = String(feature?.properties?.class || "");
  const subclass = String(feature?.properties?.subclass || "");

  return (
    /bus[_-]?stop|busstop/i.test(layerId) ||
    /bus[_-]?stop|busstop/i.test(sourceLayer) ||
    cls === "bus" ||
    subclass === "bus_stop"
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFallbackStyle() {
  return {
    version: 8,
    name: "admin-fallback-style",
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

interface SharedMapEntry {
  map: maplibregl.Map;
  container: HTMLDivElement;
}

const sharedMaps: Record<string, SharedMapEntry> = {};

export default function ADMap({
  center = ABU_DHABI,
  zoom = 15,
  maxZoom,
  height = 600,
  className = '',
  onMapReady,
  onBusStopClick,
  onFeaturePick,
  sharedKey,
}: {
  center?: [number, number];
  zoom?: number;
  maxZoom?: number;
  height?: number | string;
  className?: string;
  onMapReady?: (map: maplibregl.Map) => void;
  onBusStopClick?: (data: { osmID: string }) => void;
  onFeaturePick?: (feature: any | null, lngLat: { lng: number; lat: number }) => void;
  sharedKey?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const roadClosurePopupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let destroyed = false;
    let localMap: maplibregl.Map | null = null;
    let container: HTMLDivElement | null = null;

    // Track resources for this component instance
    const localListeners = new Set<{ type: string; args: any[] }>();
    const localSources = new Set<string>();
    const localLayers = new Set<string>();

    const init = async () => {
      let mapInstance: maplibregl.Map;
      let containerElement: HTMLDivElement;

      if (sharedKey) {
        // Shared Map Case
        if (!sharedMaps[sharedKey]) {
          // Create the persistent container
          containerElement = document.createElement("div");
          containerElement.style.width = "100%";
          containerElement.style.height = "100%";

          let styleJson: any = null;
          try {
            const response = await fetch(mapStyleUrl, { cache: "force-cache" });
            if (response.ok) {
              styleJson = await response.json();
            }
          } catch {
            // Ignore style fetch errors
          }

          if (destroyed) return;

          mapInstance = new maplibregl.Map({
            container: containerElement,
            style: styleJson ?? buildFallbackStyle(),
            center: [center[1], center[0]],
            zoom,
            attributionControl: false,
            ...(maxZoom != null && { maxZoom }),
          });

          mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
          mapInstance.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

          sharedMaps[sharedKey] = { map: mapInstance, container: containerElement };
        } else {
          mapInstance = sharedMaps[sharedKey].map;
          containerElement = sharedMaps[sharedKey].container;
        }
      } else {
        // Non-shared Map Case (Standard)
        containerElement = document.createElement("div");
        containerElement.style.width = "100%";
        containerElement.style.height = "100%";

        let styleJson: any = null;
        try {
          const response = await fetch(mapStyleUrl, { cache: "force-cache" });
          if (response.ok) {
            styleJson = await response.json();
          }
        } catch {
          // Ignore
        }

        if (destroyed) return;

        mapInstance = new maplibregl.Map({
          container: containerElement,
          style: styleJson ?? buildFallbackStyle(),
          center: [center[1], center[0]],
          zoom,
          attributionControl: false,
          ...(maxZoom != null && { maxZoom }),
        });

        mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        mapInstance.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
      }

      if (destroyed) {
        if (!sharedKey) {
          mapInstance.remove();
        }
        return;
      }

      localMap = mapInstance;
      container = containerElement;

      // Append container to wrapper
      wrapper.appendChild(containerElement);
      mapRef.current = mapInstance;

      // Create Proxy for safe cleanup
      const mapProxy = new Proxy(mapInstance, {
        get(target, prop, receiver) {
          if (prop === "on" || prop === "once") {
            return (type: string, ...args: any[]) => {
              localListeners.add({ type, args });
              return target[prop](type, ...args);
            };
          }
          if (prop === "off") {
            return (type: string, ...args: any[]) => {
              for (const item of localListeners) {
                if (item.type === type && item.args[0] === args[0]) {
                  localListeners.delete(item);
                  break;
                }
              }
              return target.off(type, ...args);
            };
          }
          if (prop === "addSource") {
            return (id: string, options: any) => {
              localSources.add(id);
              return target.addSource(id, options);
            };
          }
          if (prop === "removeSource") {
            return (id: string) => {
              localSources.delete(id);
              return target.removeSource(id);
            };
          }
          if (prop === "addLayer") {
            return (layer: any, beforeId?: string) => {
              localLayers.add(layer.id);
              return target.addLayer(layer, beforeId);
            };
          }
          if (prop === "removeLayer") {
            return (id: string) => {
              localLayers.delete(id);
              return target.removeLayer(id);
            };
          }

          const val = Reflect.get(target, prop, receiver);
          return typeof val === "function" ? val.bind(target) : val;
        },
      });

      setMapReadyVersion((v) => v + 1);

      const triggerMapReady = () => {
        if (destroyed) return;
        onMapReadyRef.current?.(mapProxy);
        requestAnimationFrame(() => {
          try {
            mapInstance.resize();
          } catch {
            // Ignore
          }
        });
      };

      if (mapInstance.loaded()) {
        triggerMapReady();
      } else {
        mapInstance.once("load", triggerMapReady);
      }
    };

    void init();

    return () => {
      destroyed = true;

      // 1. Remove click handlers and popups of ADMap itself
      if (roadClosurePopupRef.current) {
        try {
          roadClosurePopupRef.current.remove();
        } catch {
          // Ignore
        }
        roadClosurePopupRef.current = null;
      }

      // 2. Clean up proxy listeners
      for (const item of localListeners) {
        try {
          localMap?.off(item.type, ...item.args);
        } catch {
          // Ignore
        }
      }

      // 3. Clean up proxy layers (reverse order)
      const layersArray = Array.from(localLayers).reverse();
      for (const layerId of layersArray) {
        try {
          if (localMap?.getLayer(layerId)) {
            localMap.removeLayer(layerId);
          }
        } catch {
          // Ignore
        }
      }

      // 4. Clean up proxy sources
      for (const sourceId of localSources) {
        try {
          if (localMap?.getSource(sourceId)) {
            localMap.removeSource(sourceId);
          }
        } catch {
          // Ignore
        }
      }

      // 5. DOM and instance cleanup
      if (container) {
        try {
          container.remove();
        } catch {
          // Ignore
        }
      }

      if (localMap && !sharedKey) {
        try {
          localMap.remove();
        } catch {
          // Ignore
        }
      }

      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (event: MapMouseEvent) => {
      if ((event.originalEvent as MouseEvent | undefined)?.button === 2) return;

      const rendered = map.queryRenderedFeatures(event.point) as PickedFeature[];
      const feature = rendered[0] ?? null;
      onFeaturePick?.(feature ?? null, { lng: event.lngLat.lng, lat: event.lngLat.lat });

      const roadClosure = rendered.find((item) => isRoadClosureFeature(item));
      if (roadClosure) {
        const properties = roadClosure.properties || {};
        const closureType = String(properties.CLOSURE_TYPE || "").toUpperCase();
        const isFull =
          closureType === "ROAD_CLOSED" ||
          properties.IS_FULL_CLOSURE === "1" ||
          properties.IS_FULL_CLOSURE === 1 ||
          properties.IS_FULL_CLOSURE === true;

        const typeLabel = isFull ? "Full Closure" : "Partial Closure";
        const badge = isFull
          ? `<span class="rc-badge rc-badge--full">⛔ ${typeLabel}</span>`
          : `<span class="rc-badge rc-badge--partial">⚠️ ${typeLabel}</span>`;

        const title = escapeHtml(properties.EVENT_NAME || "Road Closure");
        const description = escapeHtml(properties.DESCRIPTION || "");
        const closureTypeLabel = escapeHtml(properties.CLOSURE_TYPE || "");

        const html = `
          <div class="rc-popup">
            <div class="rc-popup__header">${badge}</div>
            <div class="rc-popup__title">${title}</div>
            ${description ? `<div class="rc-popup__desc">${description}</div>` : ""}
            ${closureTypeLabel ? `<div class="rc-popup__meta">Type: <strong>${closureTypeLabel}</strong></div>` : ""}
          </div>`;

        if (roadClosurePopupRef.current) {
          roadClosurePopupRef.current.remove();
        }

        roadClosurePopupRef.current = new maplibregl.Popup({
          className: "rc-maplibre-popup",
          maxWidth: "300px",
          closeButton: true,
          closeOnClick: true,
        })
          .setLngLat(event.lngLat)
          .setHTML(html)
          .addTo(map);

        return;
      }

      const busStop = rendered.find((item) => isBusStopFeature(item));
      if (busStop) {
        const osmId =
          busStop.properties?.osmID ?? busStop.properties?.osm_id ?? busStop.properties?.stop_id;
        if (osmId != null) {
          onBusStopClick?.({ osmID: String(osmId) });
        }
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [mapReadyVersion, onBusStopClick, onFeaturePick]);

  const prevCenterRef = useRef<[number, number] | null>(null);
  const prevZoomRef = useRef<number | null>(null);

  const centerLat = center?.[0];
  const centerLng = center?.[1];

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prevCenter = prevCenterRef.current;
    const prevZoom = prevZoomRef.current;

    const centerChanged = !prevCenter || !center || prevCenter[0] !== center[0] || prevCenter[1] !== center[1];
    const zoomChanged = prevZoom !== zoom;

    if (centerChanged || zoomChanged) {
      try {
        if (center) {
          map.setCenter([center[1], center[0]]);
        }
        map.setZoom(zoom);
      } catch {
        // Ignore setCenter/setZoom failures during teardown races.
      }
      if (center) {
        prevCenterRef.current = center;
      }
      prevZoomRef.current = zoom;
    }

    try {
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          // Ignore resize failures during async layout changes.
        }
      });
    } catch {
      // Ignore resize failures.
    }
  }, [centerLat, centerLng, zoom]);

  return (
    <div
      ref={wrapperRef}
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ height, width: "100%" }}
    />
  );
}
