import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Server } from "lucide-react";
import { serversApi, Server as ServerType, CreateServerPayload, ServerEnvironment } from "./serversApi";

const ENVIRONMENTS: ServerEnvironment[] = ["development", "staging", "production"];

interface ServerFormProps {
  server?: ServerType | null;
  onClose: () => void;
  onSaved: () => void;
}

const defaultForm: CreateServerPayload = {
  name: "",
  environment: "development",
  username: "",
  port: "",
  ipAddress: "",
  location: "",
  description: "",
  isActive: true,
};

export function ServerForm({ server, onClose, onSaved }: ServerFormProps) {
  const isEdit = Boolean(server);
  const [form, setForm] = useState<CreateServerPayload>(defaultForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateServerPayload, string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (server) {
      setForm({
        name: server.name,
        environment: server.environment,
        username: server.username,
        port: server.port,
        ipAddress: server.ipAddress,
        location: server.location ?? "",
        description: server.description ?? "",
        isActive: server.isActive,
      });
    } else {
      setForm(defaultForm);
    }
    setErrors({});
  }, [server]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CreateServerPayload, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    if (!form.environment) errs.environment = "Environment is required.";
    if (!form.ipAddress.trim()) errs.ipAddress = "IP Address is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        ...form,
        location: form.location?.trim() || undefined,
        description: form.description?.trim() || undefined,
      };

      if (isEdit && server) {
        await serversApi.update(server.id, payload);
        toast.success("Server updated successfully.");
      } else {
        await serversApi.create(payload);
        toast.success("Server created successfully.");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || "Failed to save server.");
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof CreateServerPayload) => ({
    value: (form[key] ?? "") as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {isEdit ? "Edit Server" : "Add Server"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Production 1"
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                errors.name ? "border-red-500" : "border-border"
              }`}
              {...field("name")}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Environment */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Environment <span className="text-red-500">*</span>
            </label>
            <select
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                errors.environment ? "border-red-500" : "border-border"
              }`}
              value={form.environment}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, environment: e.target.value as ServerEnvironment }))
              }
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env.charAt(0).toUpperCase() + env.slice(1)}
                </option>
              ))}
            </select>
            {errors.environment && <p className="text-xs text-red-500 mt-1">{errors.environment}</p>}
          </div>

          {/* username */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type='text'
              placeholder="e.g. gaaya"
              value={form.username}
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                errors.username ? "border-red-500" : "border-border"
              }`}
              {...field("username")}
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
          </div>

          {/* Port */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Port <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 22"
              value={form.port}
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                errors.port ? "border-red-500" : "border-border"
              }`}
              {...field("port")}
            />
            {errors.port && <p className="text-xs text-red-500 mt-1">{errors.port}</p>}
          </div>

          {/* IP Address */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              IP Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 10.0.1.10"
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                errors.ipAddress ? "border-red-500" : "border-border"
              }`}
              {...field("ipAddress")}
            />
            {errors.ipAddress && <p className="text-xs text-red-500 mt-1">{errors.ipAddress}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Location</label>
            <input
              type="text"
              placeholder="e.g. UAE"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              {...field("location")}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="e.g. Main production server"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition resize-none"
              value={form.description ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* isActive */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                form.isActive ? "bg-green-500" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.isActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-foreground">
              {form.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? "Saving..." : isEdit ? "Update Server" : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
