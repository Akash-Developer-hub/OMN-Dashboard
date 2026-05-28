import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  Edit2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Method } from "axios";

type ThumbnailType = "url" | "base64";

interface Thumbnail {
  type: ThumbnailType;
  data: string;
}

interface ExplorePlace {
  id: string;
  name: string;
  name_ar: string;
  category: string;
  category_ar: string;
  area: string;
  area_ar: string;
  open: string;
  eta: string;
  pos: [number, number];
  thumbnail: Thumbnail;
}

interface ExploreGuide {
  id: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  thumbnail: Thumbnail;
  places: ExplorePlace[];
}

interface ExploreGuideConfigData {
  schemaVersion: number;
  configId: string;
  guides: ExploreGuide[];
  langcode?: "en" | "ar" | string;
  updatedAt?: string;
}

type UnknownRecord = Record<string, unknown>;
const EXPLORE_GUIDE_SAVE_URL =
  (import.meta.env.VITE_EXPLORE_GUIDE_SAVE_URL as string | undefined)?.trim() || "/explore_guide_data";
const EXPLORE_GUIDE_SAVE_METHOD =
  ((import.meta.env.VITE_EXPLORE_GUIDE_SAVE_METHOD as string | undefined) || "PUT").toUpperCase();
const VALID_SAVE_METHODS = new Set(["POST", "PUT", "PATCH"]);

type DeleteTarget =
  | { type: "guide"; guideId: string }
  | { type: "place"; guideId: string; placeId: string }
  | null;

const defaultThumbnail = (): Thumbnail => ({ type: "url", data: "" });

function normalizeThumbnailType(value: unknown): ThumbnailType {
  return value === "base64" ? "base64" : "url";
}

function resolveThumbnailSrc(thumbnail: Thumbnail): string {
  const value = thumbnail.data.trim();
  if (!value) return "";

  if (thumbnail.type === "base64") {
    return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
  }

  return value;
}

const emptyPlace = (): ExplorePlace => ({
  id: "",
  name: "",
  name_ar: "",
  category: "",
  category_ar: "",
  area: "",
  area_ar: "",
  open: "",
  eta: "",
  pos: [54.3773, 24.4539],
  thumbnail: defaultThumbnail(),
});

const emptyGuide = (): ExploreGuide => ({
  id: "",
  title: "",
  title_ar: "",
  description: "",
  description_ar: "",
  thumbnail: defaultThumbnail(),
  places: [],
});

function formatTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : {};
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getLocalizedText(value: unknown, lang: "en" | "ar"): string {
  if (typeof value === "string") return value;

  const record = asRecord(value);
  if (lang === "ar") {
    return toStringValue(record.label) || toStringValue(record.key);
  }

  return toStringValue(record.key) || toStringValue(record.label);
}

function toNumberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPos(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return [toNumberValue(raw[0]), toNumberValue(raw[1])];
  }

  const record = asRecord(raw);
  if (Array.isArray(record.coordinates) && record.coordinates.length >= 2) {
    return [toNumberValue(record.coordinates[0]), toNumberValue(record.coordinates[1])];
  }

  return [0, 0];
}

function getGuidesFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const payloadRecord = asRecord(payload);
  if (Array.isArray(payloadRecord.guides)) return payloadRecord.guides;
  if (Array.isArray(payloadRecord.data)) return payloadRecord.data;

  return [];
}

function normalizePlace(raw: unknown, lang: "en" | "ar" = "en"): ExplorePlace {
  const record = asRecord(raw);
  const thumbnail = asRecord(record.thumbnail);
  const [lng, lat] = getPos(record.pos);

  return {
    id: toStringValue(record.id ?? record._id),
    name: getLocalizedText(record.name, lang),
    name_ar: getLocalizedText(record.name_ar ?? record.name, "ar"),
    category: getLocalizedText(record.category, lang),
    category_ar: getLocalizedText(record.category_ar ?? record.category, "ar"),
    area: getLocalizedText(record.area, lang),
    area_ar: getLocalizedText(record.area_ar ?? record.area, "ar"),
    open: toStringValue(record.open),
    eta: toStringValue(record.eta),
    pos: [lng, lat],
    thumbnail: {
      type: normalizeThumbnailType(thumbnail.type),
      data: toStringValue(thumbnail.data),
    },
  };
}

function normalizeGuide(raw: unknown, lang: "en" | "ar" = "en"): ExploreGuide {
  const record = asRecord(raw);
  const thumbnail = asRecord(record.thumbnail);
  const places = Array.isArray(record.places) ? record.places : [];

  return {
    id: toStringValue(record.id ?? record._id),
    title: getLocalizedText(record.title, lang),
    title_ar: getLocalizedText(record.title_ar ?? record.title, "ar"),
    description: getLocalizedText(record.description, lang),
    description_ar: getLocalizedText(record.description_ar ?? record.description, "ar"),
    thumbnail: {
      type: normalizeThumbnailType(thumbnail.type),
      data: toStringValue(thumbnail.data),
    },
    places: places.map((place) => normalizePlace(place, lang)),
  };
}

function mergeArabicPlaces(englishGuides: ExploreGuide[], arabicGuides: ExploreGuide[]): ExploreGuide[] {
  return englishGuides.map((guide) => {
    const arabicGuide = arabicGuides.find((item) => item.id === guide.id);
    if (!arabicGuide) return guide;

    return {
      ...guide,
      title_ar: arabicGuide.title_ar || arabicGuide.title || guide.title_ar,
      description_ar: arabicGuide.description_ar || arabicGuide.description || guide.description_ar,
      places: guide.places.map((place) => {
        const arabicPlace = arabicGuide.places.find((item) => item.id === place.id);
        if (!arabicPlace) return place;

        return {
          ...place,
          name_ar: arabicPlace.name_ar || arabicPlace.name || place.name_ar,
          category_ar: arabicPlace.category_ar || arabicPlace.category || place.category_ar,
          area_ar: arabicPlace.area_ar || arabicPlace.area || place.area_ar,
        };
      }),
    };
  });
}

function buildLocalizedPlace(place: ExplorePlace, lang: "en" | "ar") {
  const nameKey = place.name.trim();
  const categoryKey = place.category.trim();
  const areaKey = place.area.trim();

  return {
    id: place.id.trim(),
    name: {
      key: nameKey,
      label: lang === "ar" ? place.name_ar.trim() || nameKey : nameKey,
    },
    category: {
      key: categoryKey,
      label: lang === "ar" ? place.category_ar.trim() || categoryKey : categoryKey,
    },
    area: {
      key: areaKey,
      label: lang === "ar" ? place.area_ar.trim() || areaKey : areaKey,
    },
    open: place.open.trim(),
    eta: place.eta.trim(),
    pos: [Number(place.pos[0]), Number(place.pos[1])] as [number, number],
    thumbnail: {
      type: normalizeThumbnailType(place.thumbnail.type),
      data: place.thumbnail.data.trim(),
    },
  };
}

function buildLocalizedConfig(config: ExploreGuideConfigData, lang: "en" | "ar") {
  return {
    configId: lang === "ar" ? config.configId.replace(/_en$/, "_ar") : config.configId.replace(/_ar$/, "_en"),
    schemaVersion: config.schemaVersion,
    langcode: lang,
    guides: config.guides.map((guide) => ({
      id: guide.id.trim(),
      title: {
        key: guide.title.trim(),
        label: lang === "ar" ? guide.title_ar.trim() || guide.title.trim() : guide.title.trim(),
      },
      description: {
        key: guide.description.trim(),
        label: lang === "ar" ? guide.description_ar.trim() || guide.description.trim() : guide.description.trim(),
      },
      thumbnail: {
        type: normalizeThumbnailType(guide.thumbnail.type),
        data: guide.thumbnail.data.trim(),
      },
      places: guide.places.map((place) => buildLocalizedPlace(place, lang)),
    })),
  };
}

function GuideDialog({
  open,
  isNew,
  guide,
  existingIds,
  originalId,
  onClose,
  onSave,
}: {
  open: boolean;
  isNew: boolean;
  guide: ExploreGuide;
  existingIds: string[];
  originalId?: string;
  onClose: () => void;
  onSave: (guide: ExploreGuide) => void;
}) {
  const [form, setForm] = useState<ExploreGuide>(guide);
  const guideThumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(guide);
  }, [guide, open]);

  const duplicateId =
    form.id.trim() !== "" &&
    existingIds.includes(form.id.trim()) &&
    (isNew || form.id.trim() !== originalId);

  const valid = form.id.trim() !== "" && form.title.trim() !== "" && !duplicateId;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Guide Section" : "Edit Guide Section"}</DialogTitle>
          <DialogDescription>
            Configure the guide metadata and thumbnail used in Explore Guide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Guide ID *</Label>
              <Input
                value={form.id}
                onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                placeholder="iconic"
                
              />
              {duplicateId && <p className="text-xs text-red-400">This guide ID already exists.</p>}
            </div>

            <div className="space-y-1">
              <Label>Thumbnail Type</Label>
              <Select
                value={form.thumbnail.type}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    thumbnail: { ...prev.thumbnail, type: normalizeThumbnailType(value) },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="base64">Upload Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Title English *</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Iconic Abu Dhabi"
              />
            </div>

            <div className="space-y-1">
              <Label className="block text-right">Title Arabic</Label>
              <Input
                dir="rtl"
                value={form.title_ar}
                onChange={(event) => setForm((prev) => ({ ...prev, title_ar: event.target.value }))}
                placeholder="Arabic title"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Description English</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Landmark attractions and signature city highlights."
                rows={4}
              />
            </div>

            <div className="space-y-1">
              <Label className="block text-right">Description Arabic</Label>
              <Textarea
                dir="rtl"
                value={form.description_ar}
                onChange={(event) => setForm((prev) => ({ ...prev, description_ar: event.target.value }))}
                placeholder="Arabic description"
                rows={4}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{form.thumbnail.type === "base64" ? "Thumbnail Image" : "Thumbnail URL"}</Label>
            {form.thumbnail.type === "base64" ? (
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={guideThumbInputRef}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("Image must be under 5MB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setForm((prev) => ({
                        ...prev,
                        thumbnail: { ...prev.thumbnail, data: reader.result as string },
                      }));
                    };
                    reader.readAsDataURL(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  
                  onClick={() => guideThumbInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Image
                </Button>
                {form.thumbnail.data && (
                  <img
                    src={resolveThumbnailSrc(form.thumbnail)}
                    alt="thumb preview"
                    className="h-10 w-10 rounded object-cover border border-border"
                  />
                )}
              </div>
            ) : (
              <Input
                value={form.thumbnail.data}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    thumbnail: { ...prev.thumbnail, data: event.target.value },
                  }))
                }
                placeholder="https://..."
                
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!valid}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Guide
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlaceDialog({
  open,
  isNew,
  place,
  existingIds,
  originalId,
  onClose,
  onSave,
}: {
  open: boolean;
  isNew: boolean;
  place: ExplorePlace;
  existingIds: string[];
  originalId?: string;
  onClose: () => void;
  onSave: (place: ExplorePlace) => void;
}) {
  const [form, setForm] = useState<ExplorePlace>(place);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(place);
  }, [place, open]);

  const duplicateId =
    form.id.trim() !== "" &&
    existingIds.includes(form.id.trim()) &&
    (isNew || form.id.trim() !== originalId);

  const valid = form.id.trim() !== "" && form.name.trim() !== "" && !duplicateId;

  const setCoord = (index: 0 | 1, value: string) => {
    const parsed = Number.parseFloat(value);
    setForm((prev) => {
      const next: [number, number] = [...prev.pos] as [number, number];
      next[index] = Number.isFinite(parsed) ? parsed : 0;
      return { ...prev, pos: next };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Place" : "Edit Place"}</DialogTitle>
          <DialogDescription>
            Add place details, map position, and open hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Place ID *</Label>
              <Input
                value={form.id}
                onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                placeholder="mosque"
                
              />
              {duplicateId && <p className="text-xs text-red-400">This place ID already exists in this guide.</p>}
            </div>

          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Sheikh Zayed Grand Mosque"
              />
            </div>

            <div className="space-y-1" dir="rtl">
              <Label>Name Arabic</Label>
              <Input
                value={form.name_ar}
                onChange={(event) => setForm((prev) => ({ ...prev, name_ar: event.target.value }))}
                placeholder="مسجد الشيخ زايد الكبير"
                
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Landmark"
                
              />
            </div>

            <div className="space-y-1" dir="rtl">
              <Label>Category Arabic</Label>
              <Input
                value={form.category_ar}
                onChange={(event) => setForm((prev) => ({ ...prev, category_ar: event.target.value }))}
                placeholder="معلم بارز"
                
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="space-y-1">
              <Label>Area</Label>
              <Input
                value={form.area}
                onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
                placeholder="Al Rawdah"
                
              />
            </div>

            <div className="space-y-1" dir="rtl">
              <Label>Area Arabic</Label>
              <Input
                value={form.area_ar}
                onChange={(event) => setForm((prev) => ({ ...prev, area_ar: event.target.value }))}
                placeholder="الروضة"
                
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Open Hours</Label>
            <Input
              value={form.open}
              onChange={(event) => setForm((prev) => ({ ...prev, open: event.target.value }))}
              placeholder="5:30 AM - 10:00 PM"
              
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Thumbnail Type</Label>
              <Select
                value={form.thumbnail.type}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    thumbnail: { ...prev.thumbnail, type: normalizeThumbnailType(value) },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="base64">Upload Image</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 col-span-2">
              <Label>{form.thumbnail.type === "base64" ? "Thumbnail Image" : "Thumbnail URL"}</Label>
              {form.thumbnail.type === "base64" ? (
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={thumbInputRef}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Image must be under 5MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setForm((prev) => ({
                          ...prev,
                          thumbnail: { ...prev.thumbnail, data: reader.result as string },
                        }));
                      };
                      reader.readAsDataURL(file);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    
                    onClick={() => thumbInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Image
                  </Button>
                  {form.thumbnail.data && (
                    <img
                      src={form.thumbnail.data}
                      alt="thumb preview"
                      className="h-10 w-10 rounded object-cover border border-border"
                    />
                  )}
                </div>
              ) : (
                <Input
                  value={form.thumbnail.data}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      thumbnail: { ...prev.thumbnail, data: event.target.value },
                    }))
                  }
                  placeholder="https://..."
                  
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Longitude (pos[0])</Label>
              <Input
                type="number"
                value={form.pos[0]}
                onChange={(event) => setCoord(0, event.target.value)}
                
              />
            </div>

            <div className="space-y-1">
              <Label>Latitude (pos[1])</Label>
              <Input
                type="number"
                value={form.pos[1]}
                onChange={(event) => setCoord(1, event.target.value)}
                
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!valid}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Place
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExploreGuideConfigPage() {
  const [config, setConfig] = useState<ExploreGuideConfigData | null>(null);
  const [arabicConfig, setArabicConfig] = useState<ExploreGuideConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveUnavailable, setSaveUnavailable] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [expandedGuideIds, setExpandedGuideIds] = useState<Set<string>>(new Set());

  const [guideDialogOpen, setGuideDialogOpen] = useState(false);
  const [guideDialogIsNew, setGuideDialogIsNew] = useState(true);
  const [guideDialogOriginalId, setGuideDialogOriginalId] = useState<string | undefined>(undefined);
  const [guideDialogForm, setGuideDialogForm] = useState<ExploreGuide>(emptyGuide());

  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [placeDialogIsNew, setPlaceDialogIsNew] = useState(true);
  const [placeDialogOriginalId, setPlaceDialogOriginalId] = useState<string | undefined>(undefined);
  const [placeDialogGuideId, setPlaceDialogGuideId] = useState<string>("");
  const [placeDialogForm, setPlaceDialogForm] = useState<ExplorePlace>(emptyPlace());

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [response, arabicResponse] = await Promise.all([
        api.get("/explore_guide_data", { params: { langcode: "en" } }),
        api.get("/explore_guide_data", { params: { langcode: "ar" } }).catch(() => null),
      ]);
      const responseData = asRecord(response.data);
      const payload = responseData.data ?? response.data;
      const payloadRecord = asRecord(payload);
      const guides = getGuidesFromPayload(payload).map((guide) => normalizeGuide(guide, "en"));

      const arabicResponseData = asRecord(arabicResponse?.data);
      const arabicPayload = arabicResponseData.data ?? arabicResponse?.data;
      const arabicPayloadRecord = asRecord(arabicPayload);
      const arabicGuides = getGuidesFromPayload(arabicPayload).map((guide) => normalizeGuide(guide, "ar"));

      const configId =
        toStringValue(payloadRecord.configId) ||
        toStringValue(responseData.configId) ||
        "explore_guide_data_v2";

      const schemaVersion = toNumberValue(payloadRecord.schemaVersion ?? responseData.schemaVersion, 1);

      const updatedAt =
        toStringValue(payloadRecord.updatedAt) || toStringValue(responseData.updatedAt) || undefined;

      const normalized: ExploreGuideConfigData = {
        schemaVersion,
        configId,
        langcode: "en",
        guides: mergeArabicPlaces(guides, arabicGuides),
        updatedAt,
      };

      const normalizedArabic: ExploreGuideConfigData | null = arabicResponse
        ? {
            schemaVersion: toNumberValue(arabicPayloadRecord.schemaVersion ?? arabicResponseData.schemaVersion, schemaVersion),
            configId:
              toStringValue(arabicPayloadRecord.configId) ||
              toStringValue(arabicResponseData.configId) ||
              configId.replace(/_en$/, "_ar"),
            langcode: "ar",
            guides: arabicGuides,
            updatedAt: toStringValue(arabicPayloadRecord.updatedAt) || toStringValue(arabicResponseData.updatedAt) || undefined,
          }
        : null;

      setConfig(normalized);
      setArabicConfig(normalizedArabic);
      setHasUnsavedChanges(false);
      setExpandedGuideIds(new Set(normalized.guides.slice(0, 1).map((guide) => guide.id)));
    } catch {
      toast.error("Failed to load Explore Guide config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const stats = useMemo(() => {
    const guides = config?.guides ?? [];
    return {
      totalGuides: guides.length,
      totalPlaces: guides.reduce((total, guide) => total + guide.places.length, 0),
    };
  }, [config]);

  const updateGuides = (updater: (guides: ExploreGuide[]) => ExploreGuide[]) => {
    setConfig((previous) => {
      if (!previous) return previous;

      return { ...previous, guides: updater(previous.guides) };
    });

    setHasUnsavedChanges(true);
  };

  const persistConfig = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const englishPayload = buildLocalizedConfig(config, "en");
      const arabicPayload = {
        ...buildLocalizedConfig(config, "ar"),
        configId: arabicConfig?.configId || buildLocalizedConfig(config, "ar").configId,
      };

      const method = VALID_SAVE_METHODS.has(EXPLORE_GUIDE_SAVE_METHOD)
        ? (EXPLORE_GUIDE_SAVE_METHOD as Method)
        : ("PUT" as Method);

      await Promise.all([
        api.request({
          url: EXPLORE_GUIDE_SAVE_URL,
          method,
          params: { langcode: "en" },
          data: englishPayload,
          timeout: 30000,
        }),
        api.request({
          url: EXPLORE_GUIDE_SAVE_URL,
          method,
          params: { langcode: "ar" },
          data: arabicPayload,
          timeout: 30000,
        }),
      ]);

      setSaveUnavailable(false);
      toast.success("English and Arabic Explore Guide configs saved.");
      await fetchConfig();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

      if (status === 404) {
        setSaveUnavailable(true);
        toast.error("API save route not found. Ask backend to add this endpoint.");
        return;
      }

      toast.error(message ?? "Failed to save Explore Guide config.");
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (guideId: string) => {
    setExpandedGuideIds((previous) => {
      const next = new Set(previous);
      if (next.has(guideId)) next.delete(guideId);
      else next.add(guideId);
      return next;
    });
  };

  const openAddGuide = () => {
    setGuideDialogIsNew(true);
    setGuideDialogOriginalId(undefined);
    setGuideDialogForm(emptyGuide());
    setGuideDialogOpen(true);
  };

  const openEditGuide = (guide: ExploreGuide) => {
    setGuideDialogIsNew(false);
    setGuideDialogOriginalId(guide.id);
    setGuideDialogForm({ ...guide, thumbnail: { ...guide.thumbnail } });
    setGuideDialogOpen(true);
  };

  const saveGuide = (guide: ExploreGuide) => {
    const trimmedGuide: ExploreGuide = {
      ...guide,
      id: guide.id.trim(),
      title: guide.title.trim(),
      title_ar: guide.title_ar.trim(),
      description: guide.description.trim(),
      description_ar: guide.description_ar.trim(),
      thumbnail: {
        type: normalizeThumbnailType(guide.thumbnail.type),
        data: guide.thumbnail.data.trim(),
      },
    };

    if (guideDialogIsNew) {
      updateGuides((previous) => [...previous, trimmedGuide]);
      setExpandedGuideIds((previous) => new Set(previous).add(trimmedGuide.id));
      toast.success("Guide section added locally. Save changes to persist.");
    } else if (guideDialogOriginalId) {
      updateGuides((previous) =>
        previous.map((item) => (item.id === guideDialogOriginalId ? { ...trimmedGuide, places: item.places } : item)),
      );

      setExpandedGuideIds((previous) => {
        const next = new Set(previous);
        if (guideDialogOriginalId && guideDialogOriginalId !== trimmedGuide.id && next.has(guideDialogOriginalId)) {
          next.delete(guideDialogOriginalId);
          next.add(trimmedGuide.id);
        }
        return next;
      });

      toast.success("Guide section updated locally. Save changes to persist.");
    }

    setGuideDialogOpen(false);
  };

  const openAddPlace = (guideId: string) => {
    setPlaceDialogIsNew(true);
    setPlaceDialogOriginalId(undefined);
    setPlaceDialogGuideId(guideId);
    setPlaceDialogForm(emptyPlace());
    setPlaceDialogOpen(true);
  };

  const openEditPlace = (guideId: string, place: ExplorePlace) => {
    setPlaceDialogIsNew(false);
    setPlaceDialogOriginalId(place.id);
    setPlaceDialogGuideId(guideId);
    setPlaceDialogForm({ ...place, thumbnail: { ...place.thumbnail }, pos: [...place.pos] as [number, number] });
    setPlaceDialogOpen(true);
  };

  const savePlace = (place: ExplorePlace) => {
    const trimmedPlace: ExplorePlace = {
      ...place,
      id: place.id.trim(),
      name: place.name.trim(),
      name_ar: place.name_ar.trim(),
      category: place.category.trim(),
      category_ar: place.category_ar.trim(),
      area: place.area.trim(),
      area_ar: place.area_ar.trim(),
      open: place.open.trim(),
      eta: place.eta.trim(),
      thumbnail: {
        type: normalizeThumbnailType(place.thumbnail.type),
        data: place.thumbnail.data.trim(),
      },
      pos: [Number(place.pos[0]), Number(place.pos[1])],
    };

    updateGuides((previous) =>
      previous.map((guide) => {
        if (guide.id !== placeDialogGuideId) return guide;

        if (placeDialogIsNew) {
          return { ...guide, places: [...guide.places, trimmedPlace] };
        }

        return {
          ...guide,
          places: guide.places.map((item) => (item.id === placeDialogOriginalId ? trimmedPlace : item)),
        };
      }),
    );

    toast.success(placeDialogIsNew ? "Place added locally. Save changes to persist." : "Place updated locally. Save changes to persist.");
    setPlaceDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "guide") {
      updateGuides((previous) => previous.filter((guide) => guide.id !== deleteTarget.guideId));
      setExpandedGuideIds((previous) => {
        const next = new Set(previous);
        next.delete(deleteTarget.guideId);
        return next;
      });
      toast.success("Guide section removed locally. Save changes to persist.");
    }

    if (deleteTarget.type === "place") {
      updateGuides((previous) =>
        previous.map((guide) =>
          guide.id === deleteTarget.guideId
            ? { ...guide, places: guide.places.filter((place) => place.id !== deleteTarget.placeId) }
            : guide,
        ),
      );
      toast.success("Place removed locally. Save changes to persist.");
    }

    setDeleteTarget(null);
  };

  const currentGuidePlaceIds =
    config?.guides.find((guide) => guide.id === placeDialogGuideId)?.places.map((place) => place.id) ?? [];

  return (
    <div className="space-y-6 p-6 min-h-screen animate-slide-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-600/20 rounded-lg border border-cyan-500/30">
            <Compass className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Explore Guide Config</h1>
            {config?.updatedAt && <p className="text-xs text-muted-foreground">Last updated: {formatTime(config.updatedAt)}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfig}
            disabled={loading || saving}
            
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={openAddGuide}
            disabled={loading || saving}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Guide Section
          </Button>

          <Button
            size="sm"
            onClick={persistConfig}
            disabled={!hasUnsavedChanges || loading || saving || !config}
            className={
              saveUnavailable
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save Changes
          </Button>
        </div>
      </div>

      {saveUnavailable && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
          API save endpoint is unavailable. Saving is blocked until backend route is added or corrected.
        </div>
      )}

      {config && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Guide Sections</p>
            <p className="text-lg font-semibold text-foreground">{stats.totalGuides}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total Places</p>
            <p className="text-lg font-semibold text-foreground">{stats.totalPlaces}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Schema Version</p>
            <p className="text-lg font-semibold text-foreground">{config.schemaVersion}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Config ID</p>
            <p className="text-lg font-semibold text-foreground truncate">{config.configId}</p>
          </div>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
          You have unsaved changes. Click Save Changes to push updates to the API.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !config || config.guides.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Compass className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No guide sections yet. Click Add Guide Section to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {config.guides.map((guide) => {
            const expanded = expandedGuideIds.has(guide.id);
            return (
              <div key={guide.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/60"
                  onClick={() => toggleExpanded(guide.id)}
                >
                  <div className="flex items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    {resolveThumbnailSrc(guide.thumbnail) ? (
                      <img
                        src={resolveThumbnailSrc(guide.thumbnail)}
                        alt={guide.title}
                        className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{guide.title || guide.id}</span>
                        <span className="text-xs font-mono text-muted-foreground">{guide.id}</span>
                      </div>
                      {guide.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{guide.description}</p>}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {guide.places.length} places
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAddPlace(guide.id)}
                      className="text-cyan-400 hover:bg-cyan-600/10"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditGuide(guide)}
                      className="text-muted-foreground hover:text-blue-400 hover:bg-blue-600/10"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ type: "guide", guideId: guide.id })}
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-600/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border">
                    {guide.places.length === 0 ? (
                      <div className="px-4 py-6 text-center text-muted-foreground text-sm">No places in this guide yet.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {guide.places.map((place) => {
                          const thumbnailSrc = resolveThumbnailSrc(place.thumbnail);

                          return (
                            <div key={place.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                              {thumbnailSrc ? (
                                <img
                                  src={thumbnailSrc}
                                  alt={place.name}
                                  className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground text-sm">{place.name || place.id}</span>
                                  <span className="text-xs font-mono text-muted-foreground">{place.id}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Tag className="w-3 h-3" />
                                    {place.category || "-"}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="w-3 h-3" />
                                    {place.area || "-"}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock3 className="w-3 h-3" />
                                    {place.open || "-"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    [{place.pos[0].toFixed(4)}, {place.pos[1].toFixed(4)}]
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditPlace(guide.id, place)}
                                  className="text-muted-foreground hover:text-blue-400 hover:bg-blue-600/10"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDeleteTarget({
                                      type: "place",
                                      guideId: guide.id,
                                      placeId: place.id,
                                    })
                                  }
                                  className="text-muted-foreground hover:text-red-400 hover:bg-red-600/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <GuideDialog
        open={guideDialogOpen}
        isNew={guideDialogIsNew}
        guide={guideDialogForm}
        existingIds={config?.guides.map((guide) => guide.id) ?? []}
        originalId={guideDialogOriginalId}
        onClose={() => setGuideDialogOpen(false)}
        onSave={saveGuide}
      />

      <PlaceDialog
        open={placeDialogOpen}
        isNew={placeDialogIsNew}
        place={placeDialogForm}
        existingIds={currentGuidePlaceIds}
        originalId={placeDialogOriginalId}
        onClose={() => setPlaceDialogOpen(false)}
        onSave={savePlace}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "guide" ? "Delete Guide Section?" : "Delete Place?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This change will be local until you click Save Changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {saving && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex items-center gap-3">
            <Loader2 className="animate-spin text-cyan-400 w-5 h-5" />
            <span className="text-foreground">Saving Explore Guide config...</span>
          </div>
        </div>
      )}
    </div>
  );
}
