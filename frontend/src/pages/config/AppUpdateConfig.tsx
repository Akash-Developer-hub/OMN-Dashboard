import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Save, Smartphone, Apple } from "lucide-react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlatformName = "ios" | "android";

interface PlatformUpdateConfig {
  name: PlatformName;
  version: number;
  versionName?: string;
  force_update: boolean;
  storeURL: string;
  updatedAt?: number | null;
}

interface TranslationUpdateConfig {
  version: number;
  forceUpdate: boolean;
  updatedAt?: number | null;
}

interface AppUpdateConfigPayload {
  id?: string;
  appName?: string;
  translation?: TranslationUpdateConfig;
  platform: PlatformUpdateConfig[];
  updatedAt?: number;
}

const defaultPlatforms = (): PlatformUpdateConfig[] => ([
  { name: "ios", version: 1, versionName: "", force_update: true, storeURL: "", updatedAt: null },
  { name: "android", version: 1, force_update: true, storeURL: "", updatedAt: null },
]);

const defaultTranslation = (): TranslationUpdateConfig => ({
  version: 1,
  forceUpdate: true,
  updatedAt: null,
});

export default function AppUpdateConfig() {
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState<PlatformName | null>(null);
  const [form, setForm] = useState<AppUpdateConfigPayload>({
    translation: defaultTranslation(),
    platform: defaultPlatforms(),
  });

  const getPlatform = (name: PlatformName): PlatformUpdateConfig => {
    return form.platform.find((p) => p.name === name) || { name, version: 1, versionName: "", force_update: true, storeURL: "", updatedAt: null };
  };

  const formatTimestamp = (value?: number | null): string => {
    if (!value || Number.isNaN(Number(value))) {
      return "Not updated yet";
    }

    return new Date(Number(value)).toLocaleString("en-GB");
  };

  const setPlatform = (platform: PlatformName, key: keyof PlatformUpdateConfig, value: string | number | boolean) => {
    setForm((prev) => ({
      ...prev,
      platform: prev.platform.map((p) =>
        p.name === platform
          ? {
              ...p,
              [key]: key === "version" ? Number(value) || 1 : value,
            }
          : p
      ),
    }));
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/app-update-config");
      const data = res?.data?.data as AppUpdateConfigPayload | undefined;
      if (data?.platform?.length) {
        setForm({
          id: data.id,
          appName: data.appName,
          translation: {
            version: Number(data.translation?.version) || 1,
            forceUpdate: Boolean(data.translation?.forceUpdate),
            updatedAt: data.translation?.updatedAt ?? null,
          },
          platform: data.platform.map((p) => ({
            name: p.name,
            version: Number(p.version) || 1,
            versionName: p.name === "ios" && typeof p.versionName === "string" ? p.versionName : "",
            force_update: Boolean(p.force_update),
            storeURL: typeof p.storeURL === "string" ? p.storeURL : "",
            updatedAt: p.updatedAt ?? null,
          })),
          updatedAt: data.updatedAt,
        });
      } else {
        setForm({ translation: defaultTranslation(), platform: defaultPlatforms() });
      }
    } catch {
      toast.error("Failed to load app update config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const savePlatformConfig = async (platformName: PlatformName) => {
    setSavingPlatform(platformName);
    try {
      const target = getPlatform(platformName);
      const payload = {
        platform: [
          {
            name: target.name,
            version: Number(target.version) || 1,
            ...(target.name === "ios" ? { versionName: target.versionName?.trim() || "" } : {}),
            force_update: Boolean(target.force_update),
            storeURL: target.storeURL?.trim() || "",
          },
        ],
      };

      await api.post("/app-update-config/update", payload);
      toast.success(`${platformName.toUpperCase()} update config saved.`);
      await fetchConfig();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to save app update config.");
    } finally {
      setSavingPlatform(null);
    }
  };

  const renderPlatformCard = (
    platform: PlatformName,
    title: string,
    icon: ReactNode
  ) => {
    const cfg = getPlatform(platform);

    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>

        <div className="text-xs text-muted-foreground">
          Updated: {formatTimestamp(cfg.updatedAt)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Input
              value={cfg.name}
              disabled
            />
          </div>

          <div className="space-y-1.5">
            <Label>Version</Label>
            <Input
              type="number"
              value={cfg.version}
              onChange={(e) => setPlatform(platform, "version", Number(e.target.value) || 1)}
            />
          </div>

          {platform === "ios" ? (
            <div className="space-y-1.5">
              <Label>Version Name</Label>
              <Input
                value={cfg.versionName || ""}
                onChange={(e) => setPlatform(platform, "versionName", e.target.value)}
                placeholder="e.g. 1.0.4"
              />
            </div>
          ) : null}

          <div className="space-y-1.5 md:col-span-2">
            <Label>Store URL</Label>
            <Input
              value={cfg.storeURL}
              onChange={(e) => setPlatform(platform, "storeURL", e.target.value)}
              placeholder={platform === "android" ? "https://play.google.com/store/apps/details?id=..." : "https://apps.apple.com/app/..."}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={cfg.force_update}
            onChange={(e) => setPlatform(platform, "force_update", e.target.checked)}
          />
          <span className="text-sm text-foreground">Force update required</span>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => savePlatformConfig(platform)}
            disabled={loading || savingPlatform !== null}
          >
            <Save className="w-4 h-4 mr-2" />
            {savingPlatform === platform ? "Saving..." : `Save ${title}`}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">App Update</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure platform, version and force update flag.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              Translation Updated: {formatTimestamp(form.translation?.updatedAt)}
            </span>
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              Android Updated: {formatTimestamp(getPlatform("android").updatedAt)}
            </span>
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
              iOS Updated: {formatTimestamp(getPlatform("ios").updatedAt)}
            </span>
          </div>
          {form.updatedAt ? (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {new Date(form.updatedAt).toLocaleString("en-GB")}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchConfig} disabled={loading || savingPlatform !== null}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-xl p-8 text-sm text-muted-foreground">
          Loading app update config...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {renderPlatformCard("android", "Android", <Smartphone className="w-4 h-4 text-primary" />)}
          {renderPlatformCard("ios", "iOS", <Apple className="w-4 h-4 text-primary" />)}
        </div>
      )}
    </div>
  );
}
