import React from "react";
import { Input } from "@/components/ui/input";
import { SubField } from "@/services/reportTypesApi";
import { IBreakdownEntry } from "@/services/reportsApi";

interface BreakdownFieldProps {
  subFields: SubField[];
  value: IBreakdownEntry[];
  onChange: (next: IBreakdownEntry[]) => void;
  disabled?: boolean;
}

// The repeatable-but-fixed row group behind the "breakdown" parameter type —
// e.g. Motility: Actively Motile / Sluggishly Motile / Non Motile, each with
// its own value. Unlike DatedReadingsField, the row set itself is admin-
// defined at template time (subFields), not technician-added at report time,
// so there's no add/remove here — always exactly one row per subField, in
// template order. Every change reconstructs the whole array (one entry per
// subField) rather than patching in place, so the saved shape never drifts
// from the template's current subField list.
const BreakdownField: React.FC<BreakdownFieldProps> = ({ subFields, value, onChange, disabled }) => {
  const entries = Array.isArray(value) ? value : [];
  const valueByLabel = new Map(entries.map((e) => [e.label, e.value]));

  const updateValue = (label: string, newValue: string) => {
    onChange(
      subFields.map((sf) => ({
        label: sf.label,
        value: sf.label === label ? newValue : (valueByLabel.get(sf.label) ?? ""),
      })),
    );
  };

  return (
    <div className="space-y-2">
      {subFields.map((sf) => (
        <div key={sf.label} className="flex items-center gap-2">
          <span className="text-sm w-40 shrink-0">{sf.label}</span>
          <Input
            type="number"
            value={valueByLabel.get(sf.label) ?? ""}
            onChange={(e) => updateValue(sf.label, e.target.value)}
            disabled={disabled}
            className="flex-1"
          />
          {sf.unit && <span className="text-sm text-muted-foreground w-14">{sf.unit}</span>}
        </div>
      ))}
    </div>
  );
};

export default BreakdownField;
