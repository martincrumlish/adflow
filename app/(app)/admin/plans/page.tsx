"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, PencilLine, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";

type PlanRow = {
  _id: Id<"plans">;
  name: string;
  description?: string;
  active: boolean;
};

export default function AdminPlansPage() {
  const plans = useQuery(api.plans.adminList);
  const createPlan = useMutation(api.plans.create);
  const updatePlan = useMutation(api.plans.update);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlanRow | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    setPending(true);
    try {
      if (editTarget) {
        await updatePlan({ planId: editTarget._id, name, description });
        toast.success("Plan updated.");
      } else {
        await createPlan({ name, description: description || undefined });
        toast.success("Plan created.");
      }
      setDialogOpen(false);
      setEditTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  if (plans === undefined) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" />
          New plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="mb-1 text-sm font-medium">No plans yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Create a plan (e.g. “Free”, “Pro”, “Agency”), then generate a
            signup link for it.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Links</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan._id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {plan.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{plan.userCount}</TableCell>
                  <TableCell className="text-right">{plan.linkCount}</TableCell>
                  <TableCell>
                    <Switch
                      checked={plan.active}
                      onCheckedChange={(active) =>
                        updatePlan({ planId: plan._id, active }).catch(
                          (error) => toast.error(errorMessage(error)),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      title="Edit plan"
                      onClick={() => {
                        setEditTarget(plan);
                        setDialogOpen(true);
                      }}
                    >
                      <PencilLine className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>
              Plans tag accounts — they don&apos;t gate features yet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                name="name"
                defaultValue={editTarget?.name ?? ""}
                placeholder="Pro"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-description">Description (optional)</Label>
              <Input
                id="plan-description"
                name="description"
                defaultValue={editTarget?.description ?? ""}
                placeholder="For growing brands"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editTarget ? "Save plan" : "Create plan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
