import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { IPatient } from "@/services/patientsApi";
import { reportsApi } from "@/services/reportsApi";
import PatientPicker from "./PatientPicker";

interface LinkPatientDialogProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
  /** Shown as a starting point — what the report itself recorded. */
  recordedName?: string;
}

/**
 * Links a report created before the patient module existed to a patient
 * record. This is the on-demand alternative to a bulk migration: no script
 * ever guessed which same-named reports were the same person, so a human
 * decides, one report at a time.
 */
const LinkPatientDialog = ({
  reportId,
  open,
  onOpenChange,
  onLinked,
  recordedName,
}: LinkPatientDialogProps) => {
  const [patient, setPatient] = useState<IPatient | null>(null);
  const [linking, setLinking] = useState(false);

  const handleLink = async () => {
    if (!patient) return;
    setLinking(true);
    try {
      await reportsApi.linkPatient(reportId, patient._id);
      toast({
        title: "Report linked",
        description: `Now part of ${patient.name}'s history (${patient.patientId}).`,
      });
      setPatient(null);
      onLinked();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Couldn't link this report",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !linking && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link this report to a patient</DialogTitle>
          <DialogDescription>
            {recordedName
              ? `This report was issued to "${recordedName}". Find that patient, or create their record.`
              : "Find the patient this report belongs to, or create their record."}
            {" "}
            The report itself won&rsquo;t change — what it says stays exactly as it was signed.
          </DialogDescription>
        </DialogHeader>

        <PatientPicker bare selected={patient} onSelect={setPatient} />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linking}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!patient || linking}>
            {linking ? "Linking..." : "Link report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LinkPatientDialog;
