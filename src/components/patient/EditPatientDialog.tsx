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
import { patientsApi, IPatient } from "@/services/patientsApi";
import {
  isValidCalendarDate,
  isValidPhone,
  isValidEmail,
  combineDateParts,
  splitIsoDate,
} from "@/lib/patientValidation";

interface EditPatientDialogProps {
  patient: IPatient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (patient: IPatient) => void;
}

/**
 * Corrections to an existing patient record. Unlike creation, this has no
 * duplicate check — the record already exists, so the question isn't "is this
 * someone new" but "what changed about this person." Note that editing here
 * never touches any report's own patientInfo snapshot; a signed report keeps
 * rendering exactly what it was signed against regardless of what changes here.
 */
const EditPatientDialog = ({ patient, open, onOpenChange, onSaved }: EditPatientDialogProps) => {
  const [name, setName] = useState(patient.name);
  const [phone, setPhone] = useState(patient.phone || "");
  const [email, setEmail] = useState(patient.email || "");
  const [sex, setSex] = useState<"male" | "female" | "other">(patient.sex);
  const [ageMode, setAgeMode] = useState<"dob" | "age">(patient.dob ? "dob" : "age");
  const initialDobParts = splitIsoDate(patient.dob);
  const [dobDay, setDobDay] = useState(initialDobParts.day);
  const [dobMonth, setDobMonth] = useState(initialDobParts.month);
  const [dobYear, setDobYear] = useState(initialDobParts.year);
  const [ageYears, setAgeYears] = useState(patient.ageYears != null ? String(patient.ageYears) : "");
  const [address, setAddress] = useState(patient.address || "");
  const [notes, setNotes] = useState(patient.notes || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dobMonthRef = useRef<HTMLInputElement>(null);
  const dobYearRef = useRef<HTMLInputElement>(null);

  // "" unless day, month AND a full 4-digit year are all present — a
  // still-in-progress entry never looks like a real date.
  const dob = combineDateParts(dobDay, dobMonth, dobYear);
  const dobStarted = !!(dobDay || dobMonth || dobYear);

  useEffect(() => {
    if (!open) return;
    setName(patient.name);
    setPhone(patient.phone || "");
    setEmail(patient.email || "");
    setSex(patient.sex);
    setAgeMode(patient.dob ? "dob" : "age");
    const parts = splitIsoDate(patient.dob);
    setDobDay(parts.day);
    setDobMonth(parts.month);
    setDobYear(parts.year);
    setAgeYears(patient.ageYears != null ? String(patient.ageYears) : "");
    setAddress(patient.address || "");
    setNotes(patient.notes || "");
    setErrors({});
  }, [open, patient]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Patient name is required";
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

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const updated = await patientsApi.updatePatient(patient._id, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        sex,
        dob: ageMode === "dob" ? dob || null : null,
        ageYears: ageMode === "age" && ageYears ? Number(ageYears) : null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      toast({ title: "Patient updated", description: `${updated.name} — ${updated.patientId}` });
      onSaved(updated);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Couldn't save changes",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {patient.name}</DialogTitle>
          <DialogDescription>
            {patient.patientId} — changes here never affect the wording of any report already signed
            for this patient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-patient-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-patient-name" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-patient-sex">Sex</Label>
              <Select value={sex} onValueChange={(v) => setSex(v as typeof sex)}>
                <SelectTrigger id="edit-patient-sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-patient-phone">Mobile number</Label>
              <Input
                id="edit-patient-phone"
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
            ) : (
              <Input
                type="number"
                min={0}
                max={150}
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
              />
            )}
            {errors.dob && <p className="text-xs text-destructive">{errors.dob}</p>}
            {errors.ageYears && <p className="text-xs text-destructive">{errors.ageYears}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-patient-email">Email</Label>
            <Input
              id="edit-patient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-patient-address">Address</Label>
            <Textarea
              id="edit-patient-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-patient-notes">Notes</Label>
            <Textarea
              id="edit-patient-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPatientDialog;
