import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { auditApi, IAuditEvent } from "@/services/auditApi";
import { Pagination } from "@/services/api";

type Category = "Signature" | "Access" | "Template" | "Delivery";

const CATEGORY_STYLES: Record<Category, string> = {
  Signature: "bg-green-50 text-green-700 border-green-200",
  Access: "bg-purple-50 text-purple-700 border-purple-200",
  Template: "bg-blue-50 text-blue-700 border-blue-200",
  Delivery: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatWhen(createdAt: string) {
  return new Date(createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toCsv(events: IAuditEvent[]) {
  const header = ["When", "Actor", "Role", "Event", "Category"];
  const rows = events.map((e) => [
    new Date(e.createdAt).toISOString(),
    e.actor?.name || "",
    e.actor?.role || "",
    e.description.replace(/"/g, '""'),
    e.category,
  ]);
  return [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}

const AdminAuditTab: React.FC = () => {
  const [events, setEvents] = useState<IAuditEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await auditApi.getEvents({
        page,
        limit: 10,
        category: categoryFilter === "all" ? undefined : (categoryFilter as Category),
      });
      setEvents(res.data);
      setPagination(res.pagination);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load audit trail", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, categoryFilter]);

  const handleExport = () => {
    if (!events.length) {
      toast({ title: "Nothing to export", description: "No events on this page." });
      return;
    }
    const csv = toCsv(events);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-page-${pagination.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Audit trail</CardTitle>
          <CardDescription>Every sign, un-sign, role change and template edit, newest first</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="Signature">Signature</SelectItem>
              <SelectItem value="Access">Access</SelectItem>
              <SelectItem value="Template">Template</SelectItem>
              <SelectItem value="Delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No audit events yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="pb-3 text-muted-foreground font-medium text-sm">When</th>
                    <th className="pb-3 text-muted-foreground font-medium text-sm">Actor</th>
                    <th className="pb-3 text-muted-foreground font-medium text-sm">Event</th>
                    <th className="pb-3 text-muted-foreground font-medium text-sm">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e._id} className="border-t border-border">
                      <td className="py-3 text-sm text-muted-foreground whitespace-nowrap">{formatWhen(e.createdAt)}</td>
                      <td className="py-3">
                        <p className="text-sm font-medium">{e.actor?.name || "System"}</p>
                        <p className="text-xs text-muted-foreground">{e.actor?.role || ""}</p>
                      </td>
                      <td className="py-3 text-sm">{e.description}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={CATEGORY_STYLES[e.category]}>
                          {e.category}
                        </Badge>
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
  );
};

export default AdminAuditTab;
