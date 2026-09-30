import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Search, Copy } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { usersApi, IUser } from "@/services/usersApi";
import { Pagination } from "@/services/api";

const ROLES: IUser["role"][] = ["Doctor", "Technician", "Admin"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatLastActive(lastLogin?: string | null) {
  if (!lastLogin) return "Never";
  const diffMs = Date.now() - new Date(lastLogin).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function formatCreatedAgo(createdAt?: string) {
  if (!createdAt) return "";
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days < 1) return "created today";
  if (days === 1) return "created 1 day ago";
  return `created ${days} days ago`;
}

interface RevealedPassword {
  label: string;
  tempPassword: string;
}

interface AdminUsersTabProps {
  openCreateSignal?: number;
}

const AdminUsersTab: React.FC<AdminUsersTabProps> = ({ openCreateSignal }) => {
  const [users, setUsers] = useState<IUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [awaitingUsers, setAwaitingUsers] = useState<IUser[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "Technician" as IUser["role"] });

  const [revealed, setRevealed] = useState<RevealedPassword | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAwaiting = async () => {
    setAwaitingLoading(true);
    try {
      const res = await usersApi.getUsers({ neverSignedIn: true, limit: 50 });
      setAwaitingUsers(res.data);
    } catch (error) {
      // Non-fatal for the main tab — surfaced only via the empty section, no toast noise.
    } finally {
      setAwaitingLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getUsers({
        page,
        limit: 10,
        role: roleFilter === "all" ? undefined : (roleFilter as IUser["role"]),
        status: statusFilter === "all" ? undefined : (statusFilter as "active" | "suspended"),
        search: search || undefined,
      });
      setUsers(res.data);
      setPagination(res.pagination);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAwaiting();
  }, []);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roleFilter, statusFilter]);

  // Debounced search — reset to page 1 whenever the query changes. Skips the
  // initial mount so it doesn't duplicate the page/role/status effect's fetch.
  const isFirstSearch = React.useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadUsers();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (openCreateSignal) setCreateOpen(true);
  }, [openCreateSignal]);

  const handleRoleChange = async (userId: string, role: IUser["role"]) => {
    try {
      const updated = await usersApi.updateUser(userId, { role });
      setUsers((prev) => prev.map((u) => (u._id === userId ? updated : u)));
      toast({ title: "Role updated", description: `Role changed to ${role}.` });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update role",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (u: IUser) => {
    try {
      const updated = await usersApi.updateUser(u._id, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => (x._id === u._id ? updated : x)));
      toast({ title: updated.isActive ? "Access restored" : "User suspended" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user",
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (u: IUser) => {
    setResettingId(u._id);
    try {
      const { tempPassword } = await usersApi.resetPassword(u._id);
      setRevealed({ label: u.name, tempPassword });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setResettingId(null);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email) {
      toast({ title: "Missing fields", description: "Name and email are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const created = await usersApi.createUser(newUser);
      setCreateOpen(false);
      setNewUser({ name: "", email: "", role: "Technician" });
      if (created.tempPassword) {
        setRevealed({ label: created.name || newUser.name, tempPassword: created.tempPassword });
      } else {
        toast({ title: "User created", description: `${newUser.name} can now log in.` });
      }
      await Promise.all([loadUsers(), loadAwaiting()]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteInvite = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usersApi.deleteUser(deleteTarget._id);
      toast({ title: "Invite deleted", description: `${deleteTarget.email} was removed.` });
      setDeleteTarget(null);
      await loadAwaiting();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyRevealed = () => {
    if (!revealed) return;
    navigator.clipboard?.writeText(revealed.tempPassword).then(
      () => toast({ title: "Copied to clipboard" }),
      () => undefined
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter users</CardTitle>
          <CardDescription>Search by name or email, narrow by role and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Users</CardTitle>
            <CardDescription>
              {pagination.total} user{pagination.total === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Create user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>
                  A temporary password is generated automatically and shown once you create the account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as IUser["role"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateUser} disabled={creating}>
                  {creating ? "Creating..." : "Create user"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-3 text-muted-foreground font-medium text-sm">User</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Role</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Status</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Last active</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id} className="border-t border-border">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium leading-tight">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Select value={u.role} onValueChange={(v) => handleRoleChange(u._id, v as IUser["role"])}>
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={
                              u.isActive
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }
                          >
                            {u.isActive ? "Active" : "Suspended"}
                          </Badge>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">{formatLastActive(u.lastLogin)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResetPassword(u)}
                              disabled={resettingId === u._id}
                            >
                              {resettingId === u._id ? "Resetting..." : "Reset password"}
                            </Button>
                            {u.isActive ? (
                              <Button size="sm" variant="destructive" onClick={() => handleToggleActive(u)}>
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => handleToggleActive(u)}
                              >
                                Restore access
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting first sign-in</CardTitle>
          <CardDescription>
            Accounts created with a temporary password — the first successful login counts as accepted
          </CardDescription>
        </CardHeader>
        <CardContent>
          {awaitingLoading ? (
            <div className="py-6 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : awaitingUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No accounts are waiting on a first sign-in.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {awaitingUsers.map((u) => (
                    <tr key={u._id} className="border-t border-border">
                      <td className="py-3 font-medium">{u.email}</td>
                      <td className="py-3 text-muted-foreground">{u.role}</td>
                      <td className="py-3 text-muted-foreground">{formatCreatedAgo(u.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetPassword(u)}
                            disabled={resettingId === u._id}
                          >
                            {resettingId === u._id ? "Working..." : "New password"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!revealed} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password for {revealed?.label}</DialogTitle>
            <DialogDescription>
              This is shown once and isn't stored anywhere retrievable — copy it now and share it with them directly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">{revealed?.tempPassword}</code>
            <Button variant="outline" size="icon" onClick={copyRevealed}>
              <Copy size={16} />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.email} has never signed in. This permanently removes the account — they'd need a fresh
              invite to get access again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvite} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsersTab;
