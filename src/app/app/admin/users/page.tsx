"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus, Shield, Eye, Users } from "lucide-react";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "viewer";
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" as "admin" | "viewer" });

  async function fetchUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users);
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("User created");
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "viewer" });
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create user");
    }
  }

  async function handleToggleRole(user: User) {
    const newRole = user.role === "admin" ? "viewer" : "admin";
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      toast.success(`Role updated to ${newRole}`);
      fetchUsers();
    } else {
      toast.error("Failed to update role");
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete ${user.email}?`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("User deleted");
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete user");
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-1.5rem)] flex-col">
        <div className="glass-status-bar px-4 py-2.5 flex items-center gap-2">
          <Users className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold text-foreground/85">User Management</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="lg-inset rounded-[16px] p-8">
            <p className="text-[13px] text-foreground/45">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold text-foreground/85">User Management</span>
          <span className="text-[11px] text-foreground/35 tabular-nums">{users.length} users</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="apple-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-[13px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Invite User
        </button>
      </div>

      {/* Tier 3: Content */}
      <div className="flex-1 overflow-auto p-4">
        {showCreate && (
          <form onSubmit={handleCreate} className="lg-inset rounded-[16px] p-4 space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Name</Label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Optional"
                  className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Email</Label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Password</Label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role" className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Role</Label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "viewer" })}
                  className="glass-search-input w-full px-3 py-2 text-[13px] tracking-[-0.01em]"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="apple-btn-blue px-3 py-1.5 text-[13px]">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="glass-capsule-btn px-3 py-1.5 text-[13px]">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="lg-inset rounded-[16px]">
          <table className="w-full text-[13px] tracking-[-0.01em]">
            <thead>
              <tr className="glass-table-header">
                <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">User</th>
                <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Role</th>
                <th className="px-4 py-2.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Created</th>
                <th className="px-4 py-2.5 text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="lg-inset-table-row">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{user.name || "-"}</p>
                      <p className="text-[12px] tracking-[-0.01em] text-foreground/45">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      user.role === "admin"
                        ? "bg-blue-500/8 text-blue-600 dark:text-blue-400"
                        : "bg-foreground/[0.04] text-foreground/45"
                    }`}>
                      {user.role === "admin" ? <Shield className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-foreground/45">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleToggleRole(user)}
                        className="glass-capsule-btn px-2.5 py-1 text-[12px]"
                        title={`Switch to ${user.role === "admin" ? "viewer" : "admin"}`}
                      >
                        {user.role === "admin" ? "Demote" : "Promote"}
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="glass-capsule-btn px-2 py-1 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
