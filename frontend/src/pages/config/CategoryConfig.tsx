import { useState, useEffect, useCallback, useRef } from "react";
import {
  Edit2, Save, X, Plus, GripVertical, Eye, EyeOff, Trash2,
  ChevronDown, ChevronRight, Loader2, RefreshCw, Settings2,
  AlertCircle, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api } from "@/utils/api";

// ── Field type metadata ────────────────────────────────────────────────────────

interface FieldOption {
  label: string;
  value: string;
  label_ar?: string;
}

interface CategoryField {
  key: string;
  label: string;
  label_ar?: string;
  type: string;
  placeholder?: string;
  placeholder_ar?: string;
  required: boolean;
  show: boolean;
  defaultValue?: boolean | string | number;
  keyboardType?: string;
  layout?: string;
  maxLength?: number;
  numberOfLines?: number;
  showCharCount?: boolean;
  options?: FieldOption[];
  visibleWhen?: { key: string; values: string[] };
  [key: string]: unknown;
}

interface MatchKeywordItem {
  id: string;
  label: string;
}

interface Category {
  id: string;
  label: string;
  label_ar?: string;
  matchKeywords: string[];
  matchKeywordsList?: MatchKeywordItem[];
  fields: CategoryField[];
}

interface CategoryConfigData {
  schemaVersion: number;
  configId: string;
  description: string;
  targetStep: string;
  categories: Record<string, Category>;
  createdAt: string;
  updatedAt: string;
  seeded: boolean;
  langCode?: string;
}

const normalizeKeywordId = (keyword: string) =>
  keyword.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");

const getArabicCategory = (arabicConfig: CategoryConfigData | null, categoryId: string) =>
  arabicConfig?.categories?.[categoryId] ?? null;

const getArabicKeywordLabel = (arabicCategory: Category | null, keyword: string) => {
  if (!arabicCategory?.matchKeywordsList) return "";
  const normalized = normalizeKeywordId(keyword);
  return arabicCategory.matchKeywordsList.find((item) => item.id === keyword || item.id === normalized)?.label ?? "";
};

const mergeFieldTranslation = (field: CategoryField, arabicCategory: Category | null): CategoryField => {
  const arabicField = arabicCategory?.fields?.find((item) => item.key === field.key);
  if (!arabicField) return field;

  return {
    ...field,
    label_ar: field.label_ar ?? arabicField.label,
    placeholder_ar: field.placeholder_ar ?? arabicField.placeholder,
    options: field.options?.map((option) => ({
      ...option,
      label_ar:
        option.label_ar ??
        arabicField.options?.find((arabicOption) => arabicOption.value === option.value)?.label ??
        "",
    })),
  };
};

const mergeCategoryTranslation = (category: Category, arabicConfig: CategoryConfigData | null): Category => {
  const arabicCategory = getArabicCategory(arabicConfig, category.id);
  if (!arabicCategory) return category;

  return {
    ...category,
    label_ar: category.label_ar ?? arabicCategory.label,
    matchKeywordsList: category.matchKeywordsList ?? arabicCategory.matchKeywordsList,
    fields: category.fields.map((field) => mergeFieldTranslation(field, arabicCategory)),
  };
};

const toEnglishField = (field: CategoryField): CategoryField => {
  const { label_ar: _labelAr, placeholder_ar: _placeholderAr, options, ...rest } = field;
  return {
    ...rest,
    options: options?.map(({ label_ar: _optionLabelAr, ...option }) => option),
  };
};

const toArabicField = (field: CategoryField, existingField?: CategoryField): CategoryField => {
  const { label_ar, placeholder_ar, options, ...rest } = field;
  return {
    ...rest,
    label: label_ar?.trim() || existingField?.label || field.label,
    placeholder: placeholder_ar?.trim() || existingField?.placeholder || field.placeholder,
    options: options?.map((option) => {
      const existingOption = existingField?.options?.find((item) => item.value === option.value);
      const { label_ar: optionLabelAr, ...restOption } = option;
      return {
        ...restOption,
        label: optionLabelAr?.trim() || existingOption?.label || option.label,
      };
    }),
  };
};

const buildLocalizedConfig = (
  source: CategoryConfigData,
  langCode: "en" | "ar",
  existingArabicConfig: CategoryConfigData | null
): CategoryConfigData => {
  const categories = Object.fromEntries(
    Object.entries(source.categories).map(([categoryId, category]) => {
      const existingArabicCategory = existingArabicConfig?.categories?.[categoryId];

      if (langCode === "ar") {
        const { label_ar, fields, ...restCategory } = category;
        return [
          categoryId,
          {
            ...restCategory,
            label: label_ar?.trim() || existingArabicCategory?.label || category.label,
            fields: fields.map((field) =>
              toArabicField(
                field,
                existingArabicCategory?.fields?.find((item) => item.key === field.key)
              )
            ),
          },
        ];
      }

      const { label_ar: _labelAr, fields, ...restCategory } = category;
      return [
        categoryId,
        {
          ...restCategory,
          fields: fields.map(toEnglishField),
        },
      ];
    })
  ) as Record<string, Category>;

  return {
    ...source,
    langCode,
    categories,
  };
};

const FIELD_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "toggle", label: "Toggle / Switch" },
  { value: "select", label: "Single Select" },
  { value: "multiSelect", label: "Multi Select" },
  { value: "textarea", label: "Text Area" },
  { value: "timePicker", label: "Time Picker" },
];

const fieldTypeBadgeColor: Record<string, string> = {
  text: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  toggle: "bg-green-500/15 text-green-400 border-green-500/30",
  select: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  multiSelect: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  textarea: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  timePicker: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

// ── DraggableFieldList ─────────────────────────────────────────────────────────

function DraggableFieldList({
  fields,
  editMode,
  onReorder,
  onToggleShow,
  onDelete,
  onEdit,
  onAdd,
}: {
  fields: CategoryField[];
  editMode: boolean;
  onReorder: (newFields: CategoryField[]) => void;
  onToggleShow: (key: string) => void;
  onDelete: (key: string) => void;
  onEdit: (field: CategoryField) => void;
  onAdd: () => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragIndex.current = idx;
    setDraggingKey(fields[idx].key);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragEnter = (idx: number) => {
    dragOverIndex.current = idx;
    setOverKey(fields[idx].key);
  };
  const handleDragEnd = () => {
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    }
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDraggingKey(null);
    setOverKey(null);
  };

  return (
    <div className="space-y-1.5">
      {fields.map((field, idx) => {
        const colorClass =
          fieldTypeBadgeColor[field.type] ?? "bg-muted text-muted-foreground border-border";
        const isDragging = draggingKey === field.key;
        const isOver = overKey === field.key && draggingKey !== field.key

        return (
          <div
            key={field.key}
            draggable={editMode}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all",
              field.show
                ? "bg-card border-border"
                : "bg-muted/40 border-dashed border-border opacity-60",
              isDragging ? "opacity-30 scale-95" : "",
              isOver ? "border-primary/60 bg-primary/5" : "",
            ].join(" ")}
          >
            {editMode && (
              <span className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                <GripVertical className="w-4 h-4" />
              </span>
            )}

            <div className="flex-1 min-w-0">
              {/* English label + Arabic label side by side */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground truncate">{field.label}</p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-mono">{field.key}</span>
                {field.required && <span className="ml-1 text-red-400">· required</span>}
                {field.placeholder && <span className="ml-1">· &ldquo;{field.placeholder}&rdquo;</span>}
                {field.options && <span className="ml-1">· {field.options.length} options</span>}
              </p>
            </div>

            <Badge variant="outline" className={`text-[10px] shrink-0 ${colorClass}`}>
              {field.type}
            </Badge>

            {editMode ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onToggleShow(field.key)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title={field.show ? "Hide field" : "Show field"}
                >
                  {field.show ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onEdit(field)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Edit field"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(field.key)}
                  className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                  title="Delete field"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-muted-foreground">
                {field.show ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </span>
            )}
          </div>
        );
      })}

      {editMode && (
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-dashed border-primary/40 text-primary/70 hover:text-primary hover:border-primary text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Field
        </button>
      )}
    </div>
  );
}

// ── Field Dialog (add / edit) — BILINGUAL ─────────────────────────────────────

interface FieldDialogState {
  open: boolean;
  categoryId: string;
  field: Partial<CategoryField>;
  isNew: boolean;
}

function FieldDialog({
  state,
  onClose,
  onSave,
}: {
  state: FieldDialogState;
  onClose: () => void;
  onSave: (categoryId: string, field: CategoryField, isNew: boolean) => void;
}) {
  const [form, setForm] = useState<Partial<CategoryField>>(state.field);
  const [optionInput, setOptionInput] = useState("");

  useEffect(() => {
    setForm({ ...state.field });
    setOptionInput("");
  }, [state.field, state.open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const needsOptions = form.type === "select" || form.type === "multiSelect";

  const addOption = () => {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    const value = trimmed
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const opt: FieldOption = { label: trimmed, value, label_ar: "" };
    set("options", [...(form.options ?? []), opt]);
    setOptionInput("");
  };

  const removeOption = (idx: number) =>
    set("options", (form.options ?? []).filter((_, i) => i !== idx));

  const updateOption = (idx: number, key: keyof FieldOption, val: string) => {
    const updated = (form.options ?? []).map((opt, i) =>
      i === idx ? { ...opt, [key]: val } : opt
    );
    set("options", updated);
  };

  const handleSave = () => {
    if (!form.key?.trim() || !form.label?.trim() || !form.type) {
      toast({
        title: "Validation",
        description: "Key, Label, and Type are required.",
        variant: "destructive",
      });
      return;
    }
    if (needsOptions && (!form.options || form.options.length === 0)) {
      toast({
        title: "Validation",
        description: "Select / MultiSelect fields require at least one option.",
        variant: "destructive",
      });
      return;
    }

    const field: CategoryField = {
      key: (form.key as string).trim(),
      label: (form.label as string).trim(),
      label_ar: (form.label_ar as string | undefined)?.trim() || undefined,
      type: form.type as string,
      required: (form.required as boolean) ?? false,
      show: form.show !== false,
    };

    if (form.placeholder) field.placeholder = form.placeholder as string;
    if (form.placeholder_ar) field.placeholder_ar = form.placeholder_ar as string;
    if (form.type === "text" || form.type === "textarea") {
      if (form.keyboardType) field.keyboardType = form.keyboardType as string;
      if (form.layout) field.layout = form.layout as string;
    }
    if (form.type === "textarea") {
      if (form.maxLength) field.maxLength = form.maxLength as number;
      if (form.numberOfLines) field.numberOfLines = form.numberOfLines as number;
      field.showCharCount = (form.showCharCount as boolean) ?? false;
    }
    if (form.type === "toggle") {
      field.defaultValue = (form.defaultValue as boolean) ?? false;
    }
    if (needsOptions) {
      field.options = form.options ?? [];
    }

    onSave(state.categoryId, field, state.isNew);
  };

  // ── Section header for LTR / RTL columns ──────────────────────────────────
  const ColHeader = ({ label, isArabic }: { label: string; isArabic?: boolean }) => (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-border">
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${isArabic ? "text-orange-400" : "text-primary"}`}>
        {label}
      </span>
    </div>
  );

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.isNew ? "Add Field" : "Edit Field"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Key + Type — shared row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Field Key <span className="text-red-400">*</span></Label>
              <Input
                value={(form.key as string) ?? ""}
                onChange={(e) => set("key", e.target.value)}
                placeholder="e.g. numberOfFloors"
                className="font-mono text-sm"
                disabled={!state.isNew}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Field Type <span className="text-red-400">*</span></Label>
              <Select
                value={(form.type as string) ?? ""}
                onValueChange={(v) => set("type", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bilingual columns: English (LTR) | Arabic (RTL) */}
          <div className="grid grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden">
            {/* ── English column ─────────────────────────────── */}
            <div className="p-4 border-r border-border bg-card space-y-4">
              <ColHeader label="English Config (LTR)" />

              {/* Label EN */}
              <div className="space-y-1.5">
                <Label>Label <span className="text-red-400">*</span></Label>
                <Input
                  value={(form.label as string) ?? ""}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="e.g. Number of Floors"
                />
              </div>

              {/* Placeholder EN */}
              {form.type !== "toggle" && (
                <div className="space-y-1.5">
                  <Label>Placeholder</Label>
                  <Input
                    value={(form.placeholder as string) ?? ""}
                    onChange={(e) => set("placeholder", e.target.value)}
                    placeholder="e.g. Enter value"
                  />
                </div>
              )}

              {/* text / textarea extras */}
              {(form.type === "text" || form.type === "textarea") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Keyboard Type</Label>
                    <Select
                      value={(form.keyboardType as string) ?? "default"}
                      onValueChange={(v) => set("keyboardType", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="numeric">Numeric</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone-pad">Phone</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Layout</Label>
                    <Select
                      value={(form.layout as string) ?? "full"}
                      onValueChange={(v) => set("layout", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Width</SelectItem>
                        <SelectItem value="half">Half Width</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* textarea extras */}
              {form.type === "textarea" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Max Length</Label>
                    <Input
                      type="number"
                      value={(form.maxLength as number) ?? ""}
                      onChange={(e) => set("maxLength", Number(e.target.value))}
                      placeholder="e.g. 300"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Number of Lines</Label>
                    <Input
                      type="number"
                      value={(form.numberOfLines as number) ?? ""}
                      onChange={(e) => set("numberOfLines", Number(e.target.value))}
                      placeholder="e.g. 4"
                    />
                  </div>
                </div>
              )}

              {/* toggle default */}
              {form.type === "toggle" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="field-default"
                    checked={(form.defaultValue as boolean) ?? false}
                    onCheckedChange={(v) => set("defaultValue", v)}
                  />
                  <Label htmlFor="field-default" className="cursor-pointer">
                    Default Value (On / Off)
                  </Label>
                </div>
              )}
            </div>

            {/* ── Arabic column ───────────────────────────────── */}
            <div className="p-4 bg-muted/20 space-y-4" dir="rtl">
              <ColHeader label="Arabic Config (RTL)" isArabic />

              {/* Label AR */}
              <div className="space-y-1.5">
                <Label>
                  <span className="text-red-400 ml-1">*</span> Label
                </Label>
                <Input
                  value={(form.label_ar as string) ?? ""}
                  onChange={(e) => set("label_ar", e.target.value)}
                  placeholder="تسمية عربية"
                />
              </div>

              {/* Placeholder AR */}
              {form.type !== "toggle" && (
                <div className="space-y-1.5">
                  <Label>Placeholder</Label>
                  <Input
                    value={(form.placeholder_ar as string) ?? ""}
                    onChange={(e) => set("placeholder_ar", e.target.value)}
                    placeholder="نص توضيحي"
                  />
                </div>
              )}

              {/* Spacer to align with EN column extras when present */}
              {(form.type === "text" || form.type === "textarea") && (
                <div className="h-[68px]" /> /* aligns with keyboard/layout row */
              )}
              {form.type === "textarea" && (
                <div className="h-[68px]" /> /* aligns with maxLength/lines row */
              )}
              {form.type === "toggle" && (
                <div className="h-[36px]" />
              )}
            </div>
          </div>

          {/* Required / Visible / Char Count toggles */}
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <Switch
                id="field-required"
                checked={(form.required as boolean) ?? false}
                onCheckedChange={(v) => set("required", v)}
              />
              <Label htmlFor="field-required" className="cursor-pointer">Required Field</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="field-show"
                checked={form.show !== false}
                onCheckedChange={(v) => set("show", v)}
              />
              <Label htmlFor="field-show" className="cursor-pointer">Visible</Label>
            </div>
            {form.type === "textarea" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="field-charcount"
                  checked={(form.showCharCount as boolean) ?? false}
                  onCheckedChange={(v) => set("showCharCount", v)}
                />
                <Label htmlFor="field-charcount" className="cursor-pointer">Show Char Count</Label>
              </div>
            )}
          </div>

          {/* Options editor — bilingual for select / multiSelect */}
          {needsOptions && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="border border-border rounded-md overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span>Label (EN)</span>
                  <span>Label (AR)</span>
                  <span className="font-mono">Value</span>
                  <span />
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-border">
                  {(form.options ?? []).map((opt, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 px-3 py-2 items-center">
                      <Input
                        value={opt.label}
                        onChange={(e) => updateOption(idx, "label", e.target.value)}
                        className="text-sm h-7 px-2"
                        placeholder="English label"
                      />
                      <div dir="rtl">
                        <Input
                          value={opt.label_ar ?? ""}
                          onChange={(e) => updateOption(idx, "label_ar", e.target.value)}
                          className="text-sm h-7 px-2"
                          placeholder="تسمية عربية"
                        />
                      </div>
                      <Input
                        value={opt.value}
                        onChange={(e) => updateOption(idx, "value", e.target.value)}
                        className="text-sm h-7 px-2 font-mono"
                        placeholder="value"
                      />
                      <button
                        onClick={() => removeOption(idx)}
                        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 p-3 border-t border-border">
                  <Input
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                    placeholder="Type English option label, press Enter to add"
                    className="text-sm flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">Value is auto-generated from English label (snake_case). Fill Arabic label for each option.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {state.isNew ? "Add Field" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Category Dialog ────────────────────────────────────────────────────────

function AddCategoryDialog({
  open,
  onClose,
  onSave,
  existingIds,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (cat: Category) => void;
  existingIds: string[];
}) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [labelAr, setLabelAr] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    if (open) { setId(""); setLabel(""); setLabelAr(""); setKeyword(""); setKeywords([]); }
  }, [open]);

  const addKeyword = () => {
    const t = keyword.trim().toLowerCase();
    if (!t || keywords.includes(t)) return;
    setKeywords((prev) => [...prev, t]);
    setKeyword("");
  };

  const removeKeyword = (k: string) => setKeywords((prev) => prev.filter((x) => x !== k));

  const handleSave = () => {
    const cleanId = id.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!cleanId || !label.trim()) {
      toast({ title: "Validation", description: "ID and Label are required.", variant: "destructive" });
      return;
    }
    if (existingIds.includes(cleanId)) {
      toast({ title: "Duplicate", description: `Category "${cleanId}" already exists.`, variant: "destructive" });
      return;
    }
    onSave({ id: cleanId, label: label.trim(), label_ar: labelAr.trim() || undefined, matchKeywords: keywords, fields: [] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Category
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Category ID <span className="text-red-400">*</span></Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. residential_living" className="font-mono text-sm" />
            <p className="text-[11px] text-muted-foreground">Unique snake_case identifier</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Label (EN) <span className="text-red-400">*</span></Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Residential & Living" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex justify-end">Label (AR) - optional</Label>
              <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} placeholder="Arabic label" dir="rtl" className="text-right" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Match Keywords</Label>
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span key={k} className="flex items-center gap-1 bg-muted text-xs px-2 py-0.5 rounded-full">
                    {k}
                    <button onClick={() => removeKeyword(k)} className="text-muted-foreground hover:text-foreground"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} placeholder="Type keyword, press Enter" className="text-sm flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addKeyword}><Plus className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1.5" /> Create Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Category Dialog ───────────────────────────────────────────────────────

function EditCategoryDialog({
  category,
  arabicCategory,
  open,
  onClose,
  onSave,
}: {
  category: Category | null;
  arabicCategory: Category | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: Pick<Category, "label" | "label_ar" | "matchKeywords" | "matchKeywordsList">, id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [labelAr, setLabelAr] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordAr, setKeywordAr] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordsList, setKeywordsList] = useState<MatchKeywordItem[]>([]);

  useEffect(() => {
    if (category) {
      setLabel(category.label);
      setLabelAr(category.label_ar ?? arabicCategory?.label ?? "");
      setKeywords([...category.matchKeywords]);
      setKeywordsList([...(arabicCategory?.matchKeywordsList ?? [])]);
      setKeyword("");
      setKeywordAr("");
    }
  }, [category, arabicCategory, open]);

  const addKeyword = () => {
    const t = keyword.trim().toLowerCase();
    const tAr = keywordAr.trim();
    if (!t || keywords.includes(t)) return;
    
    setKeywords((prev) => [...prev, t]);
    
    const keywordId = normalizeKeywordId(t);
    setKeywordsList((prev) => {
      const existing = prev.find(item => item.id === keywordId || item.id === t);
      if (existing) {
        return prev.map(item => 
          (item.id === keywordId || item.id === t) 
            ? { ...item, label: tAr || item.label } 
            : item
        );
      }
      return [...prev, { id: keywordId, label: tAr || t }];
    });
    
    setKeyword("");
    setKeywordAr("");
  };

  const removeKeyword = (k: string) => {
    setKeywords((prev) => prev.filter((x) => x !== k));
    const keywordId = normalizeKeywordId(k);
    setKeywordsList((prev) => prev.filter((x) => x.id !== keywordId && x.id !== k));
  };

  const handleSave = () => {
    if (!label.trim()) {
      toast({ title: "Validation", description: "Label is required.", variant: "destructive" });
      return;
    }
    onSave({ 
      label: label.trim(), 
      label_ar: labelAr.trim() || undefined, 
      matchKeywords: keywords,
      matchKeywordsList: keywordsList
    }, category!.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> Edit Category
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Bilingual labels */}
          <div className="grid grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden">
            <div className="p-4 space-y-1.5 border-r border-border bg-card">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-2">English (LTR)</p>
              <Label>Label <span className="text-red-400">*</span></Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Residential & Living" />
            </div>
            <div className="p-4 space-y-1.5 bg-muted/20" dir="rtl">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-400 mb-2">Arabic (RTL)</p>
              <Label>Label</Label>
              <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} placeholder="تسمية عربية" className="text-right" />
            </div>
          </div>

          {/* Keywords with Arabic translation */}
          <div className="space-y-1.5">
            <Label>Match Keywords</Label>
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => {
                  const arLabel = keywordsList.find(item => item.id === normalizeKeywordId(k) || item.id === k)?.label ?? "";
                  return (
                    <span key={k} className="flex items-center gap-1 bg-muted text-xs px-2 py-0.5 rounded-full">
                      <span>{k}</span>
                      {arLabel && arLabel !== k && <span className="text-muted-foreground" dir="rtl">{arLabel}</span>}
                      <button onClick={() => removeKeyword(k)} className="text-muted-foreground hover:text-foreground ml-1"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  value={keyword} 
                  onChange={(e) => setKeyword(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} 
                  placeholder="English keyword" 
                  className="text-sm" 
                />
                <div dir="rtl">
                  <Input 
                    value={keywordAr} 
                    onChange={(e) => setKeywordAr(e.target.value)} 
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} 
                    placeholder="كلمة مفتاحية عربية" 
                    className="text-sm" 
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addKeyword} className="w-full">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add Keyword
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1.5" /> Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CategoryPanel ──────────────────────────────────────────────────────────────

function CategoryPanel({
  category,
  expanded,
  editMode,
  onToggleExpand,
  onEdit,
  onDelete,
  onFieldsReorder,
  onToggleFieldShow,
  onDeleteField,
  onEditField,
  onAddField,
}: {
  category: Category;
  expanded: boolean;
  editMode: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFieldsReorder: (categoryId: string, newFields: CategoryField[]) => void;
  onToggleFieldShow: (categoryId: string, fieldKey: string) => void;
  onDeleteField: (categoryId: string, fieldKey: string) => void;
  onEditField: (categoryId: string, field: CategoryField) => void;
  onAddField: (categoryId: string) => void;
}) {
  const visibleCount = category.fields.filter((f) => f.show).length;
  const arabicCatLabel = editMode ? category.label_ar ?? "" : "";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden transition-all">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 border border-primary/20">
          <span className="text-sm font-bold text-primary">{category.label.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-foreground">{category.label}</h2>
            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {category.id}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {category.fields.length} field{category.fields.length !== 1 ? "s" : ""} · {visibleCount} visible
            {category.matchKeywords.length > 0 && (
              <span className="ml-1">
                · {category.matchKeywords.slice(0, 3).join(", ")}
                {category.matchKeywords.length > 3 ? ` +${category.matchKeywords.length - 3} more` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editMode && (
            <>
              <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit category">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400" title="Delete category">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={onToggleExpand} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Match keywords pill row — with Arabic labels */}
      {category.matchKeywords.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {category.matchKeywords.map((kw) => {
            const arLabel = editMode ? getArabicKeywordLabel(category, kw) : "";
            return (
              <span key={kw} className="inline-flex items-center gap-1 bg-muted text-[10px] text-muted-foreground px-2 py-0.5 rounded-full">
                <Tag className="w-2.5 h-2.5" />
                <span>{kw}</span>
                {arLabel && <span dir="rtl" className="text-primary/70">· {arLabel}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Expanded fields */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          {category.fields.length === 0 && !editMode ? (
            <p className="text-xs text-muted-foreground text-center py-4">No fields in this category.</p>
          ) : (
            <DraggableFieldList
              fields={category.fields}
              editMode={editMode}
              onReorder={(nf) => onFieldsReorder(category.id, nf)}
              onToggleShow={(key) => onToggleFieldShow(category.id, key)}
              onDelete={(key) => onDeleteField(category.id, key)}
              onEdit={(f) => onEditField(category.id, f)}
              onAdd={() => onAddField(category.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CategoryConfig() {
  const [config, setConfig] = useState<CategoryConfigData | null>(null);
  const [arabicConfig, setArabicConfig] = useState<CategoryConfigData | null>(null);
  const [original, setOriginal] = useState<CategoryConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const [fieldDialog, setFieldDialog] = useState<FieldDialogState>({
    open: false,
    categoryId: "",
    field: {},
    isNew: true,
  });
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [editCatTarget, setEditCatTarget] = useState<Category | null>(null);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get("/admin-dashboard/category-config"),
      api.get("/admin-dashboard/category-config", { params: { langCode: "ar" } }).catch(() => null),
    ])
      .then(([res, arabicRes]) => {
        const data: CategoryConfigData = res.data?.data;
        const arabicData: CategoryConfigData | null = arabicRes?.data?.data ?? null;
        setConfig(data);
        setArabicConfig(arabicData);
        setOriginal(data);
        setExpandedIds(Object.keys(data?.categories ?? {}));
      })
      .catch((err) => {
        setError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Failed to load category config."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const updateConfig = (updater: (draft: CategoryConfigData) => CategoryConfigData) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
  };

  const onFieldsReorder = (categoryId: string, newFields: CategoryField[]) => {
    updateConfig((draft) => ({ ...draft, categories: { ...draft.categories, [categoryId]: { ...draft.categories[categoryId], fields: newFields } } }));
  };

  const onToggleFieldShow = (categoryId: string, fieldKey: string) => {
    updateConfig((draft) => ({
      ...draft,
      categories: {
        ...draft.categories,
        [categoryId]: {
          ...draft.categories[categoryId],
          fields: draft.categories[categoryId].fields.map((f) => f.key === fieldKey ? { ...f, show: !f.show } : f),
        },
      },
    }));
  };

  const onDeleteField = (categoryId: string, fieldKey: string) => {
    updateConfig((draft) => ({
      ...draft,
      categories: {
        ...draft.categories,
        [categoryId]: { ...draft.categories[categoryId], fields: draft.categories[categoryId].fields.filter((f) => f.key !== fieldKey) },
      },
    }));
  };

  const openAddField = (categoryId: string) => {
    setFieldDialog({ open: true, categoryId, field: { key: "", label: "", label_ar: "", type: "text", placeholder: "", placeholder_ar: "", required: false, show: true }, isNew: true });
  };

  const openEditField = (categoryId: string, field: CategoryField) => {
    const enriched = mergeFieldTranslation(field, getArabicCategory(arabicConfig, categoryId));
    setFieldDialog({ open: true, categoryId, field: enriched, isNew: false });
  };

  const saveField = (categoryId: string, field: CategoryField, isNew: boolean) => {
    let duplicateFound = false;
    updateConfig((draft) => {
      const cat = draft.categories[categoryId];
      if (!cat) return draft;
      let newFields: CategoryField[];
      if (isNew) {
        if (cat.fields.some((f) => f.key === field.key)) { duplicateFound = true; return draft; }
        newFields = [...cat.fields, field];
      } else {
        newFields = cat.fields.map((f) => (f.key === field.key ? field : f));
      }
      return { ...draft, categories: { ...draft.categories, [categoryId]: { ...cat, fields: newFields } } };
    });
    if (duplicateFound) {
      toast({ title: "Duplicate key", description: `Field "${field.key}" already exists in this category.`, variant: "destructive" });
      return;
    }
    setFieldDialog((prev) => ({ ...prev, open: false }));
  };

  const addCategory = (cat: Category) => {
    updateConfig((draft) => ({ ...draft, categories: { ...draft.categories, [cat.id]: cat } }));
    setExpandedIds((prev) => [...prev, cat.id]);
  };

  const updateCategory = (updated: Pick<Category, "label" | "label_ar" | "matchKeywords" | "matchKeywordsList">, id: string) => {
    updateConfig((draft) => ({ ...draft, categories: { ...draft.categories, [id]: { ...draft.categories[id], ...updated } } }));
  };

  const deleteCategory = (id: string) => {
    updateConfig((draft) => { const { [id]: _removed, ...rest } = draft.categories; return { ...draft, categories: rest }; });
    setExpandedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const englishPayload = buildLocalizedConfig(config, "en", arabicConfig);
      const arabicPayload = buildLocalizedConfig(config, "ar", arabicConfig);
      const [englishRes, arabicRes] = await Promise.all([
        api.post("/admin-dashboard/category-config", englishPayload, { params: { langCode: "en" } }),
        api.post("/admin-dashboard/category-config", arabicPayload, { params: { langCode: "ar" } }),
      ]);
      const savedEnglish: CategoryConfigData = englishRes.data?.data ?? englishPayload;
      const savedArabic: CategoryConfigData = arabicRes.data?.data ?? arabicPayload;
      setConfig(savedEnglish);
      setArabicConfig(savedArabic);
      setOriginal(savedEnglish);
      setEditMode(false);
      toast({ title: "Config Saved", description: "English and Arabic category configs updated successfully." });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save config.";
      toast({ title: "Save Failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => { setConfig(original); setEditMode(false); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading category config…</span>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? "No config data."}</p>
        <Button variant="outline" size="sm" onClick={fetchConfig}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry</Button>
      </div>
    );
  }

  const categories = Object.values(config.categories).map((cat) =>
    editMode ? mergeCategoryTranslation(cat, arabicConfig) : cat
  );
  const totalFields = categories.reduce((sum, cat) => sum + cat.fields.length, 0);
  const totalVisible = categories.reduce((sum, cat) => sum + cat.fields.filter((f) => f.show).length, 0);

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Category Config</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage dynamic field categories for the mobile app&apos;s Business Details step
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={fetchConfig}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
              <Button size="sm" onClick={() => setEditMode(true)}><Edit2 className="w-3.5 h-3.5 mr-1.5" />Edit Config</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddCatOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" />Add Category</Button>
              <Button variant="outline" size="sm" onClick={handleDiscard}><X className="w-3.5 h-3.5 mr-1.5" />Discard</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Settings2 className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            Edit mode active — both English and Arabic fields are shown side-by-side in the Edit Field dialog.
            Click <strong>Save Changes</strong> to persist to the server.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Config ID", value: config.configId, sub: `v${config.schemaVersion}` },
          { label: "Target Step", value: config.targetStep },
          { label: "Categories", value: categories.length },
          { label: "Total Fields", value: `${totalVisible} / ${totalFields} visible` },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className="text-lg font-bold text-foreground mt-1 font-mono truncate">{c.value}</p>
            {"sub" in c && c.sub && <p className="text-[11px] text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-muted/30 border border-border rounded-lg px-4 py-3">
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>

      {/* Category panels */}
      <div className="space-y-4">
        {categories.map((cat) => (
          <CategoryPanel
            key={cat.id}
            category={cat}
            expanded={expandedIds.includes(cat.id)}
            editMode={editMode}
            onToggleExpand={() => toggleExpand(cat.id)}
            onEdit={() => setEditCatTarget(cat)}
            onDelete={() => deleteCategory(cat.id)}
            onFieldsReorder={onFieldsReorder}
            onToggleFieldShow={onToggleFieldShow}
            onDeleteField={onDeleteField}
            onEditField={openEditField}
            onAddField={openAddField}
          />
        ))}
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pb-2">
        <span>Created: {new Date(config.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(config.updatedAt).toLocaleString()}</span>
        <span>Seeded: {config.seeded ? "Yes" : "No"}</span>
        {config.langCode && <span>Lang: {config.langCode}</span>}
      </div>

      {/* Dialogs */}
      <FieldDialog state={fieldDialog} onClose={() => setFieldDialog((prev) => ({ ...prev, open: false }))} onSave={saveField} />
      <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} onSave={addCategory} existingIds={categories.map((c) => c.id)} />
      <EditCategoryDialog
        category={editCatTarget}
        arabicCategory={editCatTarget ? getArabicCategory(arabicConfig, editCatTarget.id) : null}
        open={!!editCatTarget}
        onClose={() => setEditCatTarget(null)}
        onSave={updateCategory}
      />
    </div>
  );
}
