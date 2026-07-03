"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGES = 3;

export default function SetupPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const images = useQuery(api.productImages.listForProject, { projectId });
  const updateProject = useMutation(api.projects.update);
  const generateUploadUrl = useMutation(api.productImages.generateUploadUrl);
  const attach = useMutation(api.productImages.attach);
  const removeImage = useMutation(api.productImages.remove);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onSaveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateProject({
        projectId,
        name: formData.get("name") as string,
        brandName: formData.get("brandName") as string,
        brandUrl: formData.get("brandUrl") as string,
        productName: formData.get("productName") as string,
      });
      toast.success("Project details saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - (images?.length ?? 0);
    const selected = Array.from(files).slice(0, room);
    if (selected.length === 0) {
      toast.error(`You can upload at most ${MAX_IMAGES} product images.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of selected) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: only PNG, JPG, or WebP images.`);
          continue;
        }
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed (${response.status})`);
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        await attach({ projectId, storageId, filename: file.name });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (project === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }
  if (project === null) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            The brand and product AdFlow will research and advertise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveDetails} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Project name</Label>
                <Input id="name" name="name" defaultValue={project.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand name</Label>
                <Input
                  id="brandName"
                  name="brandName"
                  defaultValue={project.brandName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandUrl">Brand URL</Label>
                <Input
                  id="brandUrl"
                  name="brandUrl"
                  type="url"
                  defaultValue={project.brandUrl}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productName">Product name</Label>
                <Input
                  id="productName"
                  name="productName"
                  defaultValue={project.productName}
                />
              </div>
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save details
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product photos</CardTitle>
          <CardDescription>
            Upload 1–3 photos of the product (PNG, JPG, or WebP). They&apos;re
            used as references so generated ads show your real product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {(images ?? []).map((image) => (
              <div
                key={image._id}
                className="group relative size-28 overflow-hidden rounded-lg border border-border bg-muted"
              >
                {image.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.url}
                    alt={image.filename}
                    className="size-full object-cover"
                  />
                )}
                <button
                  type="button"
                  title="Remove"
                  onClick={() =>
                    removeImage({ imageId: image._id }).catch((error) =>
                      toast.error(errorMessage(error)),
                    )
                  }
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {(images?.length ?? 0) < MAX_IMAGES && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex size-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImagePlus className="size-5" />
                )}
                <span className="text-[11px]">
                  {uploading ? "Uploading…" : "Add photo"}
                </span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            hidden
            onChange={(event) => void onFilesSelected(event.target.files)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild size="sm" className="gap-2">
          <Link href={`/projects/${projectId}/brand-dna`}>
            Continue to Brand DNA
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
