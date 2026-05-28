import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Edit2, Trash2, Users, UserCheck, UserX, RefreshCw, Eye, EyeOff } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { MetricCard } from "@/components/dashboard/MetricCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { api } from "@/utils/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "superadmin" | "vendor";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

const ROLES = ["admin", "superadmin", "vendor"] as const;

export default function UserManagement() {
  const userRole = localStorage.getItem("userRole") || "";
  const isSuperAdmin = userRole === "superadmin";
  const isAdmin = isSuperAdmin || userRole === "admin";

  const [users, setUsers] = useState<User[]>([]);
  const [availableRoles, setAvailableRoles] = useState<{ id: string, name: string }[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  // Create form
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" as string });
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ name: "", role: "", isActive: true });

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin-dashboard/users", { params: { page, limit: 20 } });
      setUsers(data.data.users);
      setPagination(data.data.pagination);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.message || "Failed to fetch users.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = async () => {
    try {
      const { data } = await api.get("/admin-dashboard/roles");
      setAvailableRoles(data.data.roles.filter((r: any) => r.isActive));
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    }
  };

  useEffect(() => { 
    fetchUsers(1);
    fetchRoles();
  }, [fetchUsers]);

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.role) {
      toast({ title: "Validation", description: "Email, password and role are required.", variant: "destructive" });
      return;
    }
    setFormLoading(true);
    try {
      await api.post("/admin-dashboard/users", form);
      toast({ title: "Success", description: "User created successfully." });
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "", role: "admin" });
      fetchUsers(pagination.page);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.message || "Failed to create user.", variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setFormLoading(true);
    try {
      await api.put(`/admin-dashboard/users/${editUser.id}`, editForm);
      toast({ title: "Success", description: "User updated." });
      setEditUser(null);
      fetchUsers(pagination.page);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.message || "Failed to update user.", variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setFormLoading(true);
    try {
      await api.delete(`/admin-dashboard/users/${deleteUser.id}`);
      toast({ title: "Success", description: "User deleted." });
      setDeleteUser(null);
      fetchUsers(pagination.page);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.message || "Failed to delete user.", variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const openEdit = (user: User) => {
    setEditForm({ name: user.name, role: user.role, isActive: user.isActive });
    setEditUser(user);
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage admin dashboard users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchUsers(pagination.page)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add User
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Users} label="Total Users" value={String(pagination.total)} />
        <MetricCard icon={UserCheck} label="Active" value={String(activeCount)} changeType="positive" />
        <MetricCard icon={UserX} label="Inactive" value={String(inactiveCount)} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No users found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Joined</th>
                {isAdmin && (
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={u.role === "superadmin" ? "default" : "secondary"} className="capitalize">
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={u.isActive ? "active" : "rejected"} />
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteUser(u)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchUsers(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchUsers(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Dialog — superadmin only */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new admin dashboard user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.name} className="capitalize">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={formLoading}>
              {formLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details for {editUser?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Role {!isSuperAdmin && <span className="text-muted-foreground text-xs">(superadmin only)</span>}</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
                disabled={!isSuperAdmin}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.name} className="capitalize">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>
                Active {!isSuperAdmin && <span className="text-muted-foreground text-xs">(superadmin only)</span>}
              </Label>
              <Switch
                checked={editForm.isActive}
                onCheckedChange={(v) => setEditForm({ ...editForm, isActive: v })}
                disabled={!isSuperAdmin}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={formLoading}>
              {formLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation — superadmin only */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteUser?.name}</strong> ({deleteUser?.email})?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={formLoading}>
              {formLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

