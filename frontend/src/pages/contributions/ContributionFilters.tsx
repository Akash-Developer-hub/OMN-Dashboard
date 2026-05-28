import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  status: string;
  setStatus: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
}

const DEFAULTS = { status: "All Status", source: "All Sources", priority: "All Priorities" };

export function ContributionFilters({ status, setStatus, source, setSource, priority, setPriority }: Props) {
  const isFiltered = status !== DEFAULTS.status || source !== DEFAULTS.source || priority !== DEFAULTS.priority;

  const clearFilters = () => {
    setStatus(DEFAULTS.status);
    setSource(DEFAULTS.source);
    setPriority(DEFAULTS.priority);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="All Status">All Status</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="modified">Modified</SelectItem>
        </SelectContent>
      </Select>
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="All Sources">All Sources</SelectItem>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="internal-admin">Internal Admin</SelectItem>
        </SelectContent>
      </Select>
      <Select value={priority} onValueChange={setPriority}>
        <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="All Priorities">All Priorities</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
        </SelectContent>
      </Select>
      {isFiltered && (
        <Button variant="secondary" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
