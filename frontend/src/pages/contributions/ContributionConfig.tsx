import { useState, useEffect, useCallback, useRef } from "react";
import {
  Edit2, Save, X, Plus, GripVertical, Eye, EyeOff, Trash2,
  ChevronDown, ChevronRight, Loader2, RefreshCw, Settings2,
  ToggleLeft, ToggleRight, Type, AlignLeft, MapPin,
  List, Clock, CheckSquare, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api } from "@/utils/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConfigField {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  required: boolean;
  show: boolean;
  [key: string]: unknown;
}

interface ConfigStep {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  fields: ConfigField[];
  [key: string]: unknown;
}

interface ContributionType {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  screen: string;
  show: boolean;
  isMultiStep: boolean;
  steps: ConfigStep[];
  submission: { endpoint: string; method: string; appName: string };
}

interface ContributionConfigData {
  schemaVersion: number;
  configId: string;
  contributionTypes: ContributionType[];
  createdAt: string;
  updatedAt: string;
  seeded: boolean;
}

// ── Field type metadata ────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "text", label: "Text Input", Icon: Type },
  { value: "textarea", label: "Text Area", Icon: AlignLeft },
  { value: "categoryPicker", label: "Category Picker", Icon: List },
  { value: "mapPicker", label: "Map Picker", Icon: MapPin },
  { value: "imageUpload", label: "Image Upload", Icon: Type },
  { value: "schedule", label: "Schedule / Hours", Icon: Clock },
  { value: "checkbox", label: "Checkbox", Icon: CheckSquare },
];

const fieldTypeBadgeColor: Record<string, string> = {
  text: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  textarea: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  categoryPicker: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  mapPicker: "bg-green-500/15 text-green-400 border-green-500/30",
  imageUpload: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  schedule: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  checkbox: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

// ── Native Drag-and-drop Field List ───────────────────────────────────────────

function DraggableFieldList({
  fields,
  editMode,
  onReorder,
  onToggleShow,
  onDelete,
  onEdit,
  onAdd,
}: {
  fields: ConfigField[];
  editMode: boolean;
  onReorder: (newFields: ConfigField[]) => void;
  onToggleShow: (key: string) => void;
  onDelete: (key: string) => void;
  onEdit: (field: ConfigField) => void;
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
        const ft = FIELD_TYPES.find((f) => f.value === field.type);
        const Icon = ft?.Icon ?? Type;
        const colorClass =
          fieldTypeBadgeColor[field.type] ??
          "bg-muted text-muted-foreground border-border";
        const isDragging = draggingKey === field.key;
        const isOver = overKey === field.key && draggingKey !== field.key;

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

            <div
              className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${colorClass}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {field.label}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-mono">{field.key}</span>
                {field.required && (
                  <span className="ml-1 text-red-400">· required</span>
                )}
                {field.placeholder && (
                  <span className="ml-1">
                    · &ldquo;{field.placeholder}&rdquo;
                  </span>
                )}
              </p>
            </div>

            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${colorClass}`}
            >
              {field.type}
            </Badge>

            {editMode ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onToggleShow(field.key)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title={field.show ? "Hide field" : "Show field"}
                >
                  {field.show ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
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
                {field.show ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
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

// ── Step Panel ─────────────────────────────────────────────────────────────────

function StepPanel({
  step,
  stepIndex,
  typeId,
  editMode,
  onFieldsReorder,
  onToggleFieldShow,
  onDeleteField,
  onEditField,
  onAddField,
  onEditStep,
}: {
  step: ConfigStep;
  stepIndex: number;
  typeId: string;
  editMode: boolean;
  onFieldsReorder: (typeId: string, stepIndex: number, newFields: ConfigField[]) => void;
  onToggleFieldShow: (typeId: string, stepIndex: number, fieldKey: string) => void;
  onDeleteField: (typeId: string, stepIndex: number, fieldKey: string) => void;
  onEditField: (typeId: string, stepIndex: number, field: ConfigField) => void;
  onAddField: (typeId: string, stepIndex: number) => void;
  onEditStep: (typeId: string, stepIndex: number) => void;
}) {
  const [open, setOpen] = useState(stepIndex === 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
          {stepIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{step.label}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {step.title}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {step.fields.length} field{step.fields.length !== 1 ? "s" : ""}
        </Badge>
        {editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditStep(typeId, stepIndex);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            title="Edit step info"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="p-3 bg-background">
          {step.fields.length === 0 && !editMode ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No fields in this step.
            </p>
          ) : (
            <DraggableFieldList
              fields={step.fields}
              editMode={editMode}
              onReorder={(nf) => onFieldsReorder(typeId, stepIndex, nf)}
              onToggleShow={(key) => onToggleFieldShow(typeId, stepIndex, key)}
              onDelete={(key) => onDeleteField(typeId, stepIndex, key)}
              onEdit={(f) => onEditField(typeId, stepIndex, f)}
              onAdd={() => onAddField(typeId, stepIndex)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Add/Edit Field Dialog ──────────────────────────────────────────────────────

// ── Add/Edit Field Dialog ──────────────────────────────────────────────────────

interface FieldDialogState {
  open: boolean;
  typeId: string;
  stepIndex: number;
  enField: Partial<ConfigField>;
  arField: Partial<ConfigField>;
  isNew: boolean;
}

interface StepDialogState {
  open: boolean;
  typeId: string;
  stepIndex: number;
  enStep: Partial<ConfigStep>;
  arStep: Partial<ConfigStep>;
}

interface TypeDialogState {
  open: boolean;
  typeId: string;
  enType: Partial<ContributionType>;
  arType: Partial<ContributionType>;
}

// Reconciles English master structure into Arabic structure, keeping translations.
function reconcileConfigs(
  en: ContributionConfigData,
  ar: ContributionConfigData
): { en: ContributionConfigData; ar: ContributionConfigData } {
  const enClone = JSON.parse(JSON.stringify(en)) as ContributionConfigData;
  const arClone = JSON.parse(JSON.stringify(ar)) as ContributionConfigData;

  const reconciledArTypes: ContributionType[] = [];

  for (const enType of enClone.contributionTypes || []) {
    const arType = arClone.contributionTypes?.find((t) => t.id === enType.id);

    const reconciledSteps: ConfigStep[] = [];
    for (const enStep of enType.steps || []) {
      const arStep = arType?.steps?.find((s) => s.id === enStep.id);

      const reconciledFields: ConfigField[] = [];
      for (const enField of enStep.fields || []) {
        const arField = arStep?.fields?.find((f) => f.key === enField.key);
        reconciledFields.push({
          key: enField.key,
          type: enField.type,
          required: !!enField.required,
          show: enField.show !== false,
          label: arField?.label || "",
          placeholder: arField?.placeholder || "",
        });
      }

      reconciledSteps.push({
        id: enStep.id,
        label: arStep?.label || "",
        title: arStep?.title || "",
        subtitle: arStep?.subtitle || "",
        fields: reconciledFields,
      });
    }

    reconciledArTypes.push({
      id: enType.id,
      title: arType?.title || "",
      icon: enType.icon,
      iconColor: enType.iconColor,
      screen: enType.screen,
      show: !!enType.show,
      isMultiStep: !!enType.isMultiStep,
      steps: reconciledSteps,
      submission: enType.submission
        ? { ...enType.submission }
        : { endpoint: "", method: "", appName: "" },
    });
  }

  arClone.contributionTypes = reconciledArTypes;

  // Ensure EN has safe empty strings
  for (const enType of enClone.contributionTypes || []) {
    enType.title = enType.title || "";
    for (const enStep of enType.steps || []) {
      enStep.label = enStep.label || "";
      enStep.title = enStep.title || "";
      enStep.subtitle = enStep.subtitle || "";
      for (const enField of enStep.fields || []) {
        enField.label = enField.label || "";
        enField.placeholder = enField.placeholder || "";
      }
    }
  }

  return { en: enClone, ar: arClone };
}

// Validates that if a field has a translation in one language, it must exist in the other.
// Also validates that required translations are not empty.
function validateBilingualConfigs(
  en: ContributionConfigData,
  ar: ContributionConfigData
): string | null {
  for (let tIdx = 0; tIdx < en.contributionTypes.length; tIdx++) {
    const enType = en.contributionTypes[tIdx];
    const arType = ar.contributionTypes[tIdx];

    if (!enType.title?.trim() && !arType.title?.trim()) {
      return `Type "${enType.id}" title is required in both English and Arabic.`;
    }
    if (!!enType.title?.trim() !== !!arType.title?.trim()) {
      return `Type "${enType.id}" has a title in one language but not the other.`;
    }

    for (let sIdx = 0; sIdx < enType.steps.length; sIdx++) {
      const enStep = enType.steps[sIdx];
      const arStep = arType.steps[sIdx];

      if (!enStep.label?.trim() && !arStep.label?.trim()) {
        return `Step ${sIdx + 1} of type "${enType.title}" must have a label in both English and Arabic.`;
      }
      if (!!enStep.label?.trim() !== !!arStep.label?.trim()) {
        return `Step "${enStep.label || arStep.label}" of type "${enType.title}" has a label in one language but not the other.`;
      }

      if (!enStep.title?.trim() && !arStep.title?.trim()) {
        return `Step "${enStep.label}" of type "${enType.title}" must have a title in both English and Arabic.`;
      }
      if (!!enStep.title?.trim() !== !!arStep.title?.trim()) {
        return `Step "${enStep.label}" of type "${enType.title}" has a title in one language but not the other.`;
      }

      if (!!enStep.subtitle?.trim() !== !!arStep.subtitle?.trim()) {
        return `Step "${enStep.label}" of type "${enType.title}" has a subtitle in one language but not the other.`;
      }

      for (let fIdx = 0; fIdx < enStep.fields.length; fIdx++) {
        const enField = enStep.fields[fIdx];
        const arField = arStep.fields[fIdx];

        if (!enField.label?.trim() && !arField.label?.trim()) {
          return `Field "${enField.key}" of Step "${enStep.label}" must have a label in both English and Arabic.`;
        }
        if (!!enField.label?.trim() !== !!arField.label?.trim()) {
          return `Field "${enField.key}" of Step "${enStep.label}" has a label in one language but not the other.`;
        }

        if (!!enField.placeholder?.trim() !== !!arField.placeholder?.trim()) {
          return `Field "${enField.key}" of Step "${enStep.label}" has a placeholder in one language but not the other.`;
        }
      }
    }
  }
  return null;
}

function FieldDialog({
  state,
  onClose,
  onSave,
}: {
  state: FieldDialogState;
  onClose: () => void;
  onSave: (
    typeId: string,
    stepIndex: number,
    fieldEn: ConfigField,
    fieldAr: ConfigField,
    isNew: boolean
  ) => void;
}) {
  const [form, setForm] = useState({
    key: "",
    type: "text",
    required: false,
    show: true,
    labelEn: "",
    placeholderEn: "",
    labelAr: "",
    placeholderAr: "",
  });

  useEffect(() => {
    if (state.open) {
      setForm({
        key: state.enField?.key || "",
        type: state.enField?.type || "text",
        required: !!state.enField?.required,
        show: state.enField?.show !== false,
        labelEn: state.enField?.label || "",
        placeholderEn: state.enField?.placeholder || "",
        labelAr: state.arField?.label || "",
        placeholderAr: state.arField?.placeholder || "",
      });
    }
  }, [state.enField, state.arField, state.open]);

  const handleSave = () => {
    const key = form.key.trim();
    const labelEn = form.labelEn.trim();
    const labelAr = form.labelAr.trim();
    const placeholderEn = form.placeholderEn.trim();
    const placeholderAr = form.placeholderAr.trim();

    if (!key) {
      toast({
        title: "Validation Error",
        description: "Field Key is required.",
        variant: "destructive",
      });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      toast({
        title: "Validation Error",
        description: "Field Key must be alphanumeric or underscore.",
        variant: "destructive",
      });
      return;
    }
    if (!labelEn) {
      toast({
        title: "Validation Error",
        description: "English Label is required.",
        variant: "destructive",
      });
      return;
    }
    if (!labelAr) {
      toast({
        title: "Validation Error",
        description: "Arabic Label is required.",
        variant: "destructive",
      });
      return;
    }
    if (!!placeholderEn !== !!placeholderAr) {
      toast({
        title: "Validation Error",
        description: "Placeholder must be filled in both English and Arabic, or left empty in both.",
        variant: "destructive",
      });
      return;
    }

    onSave(
      state.typeId,
      state.stepIndex,
      {
        key,
        label: labelEn,
        type: form.type,
        placeholder: placeholderEn,
        required: form.required,
        show: form.show,
      },
      {
        key,
        label: labelAr,
        type: form.type,
        placeholder: placeholderAr,
        required: form.required,
        show: form.show,
      },
      state.isNew
    );
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {state.isNew ? "Add Field" : "Edit Field"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {/* Shared settings */}
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
            <div className="space-y-1.5">
              <Label>
                Field Key <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.key}
                onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                placeholder="e.g. placeName"
                className="font-mono text-sm"
                disabled={!state.isNew}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Field Type <span className="text-red-400">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((prev) => ({ ...prev, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {ft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bilingual columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* English Column */}
            <div className="space-y-4 border-r border-border/50 pr-6">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">
                English Config (LTR)
              </h3>
              <div className="space-y-1.5">
                <Label>
                  Label <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={form.labelEn}
                  onChange={(e) => setForm((prev) => ({ ...prev, labelEn: e.target.value }))}
                  placeholder="e.g. Place Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input
                  value={form.placeholderEn}
                  onChange={(e) => setForm((prev) => ({ ...prev, placeholderEn: e.target.value }))}
                  placeholder="e.g. Enter place name..."
                />
              </div>
            </div>

            {/* Arabic Column */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider text-right">
                Arabic Config (RTL)
              </h3>
              <div className="space-y-1.5">
                <Label className="w-full text-right block">
                  <span className="text-red-400">*</span> Label (الاسم)
                </Label>
                <Input
                  value={form.labelAr}
                  onChange={(e) => setForm((prev) => ({ ...prev, labelAr: e.target.value }))}
                  placeholder="مثال: اسم المكان"
                  dir="rtl"
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="w-full text-right block">Placeholder (نص تلميحي)</Label>
                <Input
                  value={form.placeholderAr}
                  onChange={(e) => setForm((prev) => ({ ...prev, placeholderAr: e.target.value }))}
                  placeholder="مثال: أدخل اسم المكان..."
                  dir="rtl"
                  className="text-right"
                />
              </div>
            </div>
          </div>

          {/* Settings Switches */}
          <div className="flex items-center gap-6 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Switch
                id="field-required"
                checked={form.required}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, required: v }))}
              />
              <Label htmlFor="field-required" className="cursor-pointer">
                Required Field
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="field-show"
                checked={form.show}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, show: v }))}
              />
              <Label htmlFor="field-show" className="cursor-pointer">
                Visible
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {state.isNew ? "Add Field" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepDialog({
  state,
  onClose,
  onSave,
}: {
  state: StepDialogState;
  onClose: () => void;
  onSave: (
    typeId: string,
    stepIndex: number,
    stepEn: ConfigStep,
    stepAr: ConfigStep
  ) => void;
}) {
  const [form, setForm] = useState({
    labelEn: "",
    titleEn: "",
    subtitleEn: "",
    labelAr: "",
    titleAr: "",
    subtitleAr: "",
  });

  useEffect(() => {
    if (state.open) {
      setForm({
        labelEn: state.enStep?.label || "",
        titleEn: state.enStep?.title || "",
        subtitleEn: state.enStep?.subtitle || "",
        labelAr: state.arStep?.label || "",
        titleAr: state.arStep?.title || "",
        subtitleAr: state.arStep?.subtitle || "",
      });
    }
  }, [state.enStep, state.arStep, state.open]);

  const handleSave = () => {
    const labelEn = form.labelEn.trim();
    const titleEn = form.titleEn.trim();
    const subtitleEn = form.subtitleEn.trim();
    const labelAr = form.labelAr.trim();
    const titleAr = form.titleAr.trim();
    const subtitleAr = form.subtitleAr.trim();

    if (!labelEn || !titleEn || !labelAr || !titleAr) {
      toast({
        title: "Validation Error",
        description: "Labels and Titles are required in both English and Arabic.",
        variant: "destructive",
      });
      return;
    }
    if (!!subtitleEn !== !!subtitleAr) {
      toast({
        title: "Validation Error",
        description: "Subtitle must be provided in both English and Arabic, or left empty in both.",
        variant: "destructive",
      });
      return;
    }

    onSave(
      state.typeId,
      state.stepIndex,
      {
        ...state.enStep,
        label: labelEn,
        title: titleEn,
        subtitle: subtitleEn,
      } as ConfigStep,
      {
        ...state.arStep,
        label: labelAr,
        title: titleAr,
        subtitle: subtitleAr,
      } as ConfigStep
    );
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Step Header Settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* English Column */}
          <div className="space-y-4 border-r border-border/50 pr-6">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">
              English Step Details
            </h3>
            <div className="space-y-1.5">
              <Label>
                Step Label <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.labelEn}
                onChange={(e) => setForm((prev) => ({ ...prev, labelEn: e.target.value }))}
                placeholder="e.g. Step 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Step Title <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.titleEn}
                onChange={(e) => setForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                placeholder="e.g. Place Details"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Step Subtitle</Label>
              <Input
                value={form.subtitleEn}
                onChange={(e) => setForm((prev) => ({ ...prev, subtitleEn: e.target.value }))}
                placeholder="e.g. Provide details"
              />
            </div>
          </div>

          {/* Arabic Column */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider text-right">
              Arabic Step Details
            </h3>
            <div className="space-y-1.5">
              <Label className="w-full text-right block">
                <span className="text-red-400">*</span> Step Label (تسمية الخطوة)
              </Label>
              <Input
                value={form.labelAr}
                onChange={(e) => setForm((prev) => ({ ...prev, labelAr: e.target.value }))}
                placeholder="مثال: الخطوة ١"
                dir="rtl"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="w-full text-right block">
                <span className="text-red-400">*</span> Step Title (عنوان الخطوة)
              </Label>
              <Input
                value={form.titleAr}
                onChange={(e) => setForm((prev) => ({ ...prev, titleAr: e.target.value }))}
                placeholder="مثال: تفاصيل المكان"
                dir="rtl"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="w-full text-right block">Step Subtitle (العنوان الفرعي للخطوة)</Label>
              <Input
                value={form.subtitleAr}
                onChange={(e) => setForm((prev) => ({ ...prev, subtitleAr: e.target.value }))}
                placeholder="مثال: يرجى تقديم تفاصيل"
                dir="rtl"
                className="text-right"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save Step Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeDialog({
  state,
  onClose,
  onSave,
}: {
  state: TypeDialogState;
  onClose: () => void;
  onSave: (
    typeId: string,
    typeEn: ContributionType,
    typeAr: ContributionType
  ) => void;
}) {
  const [form, setForm] = useState({
    titleEn: "",
    titleAr: "",
  });

  useEffect(() => {
    if (state.open) {
      setForm({
        titleEn: state.enType?.title || "",
        titleAr: state.arType?.title || "",
      });
    }
  }, [state.enType, state.arType, state.open]);

  const handleSave = () => {
    const titleEn = form.titleEn.trim();
    const titleAr = form.titleAr.trim();

    if (!titleEn || !titleAr) {
      toast({
        title: "Validation Error",
        description: "Titles are required in both English and Arabic.",
        variant: "destructive",
      });
      return;
    }

    onSave(
      state.typeId,
      {
        ...state.enType,
        title: titleEn,
      } as ContributionType,
      {
        ...state.arType,
        title: titleAr,
      } as ContributionType
    );
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Contribution Type Settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* English Column */}
          <div className="space-y-4 border-r border-border/50 pr-6">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">
              English Type Details
            </h3>
            <div className="space-y-1.5">
              <Label>
                Type Title <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.titleEn}
                onChange={(e) => setForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                placeholder="e.g. Add a Place"
              />
            </div>
          </div>

          {/* Arabic Column */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider text-right">
              Arabic Type Details
            </h3>
            <div className="space-y-1.5">
              <Label className="w-full text-right block">
                <span className="text-red-400">*</span> Type Title (عنوان النوع)
              </Label>
              <Input
                value={form.titleAr}
                onChange={(e) => setForm((prev) => ({ ...prev, titleAr: e.target.value }))}
                placeholder="مثال: إضافة مكان"
                dir="rtl"
                className="text-right"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save Type Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ContributionConfig() {
  const [enConfig, setEnConfig] = useState<ContributionConfigData | null>(null);
  const [arConfig, setArConfig] = useState<ContributionConfigData | null>(null);
  const [enOriginal, setEnOriginal] = useState<ContributionConfigData | null>(null);
  const [arOriginal, setArOriginal] = useState<ContributionConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);

  const [fieldDialog, setFieldDialog] = useState<FieldDialogState>({
    open: false,
    typeId: "",
    stepIndex: 0,
    enField: {},
    arField: {},
    isNew: true,
  });

  const [stepDialog, setStepDialog] = useState<StepDialogState>({
    open: false,
    typeId: "",
    stepIndex: 0,
    enStep: {},
    arStep: {},
  });

  const [typeDialog, setTypeDialog] = useState<TypeDialogState>({
    open: false,
    typeId: "",
    enType: {},
    arType: {},
  });

  const fetchConfig = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get("/poi-contributions/getContributionConfig?lang=en"),
      api.get("/poi-contributions/getContributionConfig?lang=ar"),
    ])
      .then(([enRes, arRes]) => {
        const enData: ContributionConfigData = enRes.data?.data;
        let arData: ContributionConfigData | null = arRes.data?.data;

        if (!enData) {
          throw new Error("No English contribution configuration found on the server.");
        }

        if (!arData) {
          arData = {
            ...enData,
            configId: "contribution_v2",
            langCode: "ar",
            contributionTypes: enData.contributionTypes.map((t) => ({
              ...t,
              title: "",
              steps: t.steps.map((s) => ({
                ...s,
                label: "",
                title: "",
                subtitle: "",
                fields: s.fields.map((f) => ({
                  ...f,
                  label: "",
                  placeholder: "",
                })),
              })),
            })),
          };
        }

        const reconciled = reconcileConfigs(enData, arData);
        setEnConfig(reconciled.en);
        setArConfig(reconciled.ar);
        setEnOriginal(reconciled.en);
        setArOriginal(reconciled.ar);
        setExpandedTypes(reconciled.en?.contributionTypes?.map((t) => t.id) ?? []);
      })
      .catch((err) => {
        setError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (err as Error).message ??
            "Failed to load contribution config."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleExpand = (id: string) =>
    setExpandedTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // ── State updaters ─────────────────────────────────────────────────────────

  const toggleTypeShow = (typeId: string) => {
    const toggle = (prev: ContributionConfigData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId ? { ...t, show: !t.show } : t
        ),
      };
    };
    setEnConfig(toggle);
    setArConfig(toggle);
  };

  const onFieldsReorder = (
    typeId: string,
    stepIndex: number,
    newFields: ConfigField[]
  ) => {
    setEnConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, i) =>
                  i === stepIndex ? { ...s, fields: newFields } : s
                ),
              }
            : t
        ),
      };
    });

    setArConfig((prev) => {
      if (!prev) return null;
      const keyOrder = newFields.map((f) => f.key);
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, i) => {
                  if (i !== stepIndex) return s;
                  const reorderedArFields = keyOrder
                    .map((k) => s.fields.find((f) => f.key === k))
                    .filter(Boolean) as ConfigField[];
                  return { ...s, fields: reorderedArFields };
                }),
              }
            : t
        ),
      };
    });
  };

  const onToggleFieldShow = (
    typeId: string,
    stepIndex: number,
    fieldKey: string
  ) => {
    const toggle = (prev: ContributionConfigData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, i) =>
                  i === stepIndex
                    ? {
                        ...s,
                        fields: s.fields.map((f) =>
                          f.key === fieldKey ? { ...f, show: !f.show } : f
                        ),
                      }
                    : s
                ),
              }
            : t
        ),
      };
    };
    setEnConfig(toggle);
    setArConfig(toggle);
  };

  const onDeleteField = (
    typeId: string,
    stepIndex: number,
    fieldKey: string
  ) => {
    const del = (prev: ContributionConfigData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, i) =>
                  i === stepIndex
                    ? {
                        ...s,
                        fields: s.fields.filter((f) => f.key !== fieldKey),
                      }
                    : s
                ),
              }
            : t
        ),
      };
    };
    setEnConfig(del);
    setArConfig(del);
  };

  const openAddField = (typeId: string, stepIndex: number) => {
    setFieldDialog({
      open: true,
      typeId,
      stepIndex,
      enField: {
        key: "",
        label: "",
        type: "text",
        placeholder: "",
        required: false,
        show: true,
      },
      arField: {
        key: "",
        label: "",
        type: "text",
        placeholder: "",
        required: false,
        show: true,
      },
      isNew: true,
    });
  };

  const openEditField = (
    typeId: string,
    stepIndex: number,
    fieldEn: ConfigField
  ) => {
    const fieldAr = arConfig?.contributionTypes
      .find((t) => t.id === typeId)
      ?.steps[stepIndex]?.fields.find((f) => f.key === fieldEn.key);
    setFieldDialog({
      open: true,
      typeId,
      stepIndex,
      enField: { ...fieldEn },
      arField: fieldAr ? { ...fieldAr } : { ...fieldEn, label: "", placeholder: "" },
      isNew: false,
    });
  };

  const saveField = (
    typeId: string,
    stepIndex: number,
    fieldEn: ConfigField,
    fieldAr: ConfigField,
    isNew: boolean
  ) => {
    let duplicateFound = false;

    setEnConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) => {
          if (t.id !== typeId) return t;
          return {
            ...t,
            steps: t.steps.map((s, i) => {
              if (i !== stepIndex) return s;
              if (isNew) {
                if (s.fields.some((f) => f.key === fieldEn.key)) {
                  duplicateFound = true;
                  return s;
                }
                return { ...s, fields: [...s.fields, fieldEn] };
              }
              return {
                ...s,
                fields: s.fields.map((f) => (f.key === fieldEn.key ? fieldEn : f)),
              };
            }),
          };
        }),
      };
    });

    if (duplicateFound) {
      toast({
        title: "Duplicate key",
        description: `A field with key "${fieldEn.key}" already exists in this step.`,
        variant: "destructive",
      });
      return;
    }

    setArConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) => {
          if (t.id !== typeId) return t;
          return {
            ...t,
            steps: t.steps.map((s, i) => {
              if (i !== stepIndex) return s;
              if (isNew) {
                return { ...s, fields: [...s.fields, fieldAr] };
              }
              return {
                ...s,
                fields: s.fields.map((f) => (f.key === fieldAr.key ? fieldAr : f)),
              };
            }),
          };
        }),
      };
    });

    setFieldDialog((prev) => ({ ...prev, open: false }));
  };

  const openEditStep = (typeId: string, stepIndex: number) => {
    const enStep = enConfig?.contributionTypes
      .find((t) => t.id === typeId)
      ?.steps[stepIndex];
    const arStep = arConfig?.contributionTypes
      .find((t) => t.id === typeId)
      ?.steps[stepIndex];
    if (enStep && arStep) {
      setStepDialog({
        open: true,
        typeId,
        stepIndex,
        enStep: { ...enStep },
        arStep: { ...arStep },
      });
    }
  };

  const saveStep = (
    typeId: string,
    stepIndex: number,
    stepEn: ConfigStep,
    stepAr: ConfigStep
  ) => {
    setEnConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, idx) => (idx === stepIndex ? stepEn : s)),
              }
            : t
        ),
      };
    });

    setArConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId
            ? {
                ...t,
                steps: t.steps.map((s, idx) => (idx === stepIndex ? stepAr : s)),
              }
            : t
        ),
      };
    });

    setStepDialog((prev) => ({ ...prev, open: false }));
  };

  const openEditType = (typeId: string) => {
    const enType = enConfig?.contributionTypes.find((t) => t.id === typeId);
    const arType = arConfig?.contributionTypes.find((t) => t.id === typeId);
    if (enType && arType) {
      setTypeDialog({
        open: true,
        typeId,
        enType: { ...enType },
        arType: { ...arType },
      });
    }
  };

  const saveType = (
    typeId: string,
    typeEn: ContributionType,
    typeAr: ContributionType
  ) => {
    setEnConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId ? typeEn : t
        ),
      };
    });

    setArConfig((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        contributionTypes: prev.contributionTypes.map((t) =>
          t.id === typeId ? typeAr : t
        ),
      };
    });

    setTypeDialog((prev) => ({ ...prev, open: false }));
  };

  // ── Save to API ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!enConfig || !arConfig) return;

    const validationError = validateBilingualConfigs(enConfig, arConfig);
    if (validationError) {
      toast({
        title: "Validation Failed",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const enPayload = { ...enConfig, langCode: "en" };
      await api.post("/contribution-config", enPayload);

      const arPayload = { ...arConfig, langCode: "ar" };
      await api.post("/contribution-config", arPayload);

      setEnOriginal(enConfig);
      setArOriginal(arConfig);
      setEditMode(false);

      toast({
        title: "Config Saved",
        description: "Both English and Arabic contribution configs updated successfully.",
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Failed to save configurations.";
      toast({ title: "Save Failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setEnConfig(enOriginal);
    setArConfig(arOriginal);
    setEditMode(false);
  };

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">
          Loading contribution config…
        </span>
      </div>
    );
  }

  if (error || !enConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error ?? "No config data."}
        </p>
        <Button variant="outline" size="sm" onClick={fetchConfig}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  const contributionTypes = enConfig.contributionTypes ?? [];
  const totalFields = contributionTypes.reduce(
    (sum, t) =>
      sum + (t.steps ?? []).reduce((s2, step) => s2 + (step.fields ?? []).length, 0),
    0
  );
  const totalSteps = contributionTypes.reduce(
    (sum, t) => sum + (t.steps ?? []).length,
    0
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Contribution Config
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage contribution form types, steps, and fields for the mobile app
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={fetchConfig}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setEditMode(true)}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                Edit Config
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleDiscard}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Settings2 className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            Edit mode active — drag fields to reorder, toggle visibility, add or
            remove fields. Click <strong>Save Changes</strong> to persist to
            the server.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Config ID",
            value: enConfig.configId,
            sub: `v${enConfig.schemaVersion}`,
          },
          { label: "Form Types", value: contributionTypes.length },
          { label: "Total Steps", value: totalSteps },
          { label: "Total Fields", value: totalFields },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-card border border-border rounded-lg p-4"
          >
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {c.label}
            </p>
            <p className="text-xl font-bold text-foreground mt-1 font-mono">
              {c.value}
            </p>
            {"sub" in c && c.sub && (
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Contribution Types */}
      <div className="space-y-4">
        {contributionTypes.map((type) => {
          const steps = type.steps ?? [];
          const isExpanded = expandedTypes.includes(type.id);
          const visibleFields = steps.reduce(
            (sum, s) => sum + (s.fields ?? []).filter((f) => f.show).length,
            0
          );
          const totalTypeFields = steps.reduce(
            (sum, s) => sum + (s.fields ?? []).length,
            0
          );

          return (
            <div
              key={type.id}
              className={[
                "bg-card border rounded-xl overflow-hidden transition-all",
                type.show
                  ? "border-border"
                  : "border-dashed border-border opacity-70",
              ].join(" ")}
            >
              {/* Type header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: type.iconColor + "22",
                    border: `1px solid ${type.iconColor}44`,
                  }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: type.iconColor }}
                  >
                    {type.title.charAt(0)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      {type.title}
                    </h2>
                    {editMode && (
                      <button
                        onClick={() => openEditType(type.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        title="Edit type title"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!type.show && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        Hidden
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {type.steps.length} step
                    {type.steps.length !== 1 ? "s" : ""} · {visibleFields}/
                    {totalTypeFields} fields visible · screen: {type.screen}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {editMode ? (
                    <div className="flex items-center gap-2 mr-2">
                      <span className="text-xs text-muted-foreground">
                        Enabled
                      </span>
                      <Switch
                        checked={type.show}
                        onCheckedChange={() => toggleTypeShow(type.id)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground mr-2">
                      {type.show ? (
                        <ToggleRight className="w-4 h-4 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                      <span className="text-xs">
                        {type.show ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => toggleExpand(type.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Steps */}
              {isExpanded && (
                <div className="px-5 pb-5 space-y-3 border-t border-border pt-4">
                  {steps.map((step, si) => (
                    <StepPanel
                      key={step.id}
                      step={step}
                      stepIndex={si}
                      typeId={type.id}
                      editMode={editMode}
                      onFieldsReorder={onFieldsReorder}
                      onToggleFieldShow={onToggleFieldShow}
                      onDeleteField={onDeleteField}
                      onEditField={openEditField}
                      onAddField={openAddField}
                      onEditStep={openEditStep}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer meta */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pb-2">
        <span>Created: {new Date(enConfig.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(enConfig.updatedAt).toLocaleString()}</span>
        <span>Seeded: {enConfig.seeded ? "Yes" : "No"}</span>
      </div>

      {/* Field dialog */}
      <FieldDialog
        state={fieldDialog}
        onClose={() => setFieldDialog((prev) => ({ ...prev, open: false }))}
        onSave={saveField}
      />

      {/* Step dialog */}
      <StepDialog
        state={stepDialog}
        onClose={() => setStepDialog((prev) => ({ ...prev, open: false }))}
        onSave={saveStep}
      />

      {/* Type dialog */}
      <TypeDialog
        state={typeDialog}
        onClose={() => setTypeDialog((prev) => ({ ...prev, open: false }))}
        onSave={saveType}
      />
    </div>
  );
}
