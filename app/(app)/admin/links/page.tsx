"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
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

function signupUrl(token: string): string {
  return `${window.location.origin}/signup/${token}`;
}

export default function AdminLinksPage() {
  const links = useQuery(api.signupLinks.adminList);
  const plans = useQuery(api.plans.adminList);
  const createLink = useMutation(api.signupLinks.create);
  const setActive = useMutation(api.signupLinks.setActive);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [planId, setPlanId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<Id<"signupLinks"> | null>(null);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planId) {
      toast.error("Pick a plan for this link.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    setPending(true);
    try {
      const token = await createLink({
        planId: planId as Id<"plans">,
        label: (formData.get("label") as string) || undefined,
      });
      await navigator.clipboard.writeText(signupUrl(token)).catch(() => {});
      toast.success("Signup link created and copied to clipboard.");
      setDialogOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function copyLink(linkId: Id<"signupLinks">, token: string) {
    try {
      await navigator.clipboard.writeText(signupUrl(token));
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Could not copy — copy it manually.");
    }
  }

  if (links === undefined || plans === undefined) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  const activePlans = plans.filter((plan) => plan.active);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
          disabled={plans.length === 0}
        >
          <Plus className="size-4" />
          New signup link
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="mb-1 text-sm font-medium">No signup links yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {plans.length === 0
              ? "Create a plan first, then generate a signup link for it."
              : "Generate a link and share it — everyone who signs up through it lands on that plan."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link._id}>
                  <TableCell className="font-medium">
                    {link.label ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px]">
                      {link.planName}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="max-w-56 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        /signup/{link.token.slice(0, 12)}…
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        title="Copy full URL"
                        onClick={() => void copyLink(link._id, link.token)}
                      >
                        {copiedId === link._id ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(link._creationTime).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={link.active}
                      onCheckedChange={(active) =>
                        setActive({ linkId: link._id, active }).catch(
                          (error) => toast.error(errorMessage(error)),
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New signup link</DialogTitle>
            <DialogDescription>
              Reusable and non-expiring. Anyone who signs up through it gets
              the selected plan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a plan" />
                </SelectTrigger>
                <SelectContent>
                  {activePlans.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-label">Label (optional)</Label>
              <Input
                id="link-label"
                name="label"
                placeholder="Launch promo, agency client, …"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create and copy link
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
