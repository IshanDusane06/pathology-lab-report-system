import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  patientsApi,
  IPatient,
  IDuplicateCandidate,
  DuplicatePatientError,
} from "@/services/patientsApi";
import DuplicateWarning from "./DuplicateWarning";
import {
  isValidCalendarDate,
  isValidPhone,
  isValidEmail,
  combineDateParts,
} from "@/lib/patientValidation";

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the name from whatever was typed into the picker. */
  initialName?: string;
  onCreated: (patient: IPatient) => void;
  /** Offered when a duplicate check surfaces the patient they actually meant. */
  onSelectExisting?: (patient: IPatient) => void;
}

const PatientFormDialog = ({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
  onSelectExisting,
}: PatientFormDialogProps) => {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other" | "">("");
  // A patient who knows their DOB gives a stable answer; one who doesn't gives
  // an age. Both are offered rather than forcing a guess at a birth date.
  const [ageMode, setAgeMode] = useState<"dob" | "age">("dob");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<IDuplicateCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const dobMonthRef = useRef<HTMLInputElement>(null);
  const dobYearRef = useRef<HTMLInputElement>(null);

  // "" unless day, month AND a full 4-digit year are all present — a
  // still-in-progress entry never looks like a real date.
  const dob = combineDateParts(dobDay, dobMonth, dobYear);
  const dobStarted = !!(dobDay || dobMonth || dobYear);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPhone("");
    setEmail("");
    setSex("");
    setAgeMode("dob");
    setDobDay("");
    setDobMonth("");
    setDobYear("");
    setAgeYears("");
    setAddress("");
    setNotes("");
    setErrors({});
    setCandidates([]);
  }, [open, initialName]);

  // Live duplicate check while they type. Debounced, and deliberately
  // non-blocking: it informs the decision rather than gating the form.
  const firstCheck = useRef(true);
  useEffect(() => {
    if (!open) return;
    if (firstCheck.current) {
      firstCheck.current = false;
      return;
    }
    if (!name.trim() || !sex) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      patientsApi
        .checkDuplicates({
          name: name.trim(),
          phone: phone.trim() || null,
          sex: sex as "male" | "female" | "other",
          dob: ageMode === "dob" ? dob || null : null,
          ageYears: ageMode === "age" && ageYears ? Number(ageYears) : null,
        })
        .then(setCandidates)
        .catch(() => setCandidates([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [open, name, phone, sex, dob, ageYears, ageMode]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Patient name is required";
    if (!sex) next.sex = "Select the patient's sex";
    if (ageMode === "dob" && dobStarted) {
      if (!dob) {
        next.dob = "Enter a complete date of birth (day, month and year)";
      } else if (!isValidCalendarDate(dob)) {
        next.dob = "That date doesn't exist — check the day and month";
      } else if (new Date(dob) > new Date()) {
        next.dob = "Date of birth can't be in the future";
      }
    }
    if (ageMode === "age" && ageYears) {
      const n = Number(ageYears);
      if (Number.isNaN(n) || n < 0 || n > 150) next.ageYears = "Enter an age between 0 and 150";
    }
    if (phone.trim() && !isValidPhone(phone)) {
      next.phone = "Enter a valid 10-digit mobile number";
    }
    if (email.trim() && !isValidEmail(email)) {
      next.email = "Enter a valid email address";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (force: boolean) => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await patientsApi.createPatient(
        {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          sex: sex as "male" | "female" | "other",
          dob: ageMode === "dob" ? dob || null : null,
          ageYears: ageMode === "age" && ageYears ? Number(ageYears) : null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        },
        force
      );
      toast({
        title: "Patient registered",
        description: `${created.name} — ${created.patientId}`,
      });
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof DuplicatePatientError) {
        // The server found something the live check hadn't surfaced yet.
        // Show it and let them decide rather than silently creating a second
        // record for someone the lab already knows.
        setCandidates(error.candidates);
      } else {
        toast({
          title: "Couldn't register this patient",
          description: error instanceof Error ? error.message : "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const hasCandidates = candidates.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New patient</DialogTitle>
          <DialogDescription>
            A patient ID is assigned automatically. Only name and sex are required — the rest
            can be filled in later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="patient-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="patient-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sagar Kulkarni"
              autoFocus
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="patient-sex">
                Sex <span className="text-destructive">*</span>
              </Label>
              <Select value={sex} onValueChange={(v) => setSex(v as typeof sex)}>
                <SelectTrigger id="patient-sex">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.sex && <p className="text-xs text-destructive">{errors.sex}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patient-phone">Mobile number</Label>
              <Input
                id="patient-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Optional — 10-digit number"
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{ageMode === "dob" ? "Date of birth" : "Age"}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setAgeMode(ageMode === "dob" ? "age" : "dob")}
              >
                {ageMode === "dob" ? "Don't know the date — enter age" : "Enter date of birth instead"}
              </button>
            </div>
            {ageMode === "dob" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={2}
                    value={dobDay}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setDobDay(v);
                      if (v.length === 2) dobMonthRef.current?.focus();
                    }}
                    placeholder="DD"
                    aria-label="Day of birth"
                  />
                  <Input
                    ref={dobMonthRef}
                    inputMode="numeric"
                    maxLength={2}
                    value={dobMonth}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setDobMonth(v);
                      if (v.length === 2) dobYearRef.current?.focus();
                    }}
                    placeholder="MM"
                    aria-label="Month of birth"
                  />
                  <Input
                    ref={dobYearRef}
                    inputMode="numeric"
                    maxLength={4}
                    value={dobYear}
                    onChange={(e) => setDobYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="YYYY"
                    aria-label="Year of birth"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Preferred — age is then always current, and never needs re-asking.
                </p>
              </>
            ) : (
              <>
                <Input
                  type="number"
                  min={0}
                  max={150}
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                  placeholder="e.g. 33"
                />
                <p className="text-xs text-muted-foreground">
                  Recorded with today's date, so it can be shown as an age &ldquo;as of&rdquo; now.
                </p>
              </>
            )}
            {errors.dob && <p className="text-xs text-destructive">{errors.dob}</p>}
            {errors.ageYears && <p className="text-xs text-destructive">{errors.ageYears}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-email">Email</Label>
            <Input
              id="patient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional — used to send reports"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-address">Address</Label>
            <Textarea
              id="patient-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-notes">Notes</Label>
            <Textarea
              id="patient-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — anything the lab should know"
              rows={2}
            />
          </div>

          <DuplicateWarning
            candidates={candidates}
            onSelect={(candidate) => {
              if (onSelectExisting) {
                onSelectExisting(candidate.patient);
                onOpenChange(false);
              }
            }}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => submit(hasCandidates)} disabled={saving}>
            {saving
              ? "Saving..."
              : hasCandidates
              ? "Create anyway — this is someone new"
              : "Create patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PatientFormDialog;
