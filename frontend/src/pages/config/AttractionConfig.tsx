import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Edit2, RefreshCw, Loader2,
  Compass, Image, MapPin, Tag, Upload, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/utils/api";
import PlacePicker, { type PickedPlace } from "@/components/PlacePicker";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AttractionItem {
  id: string;
  f_id: string;
  name: string;
  category: string;
  area: string;
  coordinates: { lat: number; lng: number };
  imageUrl: string;
  image?: { type: "url" | "base64"; data: string };
  thumbMedia?: { type: "url" | "base64"; data: string };
}

interface AttractionConfig {
  configId: string;
  schemaVersion: number;
  attractions: AttractionItem[];
  updatedAt?: string;
}

interface BilingualFormState {
  id: string;
  f_id: string;
  coordinates: { lat: number; lng: number };
  imageUrl: string;
  image?: { type: "url" | "base64"; data: string };
  thumbMedia?: { type: "url" | "base64"; data: string };
  distanceKm?: number;
  en: {
    name: string;
    category: string;
    area: string;
  };
  ar: {
    name: string;
    category: string;
    area: string;
  };
}

const emptyBilingualForm = (): BilingualFormState => ({
  id: "",
  f_id: "",
  coordinates: { lat: 0, lng: 0 },
  imageUrl: "",
  en: { name: "", category: "", area: "" },
  ar: { name: "", category: "", area: "" },
});

const getBilingualForm = (item: AttractionItem, arConfig: AttractionConfig | null): BilingualFormState => {
  const arItem = arConfig?.attractions.find((a) => a.id === item.id);
  return {
    id: item.id,
    f_id: item.f_id || "",
    coordinates: { lat: item.coordinates?.lat || 0, lng: item.coordinates?.lng || 0 },
    imageUrl: item.imageUrl || "",
    thumbMedia: item.thumbMedia,
    distanceKm: item.distanceKm || 0,
    en: {
      name: item.name || "",
      category: item.category || "",
      area: item.area || "",
    },
    ar: {
      name: arItem?.name || "",
      category: arItem?.category || "",
      area: arItem?.area || "",
    },
  };
};

const isArabicTranslationComplete = (id: string, arConfig: AttractionConfig | null): boolean => {
  if (!arConfig || !arConfig.attractions) return false;
  const arItem = arConfig.attractions.find((a) => a.id === id);
  if (!arItem) return false;
  return !!(
    arItem.name?.trim() &&
    arItem.category?.trim() &&
    arItem.area?.trim()
  );
};

// ─── Categories ────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Landmark", "Mall", "Attraction", "Museum", "Arts & Culture",
  "Island", "Beach", "Park", "Hotel", "Restaurant", "Other",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Attraction Dialog ─────────────────────────────────────────────────────

function AttractionDialog({
  open,
  title,
  formState,
  isNew,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  formState: BilingualFormState;
  isNew: boolean;
  onClose: () => void;
  onSave: (f: BilingualFormState) => void;
}) {
  const [form, setForm] = useState<BilingualFormState>(formState);
  const [showPicker, setShowPicker] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [imageType, setImageType] = useState<"url" | "base64">("url");
  const [imagePreview, setImagePreview] = useState<string>("");

  useEffect(() => {
    setForm(formState);
    setCustomCategory(CATEGORIES.includes(formState.en.category) ? "" : formState.en.category);
    if (formState.thumbMedia?.type === "base64") {
      setImageType("base64");
      setImagePreview(formState.thumbMedia.data);
    } else if (formState.thumbMedia?.type === "url") {
      setImageType("url");
      setImagePreview("");
    } else {
      setImageType("url");
      setImagePreview("");
    }
  }, [formState]);

  const setShared = <K extends keyof BilingualFormState>(key: K, value: BilingualFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setCoord = (key: "lat" | "lng", value: string) =>
    setForm((prev) => ({ ...prev, coordinates: { ...prev.coordinates, [key]: parseFloat(value) || 0 } }));

  const setEn = (key: "name" | "category" | "area", value: string) =>
    setForm((prev) => ({ ...prev, en: { ...prev.en, [key]: value } }));

  const setAr = (key: "name" | "category" | "area", value: string) =>
    setForm((prev) => ({ ...prev, ar: { ...prev.ar, [key]: value } }));

  const handlePlacePicked = (place: PickedPlace) => {
    setForm((prev) => ({
      ...prev,
      id: prev.id || place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      f_id: place.f_id || prev.f_id,
      coordinates: { lat: place.lat, lng: place.lng },
      en: {
        ...prev.en,
        name: place.name || prev.en.name,
        area: place.area || prev.en.area,
        category: place.category || prev.en.category,
      },
    }));
    if (place.category && !CATEGORIES.includes(place.category)) {
      setCustomCategory(place.category);
    }
    setShowPicker(false);
  };

  const valid = form.id.trim() && form.en.name.trim() && form.ar.name.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {showPicker ? "Select a place from the map or search." : "Fill in the attraction details."}
          </DialogDescription>
        </DialogHeader>

        {/* Place Picker */}
        {showPicker ? (
          <div className="p-6">
            <PlacePicker
              height={320}
              onSelect={handlePlacePicked}
              onCancel={() => setShowPicker(false)}
            />
          </div>
        ) : (
        <>
          {/* Scrollable Form Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* Select from map button */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPicker(true)}
              className="w-full border-dashed"
            >
              <MapPin className="w-4 h-4 mr-2" /> Select Place from Map
            </Button>

            {/* ID & Feature ID */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>ID <span className="text-red-400">*</span></Label>
                <Input
                  value={form.id}
                  onChange={(e) => setShared("id", e.target.value)}
                  disabled={!isNew}
                  placeholder="burj-khalifa"
                  className="disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <Label>Feature ID (f_id)</Label>
                <Input
                  value={form.f_id}
                  onChange={(e) => setShared("f_id", e.target.value)}
                  placeholder="89FF64C0-1610-44F9-BE9F-51C727FB4FCE"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Bilingual columns side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* English Section */}
              <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/5">
                <h4 className="text-xs font-bold text-blue-400 border-b border-border pb-2 uppercase tracking-wider">ENGLISH CONFIG (LTR)</h4>
                
                <div className="space-y-1">
                  <Label>Name <span className="text-red-400">*</span></Label>
                  <Input value={form.en.name} onChange={(e) => setEn("name", e.target.value)}
                    placeholder="Burj Khalifa" />
                </div>

                <div className="space-y-1">
                  <Label>Category <span className="text-red-400">*</span></Label>
                  <Select
                    value={CATEGORIES.includes(form.en.category) ? form.en.category : form.en.category ? "Other" : ""}
                    onValueChange={(v) => {
                      if (v === "Other") {
                        setEn("category", customCategory || "Other");
                      } else {
                        setEn("category", v);
                        setCustomCategory("");
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48 overflow-y-auto">
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(form.en.category === "Other" || (!CATEGORIES.includes(form.en.category) && form.en.category)) && (
                    <Input
                      value={customCategory}
                      onChange={(e) => {
                        setCustomCategory(e.target.value);
                        setEn("category", e.target.value || "Other");
                      }}
                      placeholder="Type custom category"
                      className="mt-1"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Area <span className="text-red-400">*</span></Label>
                  <Input value={form.en.area} onChange={(e) => setEn("area", e.target.value)}
                    placeholder="Downtown Dubai" />
                </div>
              </div>

              {/* Arabic Section */}
              <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/5">
                <h4 className="text-xs font-bold text-amber-500 border-b border-border pb-2 text-right uppercase tracking-wider">ARABIC CONFIG (RTL)</h4>
                
                <div className="space-y-1">
                  <Label className="block text-right">
                    <span className="text-red-400">*</span> Name (الاسم)
                  </Label>
                  <Input
                    value={form.ar.name}
                    onChange={(e) => setAr("name", e.target.value)}
                    placeholder="برج خليفة"
                    dir="rtl"
                    className="text-right"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="block text-right">
                    <span className="text-red-400">*</span> Category (الفئة)
                  </Label>
                  <Input
                    value={form.ar.category}
                    onChange={(e) => setAr("category", e.target.value)}
                    placeholder="معلم سياحي"
                    dir="rtl"
                    className="text-right"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="block text-right">
                    <span className="text-red-400">*</span> Area (المنطقة)
                  </Label>
                  <Input
                    value={form.ar.area}
                    onChange={(e) => setAr("area", e.target.value)}
                    placeholder="وسط مدينة دبي"
                    dir="rtl"
                    className="text-right"
                  />
                </div>
              </div>

            </div>

            {/* Shared Settings (Coordinates & Image) */}
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/10">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coordinates & Image</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input type="number" value={form.coordinates.lat}
                    onChange={(e) => setCoord("lat", e.target.value)}
                    step="any"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input type="number" value={form.coordinates.lng}
                    onChange={(e) => setCoord("lng", e.target.value)}
                    step="any"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Image</Label>
                <div className="flex gap-2 mb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={imageType === "url" ? "default" : "outline"}
                    onClick={() => setImageType("url")}
                    className={imageType === "url" ? "bg-blue-600 text-white" : ""}
                  >
                    URL
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={imageType === "base64" ? "default" : "outline"}
                    onClick={() => setImageType("base64")}
                    className={imageType === "base64" ? "bg-blue-600 text-white" : ""}
                  >
                    <Upload className="w-3 h-3 mr-1" /> Upload
                  </Button>
                </div>
                {imageType === "url" ? (
                  <Input value={form.imageUrl} onChange={(e) => setShared("imageUrl", e.target.value)}
                    placeholder="https://..." />
                ) : (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error("Image must be under 5MB.");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = reader.result as string;
                          setImagePreview(base64);
                          setForm((prev) => ({ ...prev, image: { type: "base64", data: base64 }, imageUrl: "" }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    {imagePreview && (
                      <img src={imagePreview} alt="Preview" className="h-20 rounded border border-border object-cover" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 pt-4 border-t border-border bg-muted/50">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => {
              const payload = { ...form };
              if (imageType === "url" && form.imageUrl) {
                payload.image = { type: "url", data: form.imageUrl };
              }
              
              // Bilingual validations
              if (!payload.en.name.trim() || !payload.ar.name.trim()) {
                toast.error("Name is required in both English and Arabic.");
                return;
              }
              if (!payload.en.category.trim() || !payload.ar.category.trim()) {
                toast.error("Category is required in both English and Arabic.");
                return;
              }
              if (!payload.en.area.trim() || !payload.ar.area.trim()) {
                toast.error("Area is required in both English and Arabic.");
                return;
              }

              onSave(payload);
            }} disabled={!valid}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              Save Attraction
            </Button>
          </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Badge ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Landmark: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Mall: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Attraction: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Museum: "bg-green-500/15 text-green-400 border-green-500/30",
  "Arts & Culture": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  Island: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Beach: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>{category}</span>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AttractionConfigPage() {
  const [config, setConfig] = useState<AttractionConfig | null>(null);
  const [arConfig, setArConfig] = useState<AttractionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Dialog
  const [dialog, setDialog] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("Add Attraction");
  const [dialogForm, setDialogForm] = useState<BilingualFormState>(emptyBilingualForm());
  const [isNew, setIsNew] = useState(true);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [resEn, resAr] = await Promise.all([
        api.get("/attraction-config?lang=en"),
        api.get("/attraction-config?lang=ar"),
      ]);
      setConfig(resEn.data.data);
      setArConfig(resAr.data.data);
    } catch {
      toast.error("Failed to load attraction config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setIsNew(true);
    setDialogForm(emptyBilingualForm());
    setDialogTitle("Add Attraction");
    setDialog(true);
  };

  const openEdit = (item: AttractionItem) => {
    setIsNew(false);
    setDialogForm(getBilingualForm(item, arConfig));
    setDialogTitle("Edit Attraction");
    setDialog(true);
  };

  const saveAttraction = async (item: BilingualFormState) => {
    setSaving(true);
    try {
      const reqConfig = item.image?.type === "base64" ? { timeout: 30000 } : {};
      if (isNew) {
        await api.post("/attraction-config/attraction", item, reqConfig);
        toast.success("Attraction added.");
      } else {
        await api.put(`/attraction-config/${item.id}`, item, reqConfig);
        toast.success("Attraction updated.");
      }
      setDialog(false);
      await fetchConfig();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save attraction.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await api.delete(`/attraction-config/${deleteId}`);
      toast.success("Attraction deleted.");
      await fetchConfig();
    } catch {
      toast.error("Failed to delete attraction.");
    } finally {
      setSaving(false);
      setDeleteId(null);
    }
  };

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filtered = (config?.attractions ?? []).filter((a) => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      a.area.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || a.category === filterCategory;
    return matchSearch && matchCat;
  });

  const categories = Array.from(new Set((config?.attractions ?? []).map((a) => a.category).filter(Boolean))).sort();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 min-h-screen animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-600/20 rounded-lg border border-amber-500/30">
            <Compass className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Attraction Config</h1>
            {config?.updatedAt && (
              <p className="text-xs text-muted-foreground">Last updated: {formatTime(config.updatedAt)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}
            >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openAdd}
            className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Attraction
          </Button>
        </div>
      </div>

      {/* Stats */}
      {config && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Attractions", value: config.attractions.length },
            { label: "Categories", value: categories.length },
            { label: "Schema Version", value: config.schemaVersion },
            { label: "Config ID", value: config.configId },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-semibold text-foreground truncate">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by name, id, area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Compass className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{search || filterCategory !== "all" ? "No attractions match your filter." : "No attractions yet."}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id}
              className="bg-card border border-border rounded-xl overflow-hidden group hover:border-primary/40 transition-colors">
              {/* Image */}
              <div className="relative h-36 bg-muted">
                {(item.imageUrl || item.thumbMedia?.data) ? (
                  <img src={item.imageUrl || item.thumbMedia?.data} alt={item.name}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                {/* Warning icon overlay */}
                {!isArabicTranslationComplete(item.id, arConfig) && (
                  <div 
                    className="absolute top-2 left-2 bg-red-600/90 hover:bg-red-600 text-white p-1 rounded-full shadow-md z-10 transition-colors cursor-help"
                    title="Arabic translation missing"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </div>
                )}
                {/* Action buttons overlay */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm"
                    onClick={() => openEdit(item)}
                    className="bg-background/80 hover:bg-background text-blue-400 h-7 w-7 p-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm"
                    onClick={() => setDeleteId(item.id)}
                    className="bg-background/80 hover:bg-background text-red-400 h-7 w-7 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-foreground text-sm leading-tight">{item.name}</h3>
                    <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                  </div>
                  <CategoryBadge category={item.category} />
                </div>
                {item.f_id && (
                  <p className="text-[10px] font-mono text-muted-foreground truncate" title={item.f_id}>f_id: {item.f_id}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />{item.area || "—"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="w-3 h-3" />{item.coordinates.lat.toFixed(3)}, {item.coordinates.lng.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <AttractionDialog
        open={dialog}
        title={dialogTitle}
        formState={dialogForm}
        isNew={isNew}
        onClose={() => setDialog(false)}
        onSave={saveAction => saveAttraction(saveAction)}
      />

      {/* Saving overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg px-6 py-4 flex items-center gap-3">
            <Loader2 className="animate-spin text-amber-400 w-5 h-5" />
            <span className="text-foreground">Saving…</span>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attraction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong className="text-foreground">{deleteId}</strong> from the config.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
