import { useState, useEffect, useCallback } from "react";
import { 
  Zap, 
  RefreshCw, 
  Search,
  ArrowUpRight,
  Play,
  History as HistoryIcon,
  Calendar,
  Eye,
  Loader2,
  Settings2,
  Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { cn } from "@/lib/utils";

interface Contribution {
  id: string;
  _id: string;
  name?: string;
  basicInfo?: {
    name?: string;
  };
  category: string;
  created_at: number;
  status: number;
}

interface GenerationBatch {
  id: string;
  gen_id: string;
  count: number;
  status: 'running' | 'live';
  createdAt: number;
  contributionIds: string[];
}

interface GenerationConfig {
  pythonScriptPath: string;
  ITCSearchDatabasePath: string;
  mode: string;
  api: string;
  tmux: string;
}

const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  pythonScriptPath: "/home/vmadmin/ServicesRunning/contribution",
  ITCSearchDatabasePath: "/home/vmadmin/ServicesRunning/NE/ITC/offline/search/ITC.sqlite3",
  mode: "PRODUCTION",
  api: "http://localhost:3000",
  tmux: "ITC",
};

export default function ContributionGeneration() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [liveHistory, setLiveHistory] = useState<GenerationBatch[]>([]);
  const [runningBatches, setRunningBatches] = useState<GenerationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  
  const [config, setConfig] = useState<GenerationConfig>(DEFAULT_GENERATION_CONFIG);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, liveHistoryRes, runningRes, configRes] = await Promise.all([
        api.get("/admin-dashboard/contributors/approved-not-live", { params: { limit: 1000 } }),
        api.get("/admin-dashboard/contribution-generation", { params: { limit: 20, status: "live" } }),
        api.get("/admin-dashboard/contribution-generation", { params: { limit: 5, status: "running" } }),
        api.get("/admin-dashboard/contribution-generation/config")
      ]);

      setContributions(listRes.data?.data || []);
      setLiveHistory(liveHistoryRes.data?.data || []);
      setRunningBatches(runningRes.data?.data || []);
      if (configRes.data?.data) {
        setConfig(configRes.data.data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to sync with generation pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markGenerationLive = async (genId: string) => {
    console.log("[vv]Marking generation live with genId:", genId);
    const res = await api.post("/admin-dashboard/contribution-generation/mark-live", {
      gen_id: genId,
    });
    console.log("[vv]Mark live response:", res.data);

    if (!res.data?.success) {
      throw new Error(res.data?.message || "Failed to mark generation live");
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      // Remove internal MongoDB fields if they exist
      const { _id, ...cleanConfig } = config as any;
      const res = await api.post("/admin-dashboard/contribution-generation/config", cleanConfig);
      if (res.data?.success) {
        toast.success("Pipeline configuration saved");
        setIsConfigOpen(false);
        fetchData(); // Refresh to get the latest
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || "Failed to save configuration";
      toast.error(errorMsg);
      console.error("Save config error:", err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartGeneration = async () => {
    if (contributions.length === 0) {
      toast.error("No pending contributions found for this batch");
      return;
    }

    setIsGenerating(true);
    const ids = contributions.map(c => c._id || c.id);

    try {
      // Create generation batch from backend (webhook orchestration is server-side).
      const res = await api.post("/admin-dashboard/contribution-generation", {
        contributionIds: ids
      });

      if (res.data?.success) {
        const genId = res.data?.data?.gen_id;
        toast.success(`Batch ${genId} initiated successfully`);
        if (genId) {
          console.log("generation response:", genId);
          try {
            await markGenerationLive(genId);
            toast.success(`Generation ${genId} marked live`);
          } catch (markLiveErr: any) {
            console.error("Mark live error:", markLiveErr);
            toast.error(
              markLiveErr?.message
                ? `Batch created, but mark-live failed: ${markLiveErr.message}`
                : "Batch created, but mark-live failed"
            );
          }
        }
        fetchData(); 
      } else {
        throw new Error(res.data?.message || "Batch generation failed");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err?.response?.data?.message || err.message || "Batch generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredContributions = contributions.filter(c => 
    (c.basicInfo?.name || c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-700 max-w-[1600px] mx-auto">
      {/* 1. Summary & Common Trigger Section */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="border-primary/20 shadow-xl shadow-primary/5 bg-gradient-to-br from-background to-primary/5 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          
          <CardHeader className="pb-2 relative z-10">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <Zap className="w-4 h-4 fill-primary/20" />
                Active Generation Batch
              </CardTitle>
              
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors">
                    <Settings2 className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-black">
                      <Settings2 className="w-6 h-6 text-primary" />
                      Pipeline Config
                    </DialogTitle>
                    <DialogDescription>
                      Settings for the map generation scripts (Saved in DB).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mode" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Operating Mode</Label>
                      <Select 
                        value={config.mode} 
                        onValueChange={(val) => setConfig({...config, mode: val})}
                      >
                        <SelectTrigger className="w-full bg-background border-primary/20">
                          <SelectValue placeholder="Select Mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STAGING">STAGING</SelectItem>
                          <SelectItem value="PRODUCTION">PRODUCTION</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pythonScriptPath" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Python Script Path</Label>
                      <Input 
                        id="pythonScriptPath" 
                        value={config.pythonScriptPath} 
                        onChange={(e) => setConfig({...config, pythonScriptPath: e.target.value})}
                        className="bg-background"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="databasePath" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">ITC Search DB Path</Label>
                      <Input 
                        id="databasePath" 
                        value={config.ITCSearchDatabasePath} 
                        onChange={(e) => setConfig({...config, ITCSearchDatabasePath: e.target.value})}
                        className="bg-background"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tmux" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">TMUX Session Name</Label>
                      <Input 
                        id="tmux" 
                        value={config.tmux} 
                        onChange={(e) => setConfig({...config, tmux: e.target.value})}
                        className="bg-background"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="apiUrl" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">n8n API Callback URL</Label>
                      <Input 
                        id="apiUrl" 
                        value={config.api} 
                        onChange={(e) => setConfig({...config, api: e.target.value})}
                        className="bg-background"
                      />
                    </div>
                  </div>
                  <DialogFooter className="pt-4 border-t border-border/50">
                    <Button variant="outline" onClick={() => setIsConfigOpen(false)}>Cancel</Button>
                    <Button type="submit" onClick={handleSaveConfig} disabled={isSavingConfig} className="gap-2 px-8 font-bold">
                      {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Settings
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-10 py-10 relative z-10">
            <div className="flex items-center gap-8">
              <div className="space-y-0 text-left">
                <div className="text-8xl font-black tracking-tighter text-foreground tabular-nums leading-none">
                  {loading ? "..." : contributions.length}
                </div>
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2 mt-2">
                  Approved POIs • <Badge variant="outline" className="text-[9px] font-black h-5 border-primary/30 text-primary bg-primary/5">{config.mode}</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="w-full sm:w-auto rounded-2xl px-8 h-16 font-bold border-border/60 gap-3 bg-background/50 hover:bg-background transition-all shadow-sm"
                  >
                    <Eye className="w-5 h-5 text-primary" />
                    View All
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-primary/20 shadow-2xl">
                  <DialogHeader className="p-6 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <DialogTitle className="text-2xl font-black">Current Batch POIs</DialogTitle>
                        <DialogDescription>
                          Reviewing {contributions.length} contributions for {config.mode} environment.
                        </DialogDescription>
                      </div>
                    </div>
                    <div className="relative mt-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search current batch..." 
                        className="pl-9 h-11 bg-background"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </DialogHeader>
                  
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background text-muted-foreground text-[10px] uppercase tracking-widest font-black border-b z-10">
                        <tr>
                          <th className="py-4 text-left">POI Name</th>
                          <th className="py-4 text-left">Category</th>
                          <th className="py-4 text-left">Approved Date</th>
                          <th className="py-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredContributions.map((item) => (
                          <tr key={item._id || item.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="py-4">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                                {item.basicInfo?.name || item.name || "Unnamed POI"}
                              </div>
                              <div className="text-[9px] font-mono text-muted-foreground">ID: {item._id || item.id}</div>
                            </td>
                            <td className="py-4">
                              <Badge variant="outline" className="text-[9px] font-bold uppercase bg-muted/30">
                                {item.category}
                              </Badge>
                            </td>
                            <td className="py-4 text-muted-foreground text-xs font-medium">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 text-right">
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-black uppercase">
                                Ready
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="p-4 border-t bg-muted/10 flex justify-end">
                    <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                      Close List
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button 
                size="lg" 
                disabled={isGenerating || contributions.length === 0}
                onClick={handleStartGeneration}
                className="w-full sm:w-auto rounded-2xl px-12 h-16 font-black uppercase tracking-widest shadow-2xl shadow-primary/40 group relative overflow-hidden"
              >
                {isGenerating ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Play className="w-6 h-6 fill-current group-hover:translate-x-1 transition-transform" />
                )}
                {isGenerating ? "Pushing..." : "Update to Live"}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={fetchData} 
                disabled={loading}
                className="rounded-full h-12 w-12 border border-border/40 hover:bg-background"
              >
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* 3. Running Generation Section */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight">Running Generation</h2>
          <Badge variant="outline" className="font-bold text-[10px] uppercase px-4 py-1">
            {runningBatches.length} Active
          </Badge>
        </div>

        {runningBatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {runningBatches.map((batch) => (
              <Card key={batch.id} className="border-primary/30 ring-2 ring-primary/30 ring-offset-2 ring-offset-background overflow-hidden bg-card/60">
                <div className="h-1.5 w-full bg-primary animate-pulse" />
                <CardHeader className="pb-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-[11px] font-mono font-bold text-foreground/80 truncate max-w-[180px]">
                      {batch.gen_id}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {new Date(batch.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                  <Badge className="uppercase text-[9px] font-black tracking-widest h-6 px-3 rounded-md shadow-sm bg-primary text-primary-foreground animate-pulse">
                    Running
                  </Badge>
                </CardHeader>
                <CardContent className="pb-6 pt-2">
                  <div className="text-4xl font-black tracking-tighter text-foreground tabular-nums">
                    {batch.count}
                  </div>
                  <div className="text-[9px] uppercase font-black text-muted-foreground/60 tracking-[0.2em] mt-1">
                    POIs in Progress
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/40 bg-muted/10 px-5 py-4 text-sm text-muted-foreground">
            No running contribution generation batch.
          </div>
        )}
      </div>

      {/* 4. Generation History Section */}
      <div className="space-y-6 pt-6 border-t border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted/50 rounded-lg">
              <HistoryIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-black tracking-tight">Generation History</h2>
          </div>
          <Badge variant="secondary" className="font-bold text-[10px] uppercase px-4 py-1">
            Recent {liveHistory.length} Live Logs
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {liveHistory.map((batch) => (
            <Card key={batch.id} className={cn(
              "border-border/40 overflow-hidden group transition-all hover:shadow-2xl hover:-translate-y-1 bg-card/50",
              batch.status === 'running' ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : "hover:border-primary/20"
            )}>
              <div className={cn(
                "h-1.5 w-full",
                batch.status === 'running' ? "bg-primary animate-pulse" : "bg-emerald-500/30"
              )} />
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-[11px] font-mono font-bold text-foreground/80 truncate max-w-[180px]">
                    {batch.gen_id}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {new Date(batch.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
                <Badge className={cn(
                  "uppercase text-[9px] font-black tracking-widest h-6 px-3 rounded-md shadow-sm",
                  batch.status === 'running' 
                    ? "bg-primary text-primary-foreground animate-pulse" 
                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                )}>
                  Live
                </Badge>
              </CardHeader>
              <CardContent className="pb-6 pt-2">
                <div className="flex items-end justify-between">
                  <div className="space-y-1">
                    <div className="text-4xl font-black tracking-tighter text-foreground tabular-nums">
                      {batch.count}
                    </div>
                    <div className="text-[9px] uppercase font-black text-muted-foreground/60 tracking-[0.2em]">
                      POIs Processed
                    </div>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all cursor-pointer shadow-sm">
                    <ArrowUpRight className="w-6 h-6 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {liveHistory.length === 0 && !loading && (
            <div className="col-span-full py-32 flex flex-col items-center justify-center bg-muted/5 rounded-[2.5rem] border-4 border-dashed border-border/20">
              <HistoryIcon className="w-16 h-16 text-muted-foreground/10 mb-6" />
              <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Logs Empty</p>
              <p className="text-xs text-muted-foreground/60 mt-2 font-medium">Your daily pushes will appear here as audit logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
