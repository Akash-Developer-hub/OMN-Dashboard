import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  MapPin, User, Clock, Shield, CheckCircle,
  XCircle, Tag, Globe, X, ChevronLeft, ChevronRight,
  ImageIcon, AlertCircle, ZoomIn, Maximize2, Home, Trash2,
} from "lucide-react";
import type { ApiContribution } from "./ContributionTable";
import { api } from "@/utils/api";
import maplibregl from "maplibre-gl";
import ADMap from "@/components/ADMap";

interface OsmField {
  label: string;
  field: string;
  osmTag: string;
  type: string;
  required: boolean;
}

interface CategoryDef {
  category: string;
  label: string;
  fields: OsmField[];
}

const categoryColors: Record<string, string> = {
  amenity: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  shop: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  tourism: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  leisure: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  building: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  highway: "bg-red-500/10 text-red-400 border-red-500/20",
  natural: "bg-green-500/10 text-green-400 border-green-500/20",
  office: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

const priorityConfig: Record<string, { color: string; dot: string }> = {
  low: { color: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-400" },
  medium: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  high: { color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
};

// ─── Expanded Map Modal ────────────────────────────────────────────────────────
function ExpandedMapModal({
  coordinates,
  poiName,
  onClose,
}: {
  coordinates: [number, number];
  poiName: string;
  onClose: () => void;
}) {
  const expandedMapRef = useRef<maplibregl.Map | null>(null);

  const popupHtml = `<b>${poiName}</b><br/><span style="font-family:monospace;font-size:11px">${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}</span>`;

  const addMarkerExpanded = useCallback(
    (map: maplibregl.Map) => {
      expandedMapRef.current = map;
      const markerElement = document.createElement("div");
      markerElement.style.width = "20px";
      markerElement.style.height = "20px";
      markerElement.style.borderRadius = "9999px";
      markerElement.style.border = "2.5px solid hsl(174, 72%, 46%)";
      markerElement.style.background = "hsla(174, 72%, 46%, 0.25)";
      markerElement.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.7)";

      const popup = new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml);
      new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([coordinates[1], coordinates[0]])
        .setPopup(popup)
        .addTo(map);
      popup.setLngLat([coordinates[1], coordinates[0]]).addTo(map);

      setTimeout(() => {
        try {
          map.resize();
        } catch {
          // Ignore resize failures if modal closes mid-tick.
        }
      }, 100);
    },
    [coordinates, popupHtml]
  );

  const expandedHeight = Math.floor(window.innerHeight * 0.85);

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl overflow-hidden border border-border shadow-2xl"
        style={{ width: "90vw", height: expandedHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <ADMap center={coordinates} zoom={16} height={expandedHeight} onMapReady={addMarkerExpanded} />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-[1000] p-2.5 rounded-full bg-white/90 hover:bg-white border border-border shadow-md text-gray-700 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="absolute bottom-12 left-3 z-[1000] bg-black/60 backdrop-blur-sm text-white text-xs font-mono px-3 py-1.5 rounded-lg">
          {coordinates[0].toFixed(6)}, {coordinates[1].toFixed(6)}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Inline Map ────────────────────────────────────────────────────────────────
function NodeMap({ coordinates, poiName }: { coordinates: [number, number]; poiName: string }) {
  const [mapExpanded, setMapExpanded] = useState(false);

  const popupHtml = `<b>${poiName}</b><br/><span style="font-family:monospace;font-size:11px">${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}</span>`;

  const addMarker = useCallback(
    (map: maplibregl.Map) => {
      const markerElement = document.createElement("div");
      markerElement.style.width = "20px";
      markerElement.style.height = "20px";
      markerElement.style.borderRadius = "9999px";
      markerElement.style.border = "2.5px solid hsl(174, 72%, 46%)";
      markerElement.style.background = "hsla(174, 72%, 46%, 0.25)";
      markerElement.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.7)";

      const popup = new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml);
      new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([coordinates[1], coordinates[0]])
        .setPopup(popup)
        .addTo(map);
      popup.setLngLat([coordinates[1], coordinates[0]]).addTo(map);
    },
    [coordinates, popupHtml]
  );

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
        <ADMap center={coordinates} zoom={16} height={280} onMapReady={addMarker} />
        <button
          onClick={() => setMapExpanded(true)}
          className="absolute top-3 right-3 z-[1000] p-2 rounded-lg bg-white/90 hover:bg-white border border-border shadow-md text-gray-700 transition-colors"
          title="Expand map"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground font-mono px-1">
        {coordinates[0].toFixed(6)}, {coordinates[1].toFixed(6)}
      </p>

      {mapExpanded && (
        <ExpandedMapModal
          coordinates={coordinates}
          poiName={poiName}
          onClose={() => setMapExpanded(false)}
        />
      )}
    </div>
  );
}

// ─── Image Gallery ─────────────────────────────────────────────────────────────
function ImageGallery({ images }: { images: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [imgLoaded, setImgLoaded] = useState<Record<number, boolean>>({});

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((lightboxIndex + 1) % images.length);
      if (e.key === "ArrowLeft") setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
    },
    [lightboxIndex, images.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-border bg-muted/30">
        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No images attached</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {images.map((src, i) => {
          const isError = imgErrors[i];
          const isLoaded = imgLoaded[i];

          return (
            <button
              key={i}
              onClick={() => !isError && setLightboxIndex(i)}
              className={`group relative aspect-square rounded-lg overflow-hidden border border-border transition-all duration-200
                ${isError ? "cursor-default" : "hover:border-primary/60 hover:shadow-md cursor-pointer"}
              `}
            >
              {/* Skeleton while loading */}
              {!isLoaded && !isError && (
                <div className="absolute inset-0 bg-muted animate-pulse" />
              )}

              {isError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/60 gap-2">
                  <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground">Unavailable</span>
                </div>
              ) : (
                <>
                  <img
                    src={src}
                    alt={`Image ${i + 1}`}
                    className={`w-full h-full object-cover transition-all duration-300
                      ${isLoaded ? "opacity-100" : "opacity-0"}
                      group-hover:scale-105
                    `}
                    onLoad={() => setImgLoaded((p) => ({ ...p, [i]: true }))}
                    onError={() => setImgErrors((p) => ({ ...p, [i]: true }))}
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                    <div className="bg-white/20 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 scale-75 group-hover:scale-100">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </>
              )}

              {/* Counter badge */}
              <span className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                {i + 1}/{images.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-[10001] bg-black/95 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Controls */}
            <button
              className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={() => setLightboxIndex(null)}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white text-sm px-4 py-1.5 rounded-full">
              {lightboxIndex + 1} / {images.length}
            </div>

            {images.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
                  }}
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((lightboxIndex + 1) % images.length);
                  }}
                  title="Next (→)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <img
              src={images[lightboxIndex]}
              alt={`Image ${lightboxIndex + 1}`}
              className="max-w-[88vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/60 backdrop-blur-sm p-2 rounded-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${
                      i === lightboxIndex
                        ? "border-white scale-110"
                        : "border-white/20 hover:border-white/60 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {!imgErrors[i] && (
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

// ─── Section Wrapper ───────────────────────────────────────────────────────────
function Section({ icon: Icon, title, count, children }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted border border-border">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md border border-border">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function ContributionDetail({
  contribution,
  open,
  onOpenChange,
  onStatusChange,
  onDelete,
}: {
  contribution: ApiContribution | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStatusChange?: (id: string, status: "approved" | "rejected") => void;
  onDelete?: (id: string) => void;
}) {
  const [reviewNote, setReviewNote] = useState("");
  const [categoryFields, setCategoryFields] = useState<OsmField[]>([]);
  const [loading, setLoading] = useState<"approve" | "reject" | "delete" | null>(null);

  useEffect(() => {
    if (!contribution?.category) return;
    api
      .get("/admin-dashboard/contributors/categories")
      .then((res) => {
        const cats: CategoryDef[] = res.data?.data || [];
        const match = cats.find((c) => c.category === contribution.category);
        setCategoryFields(match?.fields || []);
      })
      .catch(() => setCategoryFields([]));
  }, [contribution?.category]);

  if (!contribution) return null;
  const c = contribution;

  const handleDelete = async () => {
    setLoading("delete");
    try {
      await api.post("/admin-dashboard/contributors/delete", { id: c.id });
      toast.success("Contribution deleted");
      onDelete?.(c.id);
      onOpenChange(false);
    } catch {
      toast.error("Failed to delete contribution");
    } finally {
      setLoading(null);
    }
  };

  const handleReview = async (approved: boolean) => {
    const type = approved ? "approve" : "reject";
    setLoading(type);
    try {
      await api.post("/admin-dashboard/contributors/approve", { id: c.id, approved });
      const newStatus = approved ? "approved" : "rejected";
      toast.success(`Contribution ${newStatus}`);
      onStatusChange?.(c.id, newStatus);
      setReviewNote("");
      onOpenChange(false);
    } catch {
      toast.error(`Failed to ${type} contribution`);
    } finally {
      setLoading(null);
    }
  };

  const statusMap: Record<string, "pending" | "approved" | "rejected" | "checking"> = {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    needs_info: "checking",
  };

  const poiName = c.basicInfo?.name || c.cardData?.title || "—";
  const locationText =
    c.cardData?.locationText ||
    [c.address?.area, c.address?.city, c.address?.state].filter(Boolean).join(", ") ||
    "—";
  const trustScore = c.contributionProgress?.contributePercentage ?? 0;
  const reviewedName = c.approvedByname || c.approved_by || "—";

  const formatDate = (val: string | number | undefined) => {
    if (!val) return "—";
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleString();
  };

  const images: string[] = c.media?.images || c.images || [];
  const priority = (c.priority?.toLowerCase() || "low") as keyof typeof priorityConfig;
  const pCfg = priorityConfig[priority] || priorityConfig.low;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-lg font-bold tracking-tight">
                    {c.basicInfo?.name || "—"}
                  </DialogTitle>
                  <StatusBadge status={statusMap[c.status] || "pending"} />
                </div>
                <DialogDescription className="flex items-center gap-1.5 text-xs">
                  <span>{c.basicInfo?.description || "No description"}</span>
                </DialogDescription>
              </div>
              {/* Category + Priority pills + Close button */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    categoryColors[c.category] || "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {c.category || "—"}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${pCfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                  {c.priority || "low"}
                </span>
                <button
                  onClick={() => onOpenChange(false)}
                  className="ml-1 flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted border border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-6">

          {/* Map */}
          {c.location?.lat && c.location?.lng && (
            <Section icon={MapPin} title="Location">
              <NodeMap coordinates={[c.location.lat, c.location.lng]} poiName={poiName} />
            </Section>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Trust Score" value={String(trustScore)} />
            <StatCard label="Action" value={c.action || "—"} capitalize />
            <StatCard label="Comments" value={String(c.commentsCount ?? 0)} />
            <StatCard label="Attachments" value={String(images.length)} />
          </div>

          {/* Address */}
          {(c.address?.street || c.address?.area || c.address?.city || c.address?.state || c.address?.country || c.address?.pincode) && (
            <Section icon={Home} title="Address">
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Key</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {([
                      { osmTag: "street", value: c.address?.street },
                      { osmTag: "suburb", value: c.address?.area },
                      { osmTag: "city",   value: c.address?.city },
                      { osmTag: "state",  value: c.address?.state },
                      { osmTag: "postcode", value: c.address?.pincode },
                    ] as const).filter(r => r.value).map(r => (
                      <tr key={r.osmTag} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-primary/80">{r.osmTag}</td>
                        <td className="px-4 py-2.5 text-foreground">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Info grid */}
          <Section icon={User} title="Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <InfoRow icon={Tag} label="Contribution Name" value={c.name || "—"} />
              <InfoRow icon={CheckCircle} label="Reviewed By" value={reviewedName} />
              <InfoRow icon={User} label="Owner" value={c.ownerInfo?.name || "—"} />
              <InfoRow icon={Globe} label="Contact" value={c.contact?.phone || c.ownerInfo?.phone || "—"} />
              <InfoRow icon={Clock} label="Created" value={formatDate(c.created_at)} />
              <InfoRow icon={Clock} label="Updated" value={formatDate(c.updated_at)} />
            </div>
          </Section>

          {/* Images */}
          <Section icon={ImageIcon} title="Images" count={images.length}>
            <ImageGallery images={images} />
          </Section>

          {/* OSM Tags */}
          <Section icon={Tag} title="OSM Tags" count={categoryFields.length}>
            {categoryFields.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed border-border bg-muted/30">
                <AlertCircle className="w-4 h-4 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No OSM tags available for this category</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">OSM Tag</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Label</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categoryFields.map((f) => (
                      <tr key={f.field} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-primary/80">{f.osmTag}</td>
                        <td className="px-4 py-2.5 text-foreground">{f.label}</td>
                        <td className="px-4 py-2.5">
                          {f.required ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-medium">
                              <CheckCircle className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Approved by banner */}
          {c.approved_by && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reviewed by</p>
                <p className="text-sm font-semibold text-emerald-400">{c.approved_by}</p>
              </div>
            </div>
          )}

          {/* Review Actions */}
          {(c.status === "pending" || c.status === "needs_info") && (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted border border-border">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Review Action</h3>
              </div>
              <Textarea
                placeholder="Add a review note (optional)..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="resize-none text-sm"
                rows={3}
              />
              <div className="flex gap-2.5">
                <Button
                  size="sm"
                  onClick={() => handleReview(true)}
                  disabled={loading !== null}
                  className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {loading === "approve" ? "Approving…" : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReview(false)}
                  disabled={loading !== null}
                  className="gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {loading === "reject" ? "Rejecting…" : "Reject"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={loading !== null}
                  className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {loading === "delete" ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-muted/40 hover:bg-muted/60 rounded-xl px-3.5 py-2.5 border border-border/60 transition-colors">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  bar,
  capitalize,
}: {
  label: string;
  value: string;
  bar?: number;
  capitalize?: boolean;
}) {
  return (
    <div className="bg-muted/40 border border-border/60 rounded-xl px-4 py-3 space-y-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold text-foreground ${capitalize ? "capitalize" : ""}`}>{value}</p>
      {bar !== undefined && (
        <div className="h-1 rounded-full bg-muted overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(bar, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}