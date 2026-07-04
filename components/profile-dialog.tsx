"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
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
import { Separator } from "@/components/ui/separator";
import { errorMessage } from "@/lib/errors";

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const viewer = useQuery(api.users.viewer);
  const updateName = useMutation(api.users.updateName);
  const changePassword = useAction(api.users.changePassword);

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setName(viewer?.name ?? "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSaveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingName(true);
    try {
      await updateName({ name });
      toast.success("Name saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingName(false);
    }
  }

  async function onSavePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast.success("Password updated. Other sessions were signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(errorMessage(error, "Could not change the password."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>{viewer?.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSaveName} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={savingName || name === (viewer?.name ?? "")}
          >
            {savingName && <Loader2 className="size-4 animate-spin" />}
            Save name
          </Button>
        </form>

        <Separator />

        <form onSubmit={onSavePassword} className="space-y-3">
          <p className="text-sm font-medium">Change password</p>
          <div className="space-y-2">
            <Label htmlFor="profile-current">Current password</Label>
            <Input
              id="profile-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-new">New password</Label>
            <Input
              id="profile-new"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-confirm">Confirm new password</Label>
            <Input
              id="profile-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={savingPassword || !currentPassword || !newPassword}
          >
            {savingPassword && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
