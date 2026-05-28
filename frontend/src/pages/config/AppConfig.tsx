import { useState } from "react";
import {
  Settings, Smartphone, Apple, MonitorSmartphone, Users, Rocket, AlertTriangle,
  Shield, ChevronDown, ChevronRight, Edit2, Save, X, Plus, GripVertical,
  Eye, EyeOff, Trash2, Image, Type, Link as LinkIcon, LayoutGrid, Star,
  Megaphone, SlidersHorizontal, Check, Copy, ExternalLink
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  appVersions as initialVersions,
  forceUpdateRules as initialRules,
  homeContentBlocks as initialBlocks,
  type AppVersion, type ForceUpdateRule, type HomeContentBlock,
} from "./mockData";

const statusColors: Record<string, string> = {
  current: "bg-green-500/15 text-green-400 border-green-500/30",
  supported: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  deprecated: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  unsupported: "bg-red-500/15 text-red-400 border-red-500/30",
};

const blockTypeIcons: Record<string, typeof Image> = {
  hero_banner: Image,
  promo_card: Star,
  quick_links: LayoutGrid,
  featured_pois: Star,
  announcement_bar: Megaphone,
  carousel: SlidersHorizontal,
};

const blockTypeLabels: Record<string, string> = {
  hero_banner: "Hero Banner",
  promo_card: "Promo Card",
  quick_links: "Quick Links",
  featured_pois: "Featured POIs",
  announcement_bar: "Announcement Bar",
  carousel: "Image Carousel",
};

export default function AppConfig() {
  const [activeTab, setActiveTab] = useState("versions");
  const [versions] = useState(initialVersions);
  const [rules, setRules] = useState(initialRules);
  const [blocks, setBlocks] = useState(initialBlocks);

  // Force update edit
  const [editRule, setEditRule] = useState<ForceUpdateRule | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<Partial<ForceUpdateRule>>({});

  // Content edit
  const [editBlock, setEditBlock] = useState<HomeContentBlock | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockForm, setBlockForm] = useState<Record<string, string>>({});

  const currentVersion = versions.find((v) => v.status === "current")!;
  const totalActiveUsers = versions.reduce((s, v) => s + v.activeUsers, 0);

  // Force update handlers
  const openRuleEdit = (rule: ForceUpdateRule) => {
    setEditRule(rule);
    setRuleForm({ ...rule });
    setRuleOpen(true);
  };

  const openRuleCreate = (platform: "android" | "ios") => {
    setEditRule(null);
    setRuleForm({
      platform,
      minVersionCode: currentVersion.versionCode,
      minVersionName: currentVersion.version,
      title: "Update Required",
      message: "Please update to the latest version.",
      updateUrl: platform === "android"
        ? "https://play.google.com/store/apps/details?id=ae.omn.app"
        : "https://apps.apple.com/ae/app/omn/id123456789",
      isBlocking: true,
      enabled: true,
    });
    setRuleOpen(true);
  };

  const saveRule = () => {
    if (editRule) {
      setRules((prev) => prev.map((r) => r.id === editRule.id ? { ...r, ...ruleForm, updatedAt: new Date().toISOString() } as ForceUpdateRule : r));
      toast({ title: "Rule Updated", description: `${ruleForm.platform} force update rule saved.` });
    } else {
      const newRule: ForceUpdateRule = {
        id: `fu-${Date.now()}`,
        platform: ruleForm.platform || "android",
        minVersionCode: ruleForm.minVersionCode || 0,
        minVersionName: ruleForm.minVersionName || "",
        title: ruleForm.title || "",
        message: ruleForm.message || "",
        updateUrl: ruleForm.updateUrl || "",
        isBlocking: ruleForm.isBlocking ?? true,
        enabled: ruleForm.enabled ?? true,
        updatedAt: new Date().toISOString(),
      };
      setRules((prev) => [...prev, newRule]);
      toast({ title: "Rule Created", description: `New ${ruleForm.platform} force update rule created.` });
    }
    setRuleOpen(false);
  };

  const toggleRuleEnabled = (id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // Content block handlers
  const openBlockEdit = (block: HomeContentBlock) => {
    setEditBlock(block);
    setBlockForm({ ...block.content });
    setBlockOpen(true);
  };

  const saveBlock = () => {
    if (!editBlock) return;
    setBlocks((prev) => prev.map((b) => b.id === editBlock.id ? { ...b, content: blockForm, updatedAt: new Date().toISOString() } : b));
    setBlockOpen(false);
    toast({ title: "Content Updated", description: `"${editBlock.title}" has been updated.` });
  };

  const toggleBlockEnabled = (id: string) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, enabled: !b.enabled } : b));
  };

  const moveBlock = (id: string, direction: "up" | "down") => {
    setBlocks((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((b) => b.id === id);
      if ((direction === "up" && idx === 0) || (direction === "down" && idx === sorted.length - 1)) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const newOrder = [...sorted];
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      return newOrder.map((b, i) => ({ ...b, order: i + 1 }));
    });
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">App Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Version management, force updates, and dynamic home content</p>
      </div>

      {/* Current version highlight */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">v{currentVersion.version}</h2>
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">CURRENT</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Released {formatDate(currentVersion.releasedAt)} · Build {currentVersion.versionCode}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-lg font-bold text-foreground">{totalActiveUsers.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</p>
            </div>
            <div>
              <p className="text-lg font-bold text-primary">{currentVersion.adoptionPercent}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">On Latest</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{versions.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Versions</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions">Version History</TabsTrigger>
          <TabsTrigger value="force-update">Force Update</TabsTrigger>
          <TabsTrigger value="home-content">Home Content</TabsTrigger>
        </TabsList>

        {/* VERSION HISTORY */}
        <TabsContent value="versions" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Version</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Build</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Released</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Users</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Adoption</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Release Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {versions.map((v) => (
                  <tr key={v.version} className={`hover:bg-muted/50 transition-colors ${v.status === "current" ? "bg-primary/5" : ""}`}>
                    <td className="px-5 py-3">
                      <span className="text-sm font-semibold text-foreground">v{v.version}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground font-mono">{v.versionCode}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[v.status]}`}>
                        {v.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(v.releasedAt)}</td>
                    <td className="px-5 py-3 text-sm text-foreground text-right font-medium">{v.activeUsers.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${v.adoptionPercent}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">{v.adoptionPercent}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-[250px] truncate">{v.releaseNotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* FORCE UPDATE */}
        <TabsContent value="force-update" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Android */}
            <PlatformCard
              platform="android"
              icon={<Smartphone className="w-5 h-5" />}
              rules={rules.filter((r) => r.platform === "android")}
              onEdit={openRuleEdit}
              onCreate={() => openRuleCreate("android")}
              onToggle={toggleRuleEnabled}
              formatDate={formatDate}
            />
            {/* iOS */}
            <PlatformCard
              platform="ios"
              icon={<Apple className="w-5 h-5" />}
              rules={rules.filter((r) => r.platform === "ios")}
              onEdit={openRuleEdit}
              onCreate={() => openRuleCreate("ios")}
              onToggle={toggleRuleEnabled}
              formatDate={formatDate}
            />
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" /> How Force Update Works
            </h3>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-6 list-disc">
              <li><strong>Blocking:</strong> User cannot use the app until they update. App shows full-screen dialog with no dismiss option.</li>
              <li><strong>Non-blocking:</strong> User sees update prompt but can dismiss and continue using the app.</li>
              <li>The <strong>minimum version code</strong> defines the cutoff — all users below this version will see the prompt.</li>
              <li>Update URL should point to the respective app store listing for the platform.</li>
            </ul>
          </div>
        </TabsContent>

        {/* HOME CONTENT */}
        <TabsContent value="home-content" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Drag to reorder. Changes are reflected in the mobile app's home screen.</p>
          </div>

          <div className="space-y-2">
            {blocks.sort((a, b) => a.order - b.order).map((block) => {
              const Icon = blockTypeIcons[block.type] || LayoutGrid;
              return (
                <div
                  key={block.id}
                  className={`bg-card border rounded-lg p-4 transition-all ${
                    block.enabled ? "border-border" : "border-border/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveBlock(block.id, "up")} className="text-muted-foreground hover:text-foreground p-0.5">
                        <ChevronDown className="w-3 h-3 rotate-180" />
                      </button>
                      <button onClick={() => moveBlock(block.id, "down")} className="text-muted-foreground hover:text-foreground p-0.5">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground">{block.title}</h3>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                          {blockTypeLabels[block.type]}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Updated {formatDate(block.updatedAt)} by {block.updatedBy} · {Object.keys(block.content).length} fields
                      </p>
                    </div>

                    {/* Preview snippet */}
                    <div className="hidden lg:block max-w-[200px]">
                      <p className="text-[10px] text-muted-foreground truncate italic">
                        {block.content.heading_en || block.content.title_en || block.content.text_en || "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={block.enabled}
                        onCheckedChange={() => toggleBlockEnabled(block.id)}
                      />
                      <button
                        onClick={() => openBlockEdit(block)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* FORCE UPDATE RULE DIALOG */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {ruleForm.platform === "ios" ? <Apple className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
              {editRule ? "Edit" : "Create"} {ruleForm.platform === "ios" ? "iOS" : "Android"} Force Update Rule
            </DialogTitle>
            <DialogDescription>Users below the minimum version will be prompted to update.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Min Version Name</Label>
                <Input
                  value={ruleForm.minVersionName || ""}
                  onChange={(e) => setRuleForm({ ...ruleForm, minVersionName: e.target.value })}
                  placeholder="3.4.0"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Version Code</Label>
                <Input
                  type="number"
                  value={ruleForm.minVersionCode || ""}
                  onChange={(e) => setRuleForm({ ...ruleForm, minVersionCode: Number(e.target.value) })}
                  placeholder="340"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dialog Title</Label>
              <Input value={ruleForm.title || ""} onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Dialog Message</Label>
              <Textarea value={ruleForm.message || ""} onChange={(e) => setRuleForm({ ...ruleForm, message: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Store URL</Label>
              <Input value={ruleForm.updateUrl || ""} onChange={(e) => setRuleForm({ ...ruleForm, updateUrl: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Blocking Update</Label>
                <p className="text-[10px] text-muted-foreground">Prevents app usage until updated</p>
              </div>
              <Switch
                checked={ruleForm.isBlocking ?? true}
                onCheckedChange={(v) => setRuleForm({ ...ruleForm, isBlocking: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Enabled</Label>
                <p className="text-[10px] text-muted-foreground">Rule is active and enforced</p>
              </div>
              <Switch
                checked={ruleForm.enabled ?? true}
                onCheckedChange={(v) => setRuleForm({ ...ruleForm, enabled: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
            <Button onClick={saveRule}>{editRule ? "Save Changes" : "Create Rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONTENT BLOCK EDIT DIALOG */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit: {editBlock?.title}</DialogTitle>
            <DialogDescription>
              Type: {editBlock ? blockTypeLabels[editBlock.type] : ""} · All changes are saved and pushed to the mobile app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {Object.entries(blockForm).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
              const isUrl = key.includes("url") || key.includes("image") || key.includes("link");
              const isColor = key.includes("color");
              const isArabic = key.includes("_ar");
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    {isUrl ? <LinkIcon className="w-3 h-3" /> : isColor ? <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: value }} /> : <Type className="w-3 h-3" />}
                    {key.replace(/_/g, " ")}
                    {isArabic && <Badge variant="outline" className="text-[8px] px-1 py-0">AR</Badge>}
                  </Label>
                  {isColor ? (
                    <div className="flex gap-2">
                      <Input
                        value={value}
                        onChange={(e) => setBlockForm({ ...blockForm, [key]: e.target.value })}
                        className="flex-1"
                      />
                      <div className="w-10 h-10 rounded-md border border-border" style={{ backgroundColor: value }} />
                    </div>
                  ) : value.length > 80 ? (
                    <Textarea
                      value={value}
                      onChange={(e) => setBlockForm({ ...blockForm, [key]: e.target.value })}
                      rows={2}
                      dir={isArabic ? "rtl" : "ltr"}
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => setBlockForm({ ...blockForm, [key]: e.target.value })}
                      dir={isArabic ? "rtl" : "ltr"}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button onClick={saveBlock}>
              <Save className="w-4 h-4 mr-1.5" /> Save Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Platform Force Update Card ─── */
function PlatformCard({
  platform, icon, rules, onEdit, onCreate, onToggle, formatDate,
}: {
  platform: string;
  icon: React.ReactNode;
  rules: ForceUpdateRule[];
  onEdit: (r: ForceUpdateRule) => void;
  onCreate: () => void;
  onToggle: (id: string) => void;
  formatDate: (iso: string) => string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground capitalize">{platform === "ios" ? "iOS" : "Android"}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No force update rules configured.</div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <div key={rule.id} className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    rule.enabled ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {rule.enabled ? "ACTIVE" : "DISABLED"}
                  </span>
                  {rule.isBlocking && (
                    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">
                      BLOCKING
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={rule.enabled} onCheckedChange={() => onToggle(rule.id)} />
                  <button onClick={() => onEdit(rule)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Min Version</p>
                  <p className="font-medium text-foreground font-mono">v{rule.minVersionName} ({rule.minVersionCode})</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p className="font-medium text-foreground">{formatDate(rule.updatedAt)}</p>
                </div>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground">Message</p>
                <p className="text-foreground mt-0.5 italic">"{rule.message}"</p>
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                <span className="truncate">{rule.updateUrl}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
