import { Calendar, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { InsightFilters as Filters } from "./types";

interface InsightFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: string[];
  regions: string[];
}

export function InsightFilters({ filters, onChange, categories, regions }: InsightFiltersProps) {
  const update = (partial: Partial<Filters>) => {
    onChange({ ...filters, ...partial });
  };

  const clearAll = () => {
    onChange({
      dateRange: "month",
      startDate: undefined,
      endDate: undefined,
      category: undefined,
      status: undefined,
      region: undefined,
      contributionType: undefined,
      contributor: undefined,
    });
  };

  const hasActiveFilters = filters.category || filters.status || filters.region ||
    filters.contributionType || filters.contributor || filters.dateRange !== "month";

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="w-4 h-4" />
          Filters
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3 mr-1" /> Clear all
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Date Range */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Date Range</label>
          <Select value={filters.dateRange} onValueChange={(v) => update({ dateRange: v as Filters["dateRange"] })}>
            <SelectTrigger className="h-9 text-xs">
              <Calendar className="w-3 h-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom date inputs */}
        {filters.dateRange === "custom" && (
          <>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Start Date</label>
              <Input
                type="date"
                className="h-9 text-xs"
                onChange={(e) => update({ startDate: e.target.value ? new Date(e.target.value).getTime() : undefined })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">End Date</label>
              <Input
                type="date"
                className="h-9 text-xs"
                onChange={(e) => update({ endDate: e.target.value ? new Date(e.target.value + "T23:59:59").getTime() : undefined })}
              />
            </div>
          </>
        )}

        {/* Category */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
          <Select value={filters.category || "all"} onValueChange={(v) => update({ category: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
          <Select value={filters.status || "all"} onValueChange={(v) => update({ status: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="1">Approved</SelectItem>
              <SelectItem value="2">Rejected</SelectItem>
              <SelectItem value="0">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Region */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Region</label>
          <Select value={filters.region || "all"} onValueChange={(v) => update({ region: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contribution Type */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
          <Select value={filters.contributionType || "all"} onValueChange={(v) => update({ contributionType: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="create">New Place</SelectItem>
              <SelectItem value="update">Edit / Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
