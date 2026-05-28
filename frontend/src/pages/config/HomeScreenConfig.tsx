import { useState, useEffect, useCallback, useRef } from "react";
import {
  GripVertical, Save, X, RefreshCw,
  ChevronDown, ChevronRight, LayoutGrid, Loader2, Check,
  Trash2, Plus, Link2, Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/utils/api";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Section {
  id: string;
  show: boolean;
  order?: number;
  data?: Record<string, unknown>;
}

interface HomeConfig {
  configId: string;
  schemaVersion: number;
  sections: Section[];
  updatedAt?: string;
}

interface CustomComponentData {
  component: Record<string, unknown>;
  action: {
    toType: "screen" | "weburl";
    toValue: string;
  };
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatTime(iso?: string) {
  if (!iso) return "â€”";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isCustomComponent(section: Section): boolean {
  return section.id === "customComponent";
}

function getCustomData(section: Section): CustomComponentData | null {
  if (!section.data) return null;
  const d = section.data as { component?: unknown; action?: unknown };
  if (!d.component || !d.action) return null;
  return d as unknown as CustomComponentData;
}

function defaultComponentTemplate(label: string): Record<string, unknown> {
  return {
    type: "View",
    props: {
      style: {
        padding: 12,
        backgroundColor: "#fff",
        borderRadius: 8,
        marginHorizontal: 12,
      },
    },
    children: [
      {
        type: "Text",
        props: {
          style: { fontSize: 16, fontWeight: "bold", color: "#333" },
        },
        children: label || "Custom Component",
      },
    ],
  };
}

// â”€â”€â”€ Data Field Editor (regular sections) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DataEditor({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const [localData, setLocalData] = useState<Record<string, unknown>>(data);

  const handleChange = (key: string, raw: string) => {
    let value: unknown = raw;
    if (raw === "true") value = true;
    else if (raw === "false") value = false;
    else if (raw !== "" && !isNaN(Number(raw)) && !raw.includes(" ")) value = Number(raw);
    const next = { ...localData, [key]: value };
    setLocalData(next);
    onChange(next);
  };

  const entries = Object.entries(localData);

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No configurable fields</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {entries.map(([key, val]) => {
        const isBoolean = typeof val === "boolean";
        return (
          <div key={key} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground capitalize">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </Label>
            {isBoolean ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={val as boolean}
                  onCheckedChange={(v) => handleChange(key, String(v))}
                />
                <span className="text-xs text-foreground">{val ? "true" : "false"}</span>
              </div>
            ) : typeof val === "object" ? (
              <Input
                className="h-7 text-xs font-mono"
                value={JSON.stringify(val)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    const next = { ...localData, [key]: parsed };
                    setLocalData(next);
                    onChange(next);
                  } catch { /* ignore parse errors mid-type */ }
                }}
              />
            ) : (
              <Input
                className="h-7 text-xs"
                value={String(val)}
                onChange={(e) => handleChange(key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// â”€â”€â”€ Custom Component Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CustomComponentEditor({
  data,
  onChange,
}: {
  data: CustomComponentData;
  onChange: (d: CustomComponentData) => void;
}) {
  const [jsonStr, setJsonStr] = useState(() => JSON.stringify(data.component, null, 2));
  const [jsonError, setJsonError] = useState(false);

  const handleActionTypeChange = (toType: "screen" | "weburl") => {
    onChange({ ...data, action: { toType, toValue: "" } });
  };

  const handleActionValueChange = (toValue: string) => {
    onChange({ ...data, action: { ...data.action, toValue } });
  };

  const handleJsonChange = (raw: string) => {
    setJsonStr(raw);
    try {
      const parsed = JSON.parse(raw);
      setJsonError(false);
      onChange({ ...data, component: parsed });
    } catch {
      setJsonError(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Action Type</Label>
            <Select
              value={data.action.toType}
              onValueChange={(v) => handleActionTypeChange(v as "screen" | "weburl")}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screen" className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5" /> Screen Navigation
                  </span>
                </SelectItem>
                <SelectItem value="weburl" className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Web URL
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {data.action.toType === "weburl" ? "URL" : "Screen Name"}
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder={data.action.toType === "weburl" ? "https://example.com" : "savedRoutes"}
              value={data.action.toValue}
              onChange={(e) => handleActionValueChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Component JSON */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
            Component JSON
          </Label>
          {jsonError && <span className="text-[10px] text-red-400">Invalid JSON</span>}
        </div>
        <Textarea
          className={`font-mono text-[11px] min-h-[160px] resize-y ${jsonError ? "border-red-500" : ""}`}
          value={jsonStr}
          onChange={(e) => handleJsonChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// â”€â”€â”€ Section Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionRow({
  section,
  index,
  total,
  onToggle,
  onDataChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  dragHandleProps,
}: {
  section: Section;
  index: number;
  total: number;
  onToggle: (index: number, show: boolean) => void;
  onDataChange: (index: number, data: Record<string, unknown>) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete?: (index: number) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCustom = isCustomComponent(section);
  const customData = isCustom ? getCustomData(section) : null;
  const hasData = section.data && Object.keys(section.data).length > 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        section.show ? "border-border bg-card" : "border-border/50 bg-muted/30"
      }${isCustom ? " border-l-2 border-l-primary" : ""}`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Order badge */}
        <span className="text-[10px] font-mono text-muted-foreground w-5 text-center shrink-0">
          {index + 1}
        </span>

        {/* Section name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-sm font-medium truncate ${section.show ? "text-foreground" : "text-muted-foreground"}`}>
              {section.id}
            </p>
            {isCustom && (
              <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20 px-1 py-0 h-4">
                Custom
              </Badge>
            )}
            {isCustom && customData && (
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 h-4 ${
                  customData.action.toType === "weburl"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                }`}
              >
                {customData.action.toType === "weburl" ? "URL" : "Screen"}
              </Badge>
            )}
          </div>
          {isCustom && customData?.action.toValue ? (
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              â†’ {customData.action.toValue}
            </p>
          ) : !isCustom && !hasData ? (
            <p className="text-[10px] text-muted-foreground">No configurable fields</p>
          ) : null}
        </div>

        {/* Visible badge */}
        <Badge
          variant="outline"
          className={`text-[10px] shrink-0 ${
            section.show
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {section.show ? "Visible" : "Hidden"}
        </Badge>

        {/* Move up/down */}
        <div className="flex flex-col gap-0.5">
          <button
            disabled={index === 0}
            onClick={() => onMoveUp(index)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px] leading-none px-1"
          >
            â–²
          </button>
          <button
            disabled={index === total - 1}
            onClick={() => onMoveDown(index)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px] leading-none px-1"
          >
            â–¼
          </button>
        </div>

        {/* Show/hide toggle */}
        <Switch
          checked={section.show}
          onCheckedChange={(v) => onToggle(index, v)}
        />

        {/* Delete â€” custom components only */}
        {isCustom && onDelete && (
          <button
            onClick={() => onDelete(index)}
            className="text-red-400 hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors"
            title="Delete custom component"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Expand data */}
        {hasData && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Data editor */}
      {expanded && hasData && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50">
          {isCustom && customData ? (
            <CustomComponentEditor
              data={customData}
              onChange={(d) => onDataChange(index, d as unknown as Record<string, unknown>)}
            />
          ) : (
            <DataEditor
              data={section.data as Record<string, unknown>}
              onChange={(d) => onDataChange(index, d)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Add Custom Component Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AddCustomComponentDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (section: Section) => void;
}) {
  const [actionType, setActionType] = useState<"screen" | "weburl">("screen");
  const [actionValue, setActionValue] = useState("");
  const [label, setLabel] = useState("");
  const [jsonStr, setJsonStr] = useState(() =>
    JSON.stringify(defaultComponentTemplate("Custom Component"), null, 2)
  );
  const [jsonError, setJsonError] = useState(false);

  // Sync label text into the JSON template
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonStr) as {
        children?: Array<{ children?: string }>;
      };
      if (Array.isArray(parsed?.children) && parsed.children[0] !== undefined) {
        parsed.children[0].children = label || "Custom Component";
        setJsonStr(JSON.stringify(parsed, null, 2));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  const handleJsonChange = (raw: string) => {
    setJsonStr(raw);
    try {
      JSON.parse(raw);
      setJsonError(false);
    } catch {
      setJsonError(true);
    }
  };

  const reset = () => {
    setActionType("screen");
    setActionValue("");
    setLabel("");
    setJsonStr(JSON.stringify(defaultComponentTemplate("Custom Component"), null, 2));
    setJsonError(false);
  };

  const handleAdd = () => {
    if (!actionValue.trim()) {
      toast.error(actionType === "weburl" ? "Please enter a URL" : "Please enter a screen name");
      return;
    }
    if (jsonError) {
      toast.error("Component JSON is invalid");
      return;
    }
    let component: Record<string, unknown>;
    try {
      component = JSON.parse(jsonStr);
    } catch {
      toast.error("Component JSON is invalid");
      return;
    }
    const section: Section = {
      id: "customComponent",
      show: true,
      data: {
        component,
        action: { toType: actionType, toValue: actionValue.trim() },
      },
    };
    onAdd(section);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Custom Component</DialogTitle>
          <DialogDescription>
            Configure the action and component definition for the new section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs">Display Label</Label>
            <Input
              placeholder="Custom Component"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Action Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Action Type</Label>
            <Select
              value={actionType}
              onValueChange={(v) => { setActionType(v as "screen" | "weburl"); setActionValue(""); }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screen">
                  <span className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5" /> Screen Navigation
                  </span>
                </SelectItem>
                <SelectItem value="weburl">
                  <span className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5" /> Web URL
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Value */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              {actionType === "weburl" ? "URL" : "Screen Name"}
            </Label>
            <Input
              placeholder={actionType === "weburl" ? "https://example.com" : "savedRoutes"}
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Component JSON */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Component JSON</Label>
              {jsonError && <span className="text-[10px] text-red-400">Invalid JSON</span>}
            </div>
            <Textarea
              className={`font-mono text-[11px] min-h-[180px] resize-y ${jsonError ? "border-red-500" : ""}`}
              value={jsonStr}
              onChange={(e) => handleJsonChange(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={jsonError}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function HomeScreenConfigPage() {
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Drag state
  const dragIndex = useRef<number | null>(null);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    api
      .get("/admin-dashboard/home-screen-config")
      .then((res) => {
        const data: HomeConfig = res.data?.data || res.data;
        setConfig(data);
        setSections(data.sections || []);
        setDirty(false);
      })
      .catch(() => toast.error("Failed to load home screen config"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const updateSections = (next: Section[]) => {
    setSections(next);
    setDirty(true);
  };

  const handleToggle = (index: number, show: boolean) => {
    updateSections(sections.map((s, i) => i === index ? { ...s, show } : s));
  };

  const handleDataChange = (index: number, data: Record<string, unknown>) => {
    updateSections(sections.map((s, i) => i === index ? { ...s, data } : s));
  };

  const handleDelete = (index: number) => {
    updateSections(sections.filter((_, i) => i !== index));
  };

  const handleAddCustom = (section: Section) => {
    updateSections([...sections, section]);
    toast.success("Custom component added");
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...sections];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updateSections(next);
  };

  const moveDown = (index: number) => {
    if (index === sections.length - 1) return;
    const next = [...sections];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updateSections(next);
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...sections];
    const [removed] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, removed);
    dragIndex.current = index;
    updateSections(next);
  };

  const handleDragEnd = () => { dragIndex.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      const sectionsWithOrder = sections.map((s, i) => ({ ...s, order: i }));
      await api.put("/admin-dashboard/home-screen-config", { sections: sectionsWithOrder });
      toast.success("Home screen config saved");
      setDirty(false);
      fetchConfig();
    } catch {
      toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const customCount = sections.filter((s) => s.id === "customComponent").length;
  const visibleCount = sections.filter((s) => s.show).length;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Home Screen Config</h1>
            <p className="text-xs text-muted-foreground">
              Manage section order, visibility and data fields Â· Last saved:{" "}
              {config ? formatTime(config.updatedAt) : "â€”"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchConfig}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {dirty && (
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </Button>
          )}
          {!dirty && !loading && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Check className="w-3.5 h-3.5" /> Saved
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Sections", value: sections.length, color: "text-foreground" },
          { label: "Visible", value: visibleCount, color: "text-green-400" },
          { label: "Hidden", value: sections.length - visibleCount, color: "text-muted-foreground" },
          { label: "Custom", value: customCount, color: "text-primary" },
        ].map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Section list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">Sections</p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground hidden sm:block">
              Drag to reorder Â· toggle to show/hide Â· expand to edit
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddDialogOpen(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add Custom Component
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
            <p>No sections found</p>
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Custom Component
            </Button>
          </div>
        ) : (
          sections.map((section, index) => (
            <div
              key={`${section.id}-${index}`}
              draggable
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDragEnd={handleDragEnd}
            >
              <SectionRow
                section={section}
                index={index}
                total={sections.length}
                onToggle={handleToggle}
                onDataChange={handleDataChange}
                onMoveUp={moveUp}
                onMoveDown={moveDown}
                onDelete={isCustomComponent(section) ? handleDelete : undefined}
                dragHandleProps={{
                  onDragStart: handleDragStart(index) as unknown as React.DragEventHandler<HTMLDivElement>,
                }}
              />
            </div>
          ))
        )}
      </div>

      {/* Add Custom Component Dialog */}
      <AddCustomComponentDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddCustom}
      />

      {/* Unsaved changes banner */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-card border border-border rounded-xl px-5 py-3 shadow-2xl z-50">
          <span className="text-sm text-foreground">You have unsaved changes</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchConfig}
            disabled={saving}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Discard
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

