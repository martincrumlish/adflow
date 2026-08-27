"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";

function ApiKeyRow({
  provider,
  label,
  hint,
  last4,
}: {
  provider: "openrouter" | "fal";
  label: string;
  hint: string;
  last4: string | null;
}) {
  const saveKey = useAction(api.apiKeys.save);
  const removeKey = useMutation(api.apiKeys.remove);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    try {
      await saveKey({ provider, key: value });
      setValue("");
      toast.success(`${label} key saved.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await removeKey({ provider });
      toast.success(`${label} key removed.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {last4 ? (
        <div className="flex items-center gap-2">
          <code className="rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs">
            ••••••••{last4}
          </code>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-red-400"
            onClick={onRemove}
            disabled={busy}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex max-w-md items-center gap-2">
          <Input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={`Paste your ${label} key`}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={onSave}
            disabled={busy || value.trim().length === 0}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const viewer = useQuery(api.users.viewer);
  const keyStatus = useQuery(api.apiKeys.status);
  const updateName = useMutation(api.users.updateName);
  const changePassword = useAction(api.users.changePassword);

  const [name, setName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (viewer && !nameInitialized) {
      setName(viewer.name ?? "");
      setNameInitialized(true);
    }
  }, [viewer, nameInitialized]);

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

  if (viewer === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Skeleton className="mb-6 h-8 w-40" />
        <Skeleton className="mb-4 h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details and password.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription className="flex items-center gap-2">
              {viewer?.email}
              {viewer?.planName && (
                <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">
                  {viewer.planName} plan
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveName} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="max-w-sm"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Updating your password signs out all other sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSavePassword} className="max-w-sm space-y-3">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Optional. When set, your research and image generation are
              billed to your own accounts instead of AdFlow&apos;s. Keys are
              stored encrypted and never shown again after saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ApiKeyRow
              provider="openrouter"
              label="OpenRouter"
              hint="Used for brand research and ad copywriting."
              last4={keyStatus?.openrouter ?? null}
            />
            <ApiKeyRow
              provider="fal"
              label="FAL"
              hint="Used for rendering the ad images."
              last4={keyStatus?.fal ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
