import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, Edit2, RefreshCw, Loader2,
  Image as ImageIcon, Link as LinkIcon, Upload, ExternalLink,
  AlertCircle, Check, X,
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
import { toast } from "sonner";
import { api } from "@/utils/api";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CategoryImagesData {
  images: Record<string, string>;
}

type InputMode = "url" | "base64";

interface EntryForm {
  key: string;
  value: string;
  mode: InputMode;
}

// ─── Category colour badges ─────────────────────────────────────────────────

const KNOWN_CATEGORY_COLORS: Record<string, string> = {
  restaurant:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cafe:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  hotel:       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  shopping:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  health:      "bg-red-500/15 text-red-400 border-red-500/30",
  attraction:  "bg-pink-500/15 text-pink-400 border-pink-500/30",
  park:        "bg-green-500/15 text-green-400 border-green-500/30",
  services:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  transport:   "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  civic:       "bg-teal-500/15 text-teal-400 border-teal-500/30",
  education:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  general:     "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

function keyBadge(key: string) {
  return KNOWN_CATEGORY_COLORS[key] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";
}

// ─── Image preview card ─────────────────────────────────────────────────────

function ImageCard({
  category,
  src,
  onEdit,
  onDelete,
}: {
  category: string;
  src: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isBase64 = src.startsWith("data:");

  return (
    <div className="group relative bg-gray-800/60 border border-gray-700/60 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
      {/* Image preview */}
      <div className="relative h-40 bg-gray-900 flex items-center justify-center overflow-hidden">
        {imgErr ? (
          <div className="flex flex-col items-center gap-2 text-gray-500 text-xs px-4 text-center">
            <AlertCircle className="h-6 w-6" />
            <span>Preview unavailable</span>
          </div>
        ) : (
          <img
            src={src}
            alt={category}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        )}

        {/* action overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 pb-4 px-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 bg-gray-700/90 hover:bg-gray-600 text-white border-0 text-xs font-medium rounded-md transition-colors"
            onClick={onEdit}
          >
            <Edit2 className="h-3.5 w-3.5 shrink-0" />
            <span>Edit</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2.5 inline-flex items-center justify-center gap-1.5 bg-red-700/90 hover:bg-red-600 text-white border-0 text-xs font-medium rounded-md transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* footer */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keyBadge(category)}`}>
          {category}
        </span>
        {isBase64 ? (
          <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-400 bg-violet-500/10">
            Upload Image
          </Badge>
        ) : (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-gray-500 hover:text-blue-400 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Entry Dialog (add / edit) ──────────────────────────────────────────────

function EntryDialog({
  open,
  isNew,
  initial,
  existingKeys,
  onClose,
  onSave,
}: {
  open: boolean;
  isNew: boolean;
  initial: EntryForm;
  existingKeys: string[];
  onClose: () => void;
  onSave: (form: EntryForm) => Promise<void>;
}) {
  const [form, setForm] = useState<EntryForm>(initial);
  const [saving, setSaving] = useState(false);
  const [previewErr, setPreviewErr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initial);
    setPreviewErr(false);
  }, [initial, open]);

  const set = <K extends keyof EntryForm>(k: K, v: EntryForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setForm((prev) => ({ ...prev, value: result, mode: "base64" }));
      setPreviewErr(false);
    };
    reader.readAsDataURL(file);
  };

  const keyError =
    isNew && form.key && existingKeys.includes(form.key.trim())
      ? "Key already exists."
      : isNew && form.key && !/^[a-zA-Z0-9_-]+$/.test(form.key)
      ? "Only letters, numbers, _ and - are allowed."
      : "";

  const valid =
    form.key.trim() !== "" &&
    form.value.trim() !== "" &&
    !keyError;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = form.value.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700 text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isNew ? "Add Category Image" : `Edit — ${initial.key}`}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {isNew
              ? "Define a new POI category and its default banner image."
              : "Update the banner image for this category."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Key */}
          <div className="space-y-1.5">
            <Label className="text-gray-300">Category Key *</Label>
            <Input
              value={form.key}
              onChange={(e) => set("key", e.target.value.toLowerCase())}
              disabled={!isNew}
              placeholder="e.g. nightlife"
              className="bg-gray-800 border-gray-600 text-white disabled:opacity-50"
            />
            {keyError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {keyError}
              </p>
            )}
          </div>

          {/* Mode tabs */}
          <div className="space-y-1.5">
            <Label className="text-gray-300">Image Source</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("mode", "url")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  form.mode === "url"
                    ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                    : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                <LinkIcon className="h-3.5 w-3.5" /> URL
              </button>
              <button
                type="button"
                onClick={() => {
                  set("mode", "base64");
                  fileInputRef.current?.click();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  form.mode === "base64"
                    ? "bg-violet-600/20 border-violet-500/50 text-violet-400"
                    : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                <Upload className="h-3.5 w-3.5" /> Upload File
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Value */}
          {form.mode === "url" ? (
            <div className="space-y-1.5">
              <Label className="text-gray-300">Image URL *</Label>
              <Input
                value={form.value}
                onChange={(e) => { set("value", e.target.value); setPreviewErr(false); }}
                placeholder="https://example.com/image.jpg"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-gray-300">Uploaded Image</Label>
              {form.value ? (
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400">File loaded</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-gray-400"
                    onClick={() => { fileInputRef.current?.click(); }}
                  >
                    <Upload className="h-3 w-3 mr-1" /> Replace
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose Image
                </Button>
              )}
            </div>
          )}

          {/* Preview */}
          {previewSrc && (
            <div className="space-y-1.5">
              <Label className="text-gray-300">Preview</Label>
              <div className="h-32 bg-gray-950 rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
                {previewErr ? (
                  <div className="flex flex-col items-center gap-1 text-gray-500 text-xs">
                    <ImageIcon className="h-5 w-5" />
                    <span>Cannot load preview</span>
                  </div>
                ) : (
                  <img
                    src={previewSrc}
                    alt="preview"
                    className="h-full w-full object-cover"
                    onError={() => setPreviewErr(true)}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-gray-400" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!valid || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {isNew ? "Add Category" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

const EMPTY_FORM: EntryForm = { key: "", value: "", mode: "url" };

export default function CategoryImagesPage() {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogIsNew, setDialogIsNew] = useState(true);
  const [dialogInitial, setDialogInitial] = useState<EntryForm>(EMPTY_FORM);

  // Delete confirm
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: CategoryImagesData }>("/category-images");
      setImages(res.data.data?.images ?? {});
    } catch {
      setError("Failed to load category images.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openAdd = () => {
    setDialogIsNew(true);
    setDialogInitial(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (key: string) => {
    const src = images[key];
    setDialogIsNew(false);
    setDialogInitial({ key, value: src, mode: src.startsWith("data:") ? "base64" : "url" });
    setDialogOpen(true);
  };

  const handleSave = async (form: EntryForm) => {
    try {
      await api.put(`/category-images/${form.key.trim()}`, { value: form.value.trim() });
      setImages((prev) => ({ ...prev, [form.key.trim()]: form.value.trim() }));
      toast.success(dialogIsNew ? `Category "${form.key}" added.` : `Category "${form.key}" updated.`);
      setDialogOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save.";
      toast.error(msg);
      throw err;
    }
  };

  const confirmDelete = (key: string) => setDeleteKey(key);

  const handleDelete = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    try {
      await api.delete(`/category-images/${deleteKey}`);
      setImages((prev) => {
        const next = { ...prev };
        delete next[deleteKey];
        return next;
      });
      toast.success(`Category "${deleteKey}" deleted.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to delete.";
      toast.error(msg);
    } finally {
      setDeleting(false);
      setDeleteKey(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const entries = Object.entries(images);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Category Images</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Default banner images shown for each POI category in the mobile app.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchImages}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add Category
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && !error && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="bg-muted border border-border rounded-full px-3 py-1">
            {entries.length} categories
          </span>
          <span className="bg-muted border border-border rounded-full px-3 py-1">
            {entries.filter(([, v]) => v.startsWith("data:")).length} base64
          </span>
          <span className="bg-muted border border-border rounded-full px-3 py-1">
            {entries.filter(([, v]) => !v.startsWith("data:")).length} URL
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <Button variant="ghost" size="sm" onClick={fetchImages} className="ml-auto text-red-400 hover:text-red-300">
            Retry
          </Button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-40 w-full rounded-xl bg-gray-800" />
              <Skeleton className="h-4 w-20 rounded bg-gray-800" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 gap-3">
          <ImageIcon className="h-12 w-12 opacity-40" />
          <p className="text-lg font-medium">No category images configured</p>
          <Button size="sm" onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Add First Category
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {entries.map(([key, src]) => (
            <ImageCard
              key={key}
              category={key}
              src={src}
              onEdit={() => openEdit(key)}
              onDelete={() => confirmDelete(key)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <EntryDialog
        open={dialogOpen}
        isNew={dialogIsNew}
        initial={dialogInitial}
        existingKeys={dialogIsNew ? Object.keys(images) : []}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteKey} onOpenChange={(o) => !o && setDeleteKey(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Category Image</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will permanently remove the <span className="text-white font-medium">"{deleteKey}"</span> category
              image. POIs in this category will fall back to no banner image.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
