import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Edit2, Save, X, RefreshCw, Loader2, ChevronDown, ChevronRight,
  LayoutList, Image, MapPin, Tag, Globe,
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

interface SectionItem {
  id: string;
  name: string;
  category: string;
  area: string;
  imageUrl: string;
  featureSectionLabel: string;
  coordinates: { lat: number; lng: number };
}

interface FeaturedSection {
  sectionId: string;
  sectionLabel: string;
  sectionLabelKey: string;
  items: SectionItem[];
}

interface FeaturedSectionsConfig {
  configId: string;
  schemaVersion: number;
  featuredSections: FeaturedSection[];
  updatedAt?: string;
}

// ─── Empty templates ────────────────────────────────────────────────────────

const emptySection = (): Omit<FeaturedSection, "items"> & { items: SectionItem[] } => ({
  sectionId: "",
  sectionLabel: "",
  sectionLabelKey: "",
  items: [],
});

const emptyItem = (): SectionItem => ({
  id: "",
  name: "",
  category: "",
  area: "",
  imageUrl: "",
  featureSectionLabel: "",
  coordinates: { lat: 0, lng: 0 },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Item Dialog ─────────────────────────────────────────────────────────────

function ItemDialog({
  open,
  title,
  item,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  item: SectionItem;
  onClose: () => void;
  onSave: (item: SectionItem) => void;
}) {
  const [form, setForm] = useState<SectionItem>(item);

  useEffect(() => { setForm(item); }, [item]);

  const set = (key: keyof SectionItem, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setCoord = (key: "lat" | "lng", value: string) =>
    setForm((prev) => ({ ...prev, coordinates: { ...prev.coordinates, [key]: parseFloat(value) || 0 } }));

  const valid = form.id.trim() && form.name.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700 text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-gray-400">Fill in the section item details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-gray-300">ID *</Label>
              <Input value={form.id} onChange={(e) => set("id", e.target.value)}
                placeholder="burj-khalifa" className="bg-gray-800 border-gray-600 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="Burj Khalifa" className="bg-gray-800 border-gray-600 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-gray-300">Category</Label>
              <Input value={form.category} onChange={(e) => set("category", e.target.value)}
                placeholder="Landmark" className="bg-gray-800 border-gray-600 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300">Area</Label>
              <Input value={form.area} onChange={(e) => set("area", e.target.value)}
                placeholder="Downtown Dubai" className="bg-gray-800 border-gray-600 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-gray-300">Image URL</Label>
            <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)}
              placeholder="https://..." className="bg-gray-800 border-gray-600 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-300">Feature Section Label</Label>
            <Input value={form.featureSectionLabel} onChange={(e) => set("featureSectionLabel", e.target.value)}
              placeholder="Top 10 Tourist Places in Dubai" className="bg-gray-800 border-gray-600 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-gray-300">Latitude</Label>
              <Input type="number" value={form.coordinates.lat}
                onChange={(e) => setCoord("lat", e.target.value)}
                className="bg-gray-800 border-gray-600 text-white" />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300">Longitude</Label>
              <Input type="number" value={form.coordinates.lng}
                onChange={(e) => setCoord("lng", e.target.value)}
                className="bg-gray-800 border-gray-600 text-white" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-gray-400">Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!valid}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            Save Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section Dialog ───────────────────────────────────────────────────────────

function SectionDialog({
  open,
  title,
  section,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  section: FeaturedSection;
  onClose: () => void;
  onSave: (s: FeaturedSection) => void;
}) {
  const [form, setForm] = useState<FeaturedSection>(section);

  useEffect(() => { setForm(section); }, [section]);

  const set = (key: keyof Omit<FeaturedSection, "items">, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const valid = form.sectionId.trim() && form.sectionLabel.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-gray-100">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-gray-400">Set the section metadata.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1">
            <Label className="text-gray-300">Section ID *</Label>
            <Input value={form.sectionId} onChange={(e) => set("sectionId", e.target.value)}
              placeholder="dubai-top-10" className="bg-gray-800 border-gray-600 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-300">Section Label *</Label>
            <Input value={form.sectionLabel} onChange={(e) => set("sectionLabel", e.target.value)}
              placeholder="Top 10 Tourist Places in Dubai" className="bg-gray-800 border-gray-600 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-300">Section Label Key</Label>
            <Input value={form.sectionLabelKey} onChange={(e) => set("sectionLabelKey", e.target.value)}
              placeholder="sections.dubai_top10" className="bg-gray-800 border-gray-600 text-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-gray-400">Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!valid}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            Save Section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function FeaturedSectionsPage() {
  const [config, setConfig] = useState<FeaturedSectionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Section dialog
  const [sectionDialog, setSectionDialog] = useState(false);
  const [sectionDialogTitle, setSectionDialogTitle] = useState("Add Section");
  const [sectionForm, setSectionForm] = useState<FeaturedSection>({ ...emptySection() });
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  // Item dialog
  const [itemDialog, setItemDialog] = useState(false);
  const [itemDialogTitle, setItemDialogTitle] = useState("Add Item");
  const [itemForm, setItemForm] = useState<SectionItem>(emptyItem());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTargetSectionId, setItemTargetSectionId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "section" | "item"; sectionId: string; itemId?: string } | null>(null);

  // ─── Fetch ───────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/featured-sections");
      setConfig(res.data.data);
    } catch {
      toast.error("Failed to load featured sections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ─── Section CRUD ────────────────────────────────────────────────────────

  const openAddSection = () => {
    setEditingSectionId(null);
    setSectionForm({ ...emptySection() });
    setSectionDialogTitle("Add Section");
    setSectionDialog(true);
  };

  const openEditSection = (section: FeaturedSection) => {
    setEditingSectionId(section.sectionId);
    setSectionForm({ ...section });
    setSectionDialogTitle("Edit Section");
    setSectionDialog(true);
  };

  const saveSection = async (form: FeaturedSection) => {
    setSaving(true);
    try {
      if (editingSectionId) {
        await api.put(`/featured-sections/${editingSectionId}`, form);
        toast.success("Section updated.");
      } else {
        await api.post("/featured-sections/section", form);
        toast.success("Section added.");
      }
      setSectionDialog(false);
      await fetchConfig();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save section.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSection = (sectionId: string) => {
    setDeleteConfirm({ type: "section", sectionId });
  };

  const handleDeleteSection = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "section") return;
    setSaving(true);
    try {
      await api.delete(`/featured-sections/${deleteConfirm.sectionId}`);
      toast.success("Section deleted.");
      await fetchConfig();
    } catch {
      toast.error("Failed to delete section.");
    } finally {
      setSaving(false);
      setDeleteConfirm(null);
    }
  };

  // ─── Item CRUD ────────────────────────────────────────────────────────────

  const openAddItem = (sectionId: string) => {
    setItemTargetSectionId(sectionId);
    setEditingItemId(null);
    setItemForm(emptyItem());
    setItemDialogTitle("Add Item");
    setItemDialog(true);
  };

  const openEditItem = (sectionId: string, item: SectionItem) => {
    setItemTargetSectionId(sectionId);
    setEditingItemId(item.id);
    setItemForm({ ...item });
    setItemDialogTitle("Edit Item");
    setItemDialog(true);
  };

  const saveItem = async (item: SectionItem) => {
    if (!config || !itemTargetSectionId) return;
    setSaving(true);

    const section = config.featuredSections.find((s) => s.sectionId === itemTargetSectionId);
    if (!section) { setSaving(false); return; }

    let updatedItems: SectionItem[];
    if (editingItemId) {
      updatedItems = section.items.map((i) => i.id === editingItemId ? item : i);
    } else {
      updatedItems = [...section.items, item];
    }

    const updatedSection: FeaturedSection = { ...section, items: updatedItems };

    try {
      await api.put(`/featured-sections/${itemTargetSectionId}`, updatedSection);
      toast.success(editingItemId ? "Item updated." : "Item added.");
      setItemDialog(false);
      await fetchConfig();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save item.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteItem = (sectionId: string, itemId: string) => {
    setDeleteConfirm({ type: "item", sectionId, itemId });
  };

  const handleDeleteItem = async () => {
    if (!config || !deleteConfirm || deleteConfirm.type !== "item" || !deleteConfirm.itemId) return;
    setSaving(true);

    const section = config.featuredSections.find((s) => s.sectionId === deleteConfirm.sectionId);
    if (!section) { setSaving(false); return; }

    const updatedSection: FeaturedSection = {
      ...section,
      items: section.items.filter((i) => i.id !== deleteConfirm.itemId),
    };

    try {
      await api.put(`/featured-sections/${deleteConfirm.sectionId}`, updatedSection);
      toast.success("Item deleted.");
      await fetchConfig();
    } catch {
      toast.error("Failed to delete item.");
    } finally {
      setSaving(false);
      setDeleteConfirm(null);
    }
  };

  // ─── UI helpers ──────────────────────────────────────────────────────────

  const toggleExpand = (sectionId: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg border border-blue-500/30">
            <LayoutList className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Featured Sections</h1>
            {config?.updatedAt && (
              <p className="text-xs text-gray-500">Last updated: {formatTime(config.updatedAt)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}
            className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openAddSection}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Section
          </Button>
        </div>
      </div>

      {/* Stats */}
      {config && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Sections", value: config.featuredSections.length },
            { label: "Total Items", value: config.featuredSections.reduce((n, s) => n + s.items.length, 0) },
            { label: "Schema Version", value: config.schemaVersion },
            { label: "Config ID", value: config.configId },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="text-lg font-semibold text-white truncate">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sections list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 bg-gray-800 rounded-lg" />)}
        </div>
      ) : !config || config.featuredSections.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <LayoutList className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No sections yet. Click <strong>Add Section</strong> to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {config.featuredSections.map((section) => {
            const expanded = expandedSections.has(section.sectionId);
            return (
              <div key={section.sectionId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Section header */}
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
                  onClick={() => toggleExpand(section.sectionId)}>
                  <div className="flex items-center gap-3">
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />
                    }
                    <div>
                      <span className="font-medium text-white">{section.sectionLabel}</span>
                      <span className="ml-2 text-xs text-gray-500 font-mono">{section.sectionId}</span>
                    </div>
                    <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-xs">
                      {section.items.length} items
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openEditSection(section)}
                      className="text-gray-400 hover:text-blue-400 hover:bg-blue-600/10">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => confirmDeleteSection(section.sectionId)}
                      className="text-gray-400 hover:text-red-400 hover:bg-red-600/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Items */}
                {expanded && (
                  <div className="border-t border-gray-800">
                    <div className="px-4 py-2 flex items-center justify-between bg-gray-800/30">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Items</span>
                      <Button variant="ghost" size="sm" onClick={() => openAddItem(section.sectionId)}
                        className="text-blue-400 hover:bg-blue-600/10 h-7 text-xs">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                      </Button>
                    </div>

                    {section.items.length === 0 ? (
                      <div className="px-4 py-6 text-center text-gray-600 text-sm">
                        No items. Click <strong className="text-gray-400">Add Item</strong>.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-800">
                        {section.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-800/30">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name}
                                className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                                <Image className="w-5 h-5 text-gray-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white text-sm">{item.name}</span>
                                <span className="text-xs font-mono text-gray-600">{item.id}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <Tag className="w-3 h-3" />{item.category}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="w-3 h-3" />{item.area}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <Globe className="w-3 h-3" />{item.coordinates.lat.toFixed(4)}, {item.coordinates.lng.toFixed(4)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditItem(section.sectionId, item)}
                                className="text-gray-400 hover:text-blue-400 hover:bg-blue-600/10">
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => confirmDeleteItem(section.sectionId, item.id)}
                                className="text-gray-400 hover:text-red-400 hover:bg-red-600/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Section dialog */}
      <SectionDialog
        open={sectionDialog}
        title={sectionDialogTitle}
        section={sectionForm}
        onClose={() => setSectionDialog(false)}
        onSave={saveSection}
      />

      {/* Item dialog */}
      <ItemDialog
        open={itemDialog}
        title={itemDialogTitle}
        item={itemForm}
        onClose={() => setItemDialog(false)}
        onSave={saveItem}
      />

      {/* Saving overlay */}
      {saving && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-6 py-4 flex items-center gap-3">
            <Loader2 className="animate-spin text-blue-400 w-5 h-5" />
            <span className="text-white">Saving…</span>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete {deleteConfirm?.type === "section" ? "Section" : "Item"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 text-gray-300 hover:bg-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConfirm?.type === "section" ? handleDeleteSection : handleDeleteItem}
              className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
