"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";

const NO_PLAN = "none" as const;

export default function AdminUsersPage() {
  const users = useQuery(api.users.adminList);
  const plans = useQuery(api.plans.adminList);
  const updateUser = useMutation(api.users.adminUpdate);
  const deleteUser = useMutation(api.users.adminDelete);
  const createUser = useAction(api.users.adminCreate);

  const [addOpen, setAddOpen] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [addPlan, setAddPlan] = useState<string>(NO_PLAN);
  const [addRole, setAddRole] = useState<"admin" | "user">("user");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"users">;
    email: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onAddUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setAddPending(true);
    try {
      await createUser({
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        planId: addPlan === NO_PLAN ? null : (addPlan as Id<"plans">),
        role: addRole,
      });
      toast.success("User created.");
      setAddOpen(false);
      setAddPlan(NO_PLAN);
      setAddRole("user");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAddPending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser({ userId: deleteTarget.id });
      toast.success(`Deleted ${deleteTarget.email}.`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (users === undefined || plans === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add user
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell className="font-medium">
                  {user.email}
                  {user.isAdmin && user.role !== "admin" && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-4.5 px-1.5 text-[10px]"
                      title="Admin via ADMIN_EMAILS allowlist"
                    >
                      allowlist admin
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={user.planId ?? NO_PLAN}
                    onValueChange={(value) =>
                      updateUser({
                        userId: user._id,
                        planId:
                          value === NO_PLAN ? null : (value as Id<"plans">),
                        role: user.role,
                      }).catch((error) => toast.error(errorMessage(error)))
                    }
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN}>No plan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan._id} value={plan._id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    onValueChange={(value) =>
                      updateUser({
                        userId: user._id,
                        planId: user.planId,
                        role: value as "admin" | "user",
                      }).catch((error) => toast.error(errorMessage(error)))
                    }
                  >
                    <SelectTrigger size="sm" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-red-400"
                    title="Delete user"
                    onClick={() =>
                      setDeleteTarget({ id: user._id, email: user.email })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates an account directly — share the credentials with the
              customer yourself.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="au-email">Email</Label>
              <Input id="au-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-password">Password</Label>
              <Input
                id="au-password"
                name="password"
                type="text"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={addPlan} onValueChange={setAddPlan}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PLAN}>No plan</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan._id} value={plan._id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={addRole}
                  onValueChange={(value) =>
                    setAddRole(value as "admin" | "user")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={addPending}>
              {addPending && <Loader2 className="size-4 animate-spin" />}
              Create user
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.email}?</DialogTitle>
            <DialogDescription>
              This permanently removes the account and all of its projects,
              images, and templates.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
