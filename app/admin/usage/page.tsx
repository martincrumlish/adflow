"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** "2026-09" -> "September 2026". */
function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return month;
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function AdminUsagePage() {
  const months = useQuery(api.usage.months);
  const [selected, setSelected] = useState<string | null>(null);
  const month = selected ?? months?.[0] ?? null;
  const overview = useQuery(
    api.usage.adminOverview,
    month === null ? "skip" : { month },
  );

  if (months === undefined || overview === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const { rows, totals } = overview;

  return (
    <div className="space-y-4">
      <Select value={month ?? undefined} onValueChange={setSelected}>
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {monthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Images" value={totals.images.toLocaleString()} />
        <StatCard
          label="Estimated spend"
          value={usd.format(totals.estimatedCostUsd)}
        />
        <StatCard
          label="Research runs"
          value={totals.researchRuns.toLocaleString()}
        />
        <StatCard label="Copy runs" value={totals.copyRuns.toLocaleString()} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="mb-1 text-sm font-medium">No usage this month</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Renders, research, and copywriting show up here as soon as
            someone runs them.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Images</TableHead>
                <TableHead className="text-right">Research</TableHead>
                <TableHead className="text-right">Copy</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const metered = row.images - row.byokImages;
                const overQuota = row.quota !== null && metered >= row.quota;
                return (
                  <TableRow key={row.userId}>
                    <TableCell className="max-w-64 truncate font-medium">
                      {row.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.planName ?? "No plan"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.byokImages > 0 && (
                        <Badge
                          variant="outline"
                          className="mr-2 h-4.5 px-1.5 text-[10px] text-muted-foreground"
                          title={`${row.byokImages} rendered on their own FAL key`}
                        >
                          own keys
                        </Badge>
                      )}
                      {row.quota !== null ? (
                        <span className={overQuota ? "text-red-500" : undefined}>
                          {metered.toLocaleString()}
                          <span className="text-muted-foreground">
                            {" "}
                            / {row.quota.toLocaleString()}
                          </span>
                        </span>
                      ) : (
                        row.images.toLocaleString()
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.researchRuns}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.copyRuns}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd.format(row.estimatedCostUsd)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Costs are estimates based on the per-call rates in
        convex/lib/costs.ts, not provider invoices. Calls made with a
        customer&apos;s own API keys are counted but cost us nothing, so
        they are left out of spend.
      </p>
    </div>
  );
}
