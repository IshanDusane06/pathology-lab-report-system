import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IDuplicateCandidate } from "@/services/patientsApi";
import { formatPatientLine } from "./patientDisplay";

interface DuplicateWarningProps {
  candidates: IDuplicateCandidate[];
  onSelect: (candidate: IDuplicateCandidate) => void;
}

/**
 * Shown while a new patient is being typed, before anything is saved.
 * Catching a duplicate here is the whole strategy — merging is only the
 * cleanup path for what slips through.
 */
const DuplicateWarning = ({ candidates, onSelect }: DuplicateWarningProps) => {
  if (!candidates.length) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-amber-900">
            {candidates.length === 1
              ? "This may already be an existing patient"
              : `${candidates.length} existing patients look similar`}
          </p>
          <ul className="space-y-1.5">
            {candidates.map(({ patient, confidence, reasons }) => (
              <li
                key={patient._id}
                className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-white px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{formatPatientLine(patient)}</p>
                  <p className="text-xs text-muted-foreground">
                    {reasons.join(" · ")}
                    {confidence === "strong" ? " · strong match" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => onSelect({ patient, confidence, reasons })}
                >
                  Use this one
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DuplicateWarning;
