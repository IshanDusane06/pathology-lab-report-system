import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import RemarksEditor from "./RemarksEditor";
import { IDatedReading } from "@/services/reportsApi";

interface DatedReadingsFieldProps {
  value: IDatedReading[];
  onChange: (next: IDatedReading[]) => void;
  disabled?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The repeatable row group behind the "datedReadings" parameter type — the
// same measurement recorded again on a different date within one report
// (e.g. a Mantoux test's Day 1 / Day 2 / Day 3 readings), which used to need
// a separate, uniquely-named template parameter per reading. A new row's
// date defaults to today so most edits stay on the native picker's calendar
// UI rather than typing a date by hand — the class of native-date-input bug
// fixed for DOB entry is far lower-stakes here, but there's no reason to
// reintroduce it where a default sidesteps it entirely.
const DatedReadingsField: React.FC<DatedReadingsFieldProps> = ({ value, onChange, disabled }) => {
  const readings = Array.isArray(value) ? value : [];

  const updateReading = (index: number, patch: Partial<IDatedReading>) => {
    onChange(readings.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeReading = (index: number) => {
    onChange(readings.filter((_, i) => i !== index));
  };

  const addReading = () => {
    onChange([...readings, { date: todayIso(), value: "" }]);
  };

  return (
    <div className="space-y-3">
      {readings.map((reading, index) => (
        <div key={index} className="rounded-md border border-input p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Input
              type="date"
              value={reading.date}
              onChange={(e) => updateReading(index, { date: e.target.value })}
              disabled={disabled}
              className="w-40"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => removeReading(index)}
              disabled={disabled}
            >
              <X size={14} />
              Remove
            </Button>
          </div>
          <RemarksEditor
            value={reading.value}
            onChange={(html) => updateReading(index, { value: html })}
            placeholder="Enter this reading..."
            disabled={disabled}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={addReading}
        disabled={disabled}
      >
        <Plus size={14} />
        Add reading
      </Button>
    </div>
  );
};

export default DatedReadingsField;
