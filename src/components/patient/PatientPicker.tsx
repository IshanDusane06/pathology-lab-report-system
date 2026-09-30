import React, { useState, useEffect, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, UserPlus, X, Phone, Mail } from "lucide-react";
import { patientsApi, IPatient, IPatientSearchResult } from "@/services/patientsApi";
import PatientFormDialog from "./PatientFormDialog";
import { formatAge, formatLastVisit } from "./patientDisplay";

interface PatientPickerProps {
  selected: IPatient | null;
  onSelect: (patient: IPatient | null) => void;
  error?: string;
  disabled?: boolean;
  /** Render without the surrounding Card — for use inside a dialog. */
  bare?: boolean;
}

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other" };

/**
 * Search-first patient selection: one field that accepts a phone number, a
 * name, or a patient ID and works out which it was given. Results carry
 * enough detail to tell two same-named people apart, because that is the
 * single decision this control exists to get right.
 */
const PatientPicker = ({ selected, onSelect, error, disabled, bare = false }: PatientPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IPatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Debounced so it doesn't fire per keystroke; the server side is capped and
  // index-backed so this stays cheap at any table size.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      patientsApi
        .searchPatients(query.trim())
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (patient: IPatient) => {
    onSelect(patient);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  if (selected) {
    const summary = (
      <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{selected.name}</span>
                <span className="text-xs font-mono text-primary">{selected.patientId}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {SEX_LABEL[selected.sex] || selected.sex} · {formatAge(selected)}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {selected.phone || "No phone on file"}
                </span>
                {selected.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {selected.email}
                  </span>
                )}
              </div>
            </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4 mr-1" />
            Change
          </Button>
        )}
      </div>
    );

    if (bare) return summary;

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Patient</CardTitle>
        </CardHeader>
        <CardContent>{summary}</CardContent>
      </Card>
    );
  }

  const search = (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-start font-normal text-muted-foreground"
                disabled={disabled}
              >
                <Search className="h-4 w-4 mr-2 shrink-0" />
                Search by mobile number, name, or patient ID
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              {/* shouldFilter off — the server already decided what matches,
                  and cmdk's own fuzzy filter would second-guess it. */}
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Mobile, name, or P-000042..."
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {loading && (
                    <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
                  )}
                  {/* Not CommandEmpty: cmdk gates that on its own item count,
                      and the always-present "Create new patient" item keeps
                      that count at one, so it would never show. */}
                  {!loading && query.trim() && results.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No patient matches &ldquo;{query.trim()}&rdquo;.
                    </div>
                  )}
                  {!loading && !query.trim() && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Start typing to find a patient.
                    </div>
                  )}
                  {results.length > 0 && (
                    <CommandGroup heading={`${results.length} match${results.length === 1 ? "" : "es"}`}>
                      {results.map((patient) => (
                        <CommandItem
                          key={patient._id}
                          value={patient._id}
                          onSelect={() => choose(patient)}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-mono text-xs text-primary shrink-0">
                              {patient.patientId}
                            </span>
                            <span className="font-medium truncate">{patient.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {SEX_LABEL[patient.sex] || patient.sex} · {formatAge(patient)} ·{" "}
                            {patient.phone || "no phone"} · {formatLastVisit(patient.lastVisit)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  <CommandGroup>
                    <CommandItem
                      value="__create__"
                      onSelect={() => {
                        setOpen(false);
                        setCreateOpen(true);
                      }}
                      className="text-primary"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create new patient
                      {query.trim() ? ` — "${query.trim()}"` : ""}
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  return (
    <>
      {bare ? (
        search
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Patient <span className="text-destructive">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent>{search}</CardContent>
        </Card>
      )}

      <PatientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={/^\d+$/.test(query.trim()) ? "" : query.trim()}
        onCreated={choose}
        onSelectExisting={choose}
      />
    </>
  );
};

export default PatientPicker;
