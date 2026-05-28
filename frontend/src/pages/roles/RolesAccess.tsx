import { useState, useMemo } from "react";
import {
  Shield, Users, Key, Clock, Plus, Search, ChevronDown, ChevronRight,
  Check, X, Edit2, Trash2, Copy, Eye, UserPlus, History, Lock, AlertTriangle
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  roles as mockRoles, permissions, permissionCategories, roleAssignments, auditLog,
  type Role, type RoleAssignment,
} from "./mockData";
import { api } from "@/utils/api";
import { useEffect } from "react";

export default function RolesAccess() {
  const [activeTab, setActiveTab] = useState("roles");
  const [rolesData, setRolesData] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([...permissionCategories]);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin-dashboard/roles");
      // Map backend roles to frontend Role type
      const validPermKeys = permissions.map(p => p.key);
      const mappedRoles = data.data.roles.map((r: any) => {
        const filteredPerms = (r.permissions || []).filter((pk: string) => validPermKeys.includes(pk));
        return {
          id: r.id,
          name: r.name,
          description: r.description || "No description provided.",
          color: r.color || (r.name === "superadmin" ? "hsl(0 72% 55%)" : "hsl(174 72% 46%)"),
          userCount: r.userCount || 0,
          isSystem: r.name === "superadmin" || r.name === "admin",
          permissions: filteredPerms,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        };
      });
      setRolesData(mappedRoles);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || "Failed to fetch roles.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    try {
      const { data } = await api.get("/admin-dashboard/users");
      if (data.success) {
        setAssignments(data.data.users);
      }
    } catch (err) {
      console.error("Failed to fetch assignments:", err);
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchAssignments();
  }, []);

  // Create/edit form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState("hsl(174 72% 46%)");
  const [formPerms, setFormPerms] = useState<string[]>([]);

  // Assign form
  const [assignRole, setAssignRole] = useState("");
  const [assignUser, setAssignUser] = useState("");

  const totalPerms = permissions.length;
  const totalUsers = rolesData.reduce((s, r) => s + r.userCount, 0);

  const toggleCategory = (cat: string) =>
    setExpandedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const togglePerm = (key: string) =>
    setFormPerms((prev) => {
      const isRemoving = prev.includes(key);
      if (isRemoving) {
        // Find all children of this permission (recursively if needed)
        const childrenKeys = permissions.filter(p => p.parent === key).map(p => p.key);
        return prev.filter((k) => k !== key && !childrenKeys.includes(k));
      } else {
        return [...prev, key];
      }
    });

  const toggleCategoryAll = (cat: string) => {
    const catPerms = permissions.filter((p) => p.category === cat).map((p) => p.key);
    const allSelected = catPerms.every((k) => formPerms.includes(k));
    if (allSelected) {
      setFormPerms((prev) => prev.filter((k) => !catPerms.includes(k)));
    } else {
      setFormPerms((prev) => [...new Set([...prev, ...catPerms])]);
    }
  };

  const openCreate = () => {
    setFormName("");
    setFormDesc("");
    setFormColor("hsl(174 72% 46%)");
    setFormPerms([]);
    setCreateOpen(true);
  };

  const openEdit = (role: Role) => {
    setSelectedRole(role);
    setFormName(role.name);
    setFormDesc(role.description);
    setFormColor(role.color);
    setFormPerms([...role.permissions]);
    setEditOpen(true);
  };

  const handleSaveCreate = async () => {
    if (!formName.trim()) return;
    try {
      await api.post("/admin-dashboard/roles", {
        name: formName,
        description: formDesc,
        color: formColor,
        permissions: formPerms,
        isActive: true
      });
      setCreateOpen(false);
      fetchRoles();
      toast({ title: "Role Created", description: `"${formName}" role created successfully.` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || "Failed to create role.",
        variant: "destructive"
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedRole || !formName.trim()) return;
    try {
      await api.put(`/admin-dashboard/roles/${selectedRole.id}`, {
        name: formName,
        description: formDesc,
        color: formColor,
        permissions: formPerms
      });
      setEditOpen(false);
      fetchRoles();
      toast({ title: "Role Updated", description: `"${formName}" updated successfully.` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || "Failed to update role.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;
    try {
      await api.delete(`/admin-dashboard/roles/${selectedRole.id}`);
      setDeleteOpen(false);
      fetchRoles();
      toast({ title: "Role Deleted", description: `"${selectedRole.name}" has been removed.` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || "Failed to delete role.",
        variant: "destructive"
      });
    }
  };

  const handleAssign = async () => {
    if (!assignRole || !assignUser) return;
    try {
      await api.put(`/admin-dashboard/users/${assignUser}`, {
        role: assignRole
      });
      setAssignOpen(false);
      fetchAssignments();
      toast({ title: "Role Updated", description: "User role has been updated successfully." });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err?.response?.data?.message || "Failed to update user role.",
        variant: "destructive"
      });
    }
  };

  const filteredAssignments = useMemo(() => {
    if (!search) return assignments;
    const q = search.toLowerCase();
    return assignments.filter(
      (a) => (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q) || (a.role || "").toLowerCase().includes(q)
    );
  }, [search, assignments]);

  const colorOptions = [
    "hsl(0 72% 55%)", "hsl(38 92% 50%)", "hsl(174 72% 46%)",
    "hsl(262 60% 55%)", "hsl(210 70% 55%)", "hsl(215 12% 50%)",
    "hsl(142 60% 45%)", "hsl(330 65% 55%)",
  ];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles & Access Control</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage roles, permissions, and user assignments</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Role
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard icon={Shield} label="Total Roles" value={String(rolesData.length)} />
        <MetricCard icon={Key} label="Permissions" value={String(totalPerms)} />
        <MetricCard icon={Users} label="Assigned Users" value={String(totalUsers)} />
        <MetricCard icon={Lock} label="System Roles" value={String(rolesData.filter((r) => r.isSystem).length)} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="assignments">User Assignments</TabsTrigger>
        </TabsList>

        {/* ROLES TAB */}
        <TabsContent value="roles" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rolesData.map((role) => (
              <div key={role.id} className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                    <h3 className="font-semibold text-foreground">{role.name}</h3>
                    {role.isSystem && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                        SYSTEM
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(role)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!role.isSystem && (
                      <button onClick={() => { setSelectedRole(role); setDeleteOpen(true); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{role.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    <Key className="w-3 h-3 inline mr-1" />{role.permissions.length}/{totalPerms} permissions
                  </span>
                  <span className="text-muted-foreground">
                    <Users className="w-3 h-3 inline mr-1" />{role.userCount} users
                  </span>
                </div>
                {/* Permission bar */}
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(role.permissions.length / totalPerms) * 100}%`, backgroundColor: role.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* PERMISSION MATRIX TAB */}
        <TabsContent value="matrix" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[200px] sticky left-0 bg-card z-10">
                      Permission
                    </th>
                    {rolesData.map((role) => (
                      <th key={role.id} className="px-3 py-3 text-center min-w-[90px]">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                          <span className="text-[10px] font-medium text-foreground">{role.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionCategories.map((cat) => {
                    const catPerms = permissions.filter((p) => p.category === cat);
                    const isExpanded = expandedCategories.includes(cat);
                    return (
                      <PermissionCategoryGroup
                        key={cat}
                        category={cat}
                        permissions={catPerms}
                        roles={rolesData}
                        expanded={isExpanded}
                        onToggle={() => toggleCategory(cat)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* USER ASSIGNMENTS TAB */}
        <TabsContent value="assignments" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users or roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
              />
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created By</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Login</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAssignments.map((a) => {
                  const roleObj = rolesData.find((r) => r.name === a.role);
                  return (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {(a.name || a.email || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{a.name || "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border border-border">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: roleObj?.color || "gray" }} />
                          {a.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={a.isActive ? "active" : "inactive"} />
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{a.createdBy || "System"}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{a.lastLogin ? formatTime(a.lastLogin) : "Never"}</td>
                      <td className="px-5 py-3">
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            setAssignUser(a.id);
                            setAssignRole(a.role);
                            setAssignOpen(true);
                          }}
                        >
                          Change Role
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>


      </Tabs>

      {/* CREATE ROLE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
            <DialogDescription>Define a role name, description, and select permissions.</DialogDescription>
          </DialogHeader>
          <RoleForm
            name={formName} setName={setFormName}
            desc={formDesc} setDesc={setFormDesc}
            color={formColor} setColor={setFormColor}
            perms={formPerms} togglePerm={togglePerm}
            toggleCategoryAll={toggleCategoryAll}
            colorOptions={colorOptions}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCreate} disabled={!formName.trim()}>
              Create Role ({formPerms.length} permissions)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT ROLE DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role: {selectedRole?.name}</DialogTitle>
            <DialogDescription>
              {selectedRole?.isSystem ? "System roles have limited editability." : "Modify role settings and permissions."}
            </DialogDescription>
          </DialogHeader>
          <RoleForm
            name={formName} setName={setFormName}
            desc={formDesc} setDesc={setFormDesc}
            color={formColor} setColor={setFormColor}
            perms={formPerms} togglePerm={togglePerm}
            toggleCategoryAll={toggleCategoryAll}
            colorOptions={colorOptions}
            isSystem={selectedRole?.isSystem}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!formName.trim()}>
              Save Changes ({formPerms.length} permissions)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedRole?.name}"? This will unassign {selectedRole?.userCount} users.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ASSIGN ROLE DIALOG */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>Select a user and assign them a role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={assignUser} onValueChange={setAssignUser}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {rolesData.map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!assignUser || !assignRole}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Permission Matrix Category Group ─── */
function PermissionCategoryGroup({
  category, permissions: catPerms, roles, expanded, onToggle,
}: {
  category: string;
  permissions: { key: string; label: string; description: string }[];
  roles: Role[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2 text-xs font-semibold text-foreground sticky left-0 bg-muted/30 z-10">
          <span className="flex items-center gap-2">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {category}
            <span className="text-muted-foreground font-normal">({catPerms.length})</span>
          </span>
        </td>
        {roles.map((r) => {
          const count = catPerms.filter((p) => r.permissions.includes(p.key)).length;
          return (
            <td key={r.id} className="px-3 py-2 text-center text-[10px] text-muted-foreground">
              {count}/{catPerms.length}
            </td>
          );
        })}
      </tr>
      {expanded &&
        catPerms.map((perm) => (
          <tr key={perm.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
            <td className="pl-10 pr-4 py-2 sticky left-0 bg-card z-10">
              <p className="text-xs font-medium text-foreground">{perm.label}</p>
              <p className="text-[10px] text-muted-foreground">{perm.description}</p>
            </td>
            {roles.map((r) => (
              <td key={r.id} className="px-3 py-2 text-center">
                {r.permissions.includes(perm.key) ? (
                  <Check className="w-4 h-4 text-green-400 mx-auto" />
                ) : (
                  <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                )}
              </td>
            ))}
          </tr>
        ))}
    </>
  );
}

/* ─── Role Form (Create / Edit) ─── */
function RoleForm({
  name, setName, desc, setDesc, color, setColor,
  perms, togglePerm, toggleCategoryAll, colorOptions,
  isSystem,
}: {
  name: string; setName: (v: string) => void;
  desc: string; setDesc: (v: string) => void;
  color: string; setColor: (v: string) => void;
  perms: string[]; togglePerm: (key: string) => void;
  toggleCategoryAll: (cat: string) => void;
  colorOptions: string[];
  isSystem?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Role Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Manager" disabled={name === 'superadmin'} />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex gap-2">
            {colorOptions.map((c) => (
              <button
                key={c}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe this role's purpose..." />
      </div>
      <div className="space-y-3">
        <Label className="flex justify-between">
          <span>Permissions</span>
          <span className="text-muted-foreground font-normal">{perms.length}/{permissions.length} selected</span>
        </Label>
        <div className="space-y-4 border border-border rounded-lg p-4 max-h-[45vh] overflow-y-auto bg-muted/10">
          {permissionCategories.map((cat) => {
            const catPerms = permissions.filter((p) => p.category === cat);
            if (catPerms.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1 mb-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-primary">{cat}</h4>
                  <button 
                    type="button"
                    onClick={() => toggleCategoryAll(cat)}
                    className="text-[10px] text-muted-foreground hover:text-primary"
                  >
                    Toggle All
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {catPerms.filter(p => !p.parent).map((perm) => {
                    const children = catPerms.filter(p => p.parent === perm.key);
                    return (
                      <div key={perm.key} className="col-span-full space-y-2">
                        <label className="flex items-start gap-3 p-2 rounded-md transition-colors group cursor-pointer hover:bg-muted/30">
                          <Checkbox
                            checked={perms.includes(perm.key)}
                            onCheckedChange={() => togglePerm(perm.key)}
                            className="mt-1"
                          />
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{perm.label}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{perm.description}</p>
                          </div>
                        </label>
                        
                        {children.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8 border-l-2 border-primary/20 ml-4 pb-2">
                            {children.map((child) => {
                              const parentActive = perms.includes(perm.key);
                              return (
                                <label 
                                  key={child.key} 
                                  className={`flex items-start gap-3 p-2 rounded-md transition-colors group ${
                                    !parentActive 
                                      ? 'cursor-not-allowed opacity-50' 
                                      : 'cursor-pointer hover:bg-muted/30'
                                  }`}
                                >
                                  <Checkbox
                                    checked={perms.includes(child.key)}
                                    onCheckedChange={() => parentActive && togglePerm(child.key)}
                                    disabled={!parentActive}
                                    className="mt-1"
                                  />
                                  <div className="space-y-0.5">
                                    <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{child.label}</p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">{child.description}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Handle any orphan permissions with parents (shouldn't happen with POI) */}
                  {catPerms.filter(p => p.parent && !catPerms.find(parent => parent.key === p.parent)).map((perm) => (
                    <label key={perm.key} className="flex items-start gap-3 p-2 rounded-md transition-colors group cursor-pointer hover:bg-muted/30">
                      <Checkbox
                        checked={perms.includes(perm.key)}
                        onCheckedChange={() => togglePerm(perm.key)}
                        className="mt-1"
                      />
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{perm.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{perm.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
