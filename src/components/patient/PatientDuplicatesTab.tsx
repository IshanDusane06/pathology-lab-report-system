import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { patientsApi, IDuplicateGroup } from "@/services/patientsApi";
import { formatAge } from "./patientDisplay";

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other" };

/**
 * Cleanup surface for near-duplicates that got through creation via
 * force:true — grouped by similar-sounding name + sex, the same signal used
 * at creation time. A group keeps appearing until it's resolved by a merge;
 * there's no "dismiss," since revisiting one costs nothing and a silent
 * dismiss would just hide a real duplicate from the next admin who looks.
 */
const PatientDuplicatesTab = () => {
  const [groups, setGroups] = useState<IDuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [confirmGroup, setConfirmGroup] = useState<IDuplicateGroup | null>(null);
  const [merging, setMerging] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await patientsApi.getDuplicateGroups();
      setGroups(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load duplicate patients", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleMerge = async () => {
    if (!confirmGroup) return;
    const survivorId = selected[confirmGroup.key];
    const losers = confirmGroup.patients.filter((p) => p._id !== survivorId);
    if (!survivorId || !losers.length) return;

    setMerging(true);
    try {
      let totalMoved = 0;
      // Sequential, not Promise.all — each merge re-points reports and writes
      // an audit entry; doing them one at a time keeps that trail readable
      // and avoids two merges racing to update the same report.
      for (const loser of losers) {
        const result = await patientsApi.mergePatients(loser._id, survivorId);
        totalMoved += result.reportsMoved;
      }
      const survivorName = confirmGroup.patients.find((p) => p._id === survivorId)?.name;
      toast({
        title: "Patients merged",
        description: `${losers.length} record${losers.length === 1 ? "" : "s"} merged into ${survivorName} — ${totalMoved} report${totalMoved === 1 ? "" : "s"} moved.`,
      });
      setConfirmGroup(null);
      load();
    } catch (error) {
      toast({
        title: "Couldn't merge these patients",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No possible duplicates found — every similar-sounding name resolves to a distinct sex, or
          there's simply no overlap right now.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const survivorId = selected[group.key];
        return (
          <Card key={group.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">{group.reason}</CardTitle>
                  <CardDescription>
                    {group.patients.length} patients · {SEX_LABEL[group.patients[0].sex]}
                    {group.sharesPhone && " · share a phone number"}
                  </CardDescription>
                </div>
                {group.sharesPhone && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Same phone
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pick which record to keep — the others will be merged into it. Every report moves to
                the one you keep; nothing about an already-signed report's own content changes.
              </p>
              <RadioGroup
                value={survivorId || ""}
                onValueChange={(v) => setSelected((prev) => ({ ...prev, [group.key]: v }))}
              >
                {group.patients.map((p) => (
                  <label
                    key={p._id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <RadioGroupItem value={p._id} />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>{" "}
                      <span className="text-xs font-mono text-primary">{p.patientId}</span>
                      <p className="text-xs text-muted-foreground">
                        {formatAge(p)} · {p.phone || "no phone"} · registered{" "}
                        {new Date(p.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!survivorId}
                  onClick={() => setConfirmGroup(group)}
                >
                  Merge into selected
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!confirmGroup} onOpenChange={(open) => !open && setConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge these patient records?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGroup && (
                <>
                  {confirmGroup.patients.length - 1 === 1 ? "1 record" : `${confirmGroup.patients.length - 1} records`}{" "}
                  will be merged into{" "}
                  <strong>{confirmGroup.patients.find((p) => p._id === selected[confirmGroup.key])?.name}</strong>.
                  Every report they own moves to the kept record. This can't be undone from here — a
                  merged record stays merged, though its reports remain fully intact and correctly
                  signed either way.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merging}>
              {merging ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PatientDuplicatesTab;
