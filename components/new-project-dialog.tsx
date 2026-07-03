"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";

export function NewProjectDialog({ children }: { children: ReactNode }) {
  const create = useMutation(api.projects.create);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    try {
      const projectId = await create({
        name: formData.get("name") as string,
        brandName: formData.get("brandName") as string,
        brandUrl: formData.get("brandUrl") as string,
        productName: formData.get("productName") as string,
      });
      setOpen(false);
      router.push(`/projects/${projectId}/setup`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            One brand, one product, one batch of ads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">Project name</Label>
            <Input
              id="np-name"
              name="name"
              placeholder="Acme spring campaign"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-brand">Brand name</Label>
            <Input id="np-brand" name="brandName" placeholder="Acme" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-url">Brand URL</Label>
            <Input
              id="np-url"
              name="brandUrl"
              type="url"
              placeholder="https://acme.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-product">Product name</Label>
            <Input
              id="np-product"
              name="productName"
              placeholder="Acme Cold Brew Kit"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create project
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
