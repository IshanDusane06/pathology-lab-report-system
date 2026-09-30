import { IPatient } from "@/services/patientsApi";

/**
 * How a patient's age reads in the UI. A DOB-derived age is just a number; a
 * recorded one is qualified with when it was taken, so a stale age is visibly
 * stale rather than quietly wrong.
 */
export function formatAge(patient: Pick<IPatient, "age" | "ageSource" | "ageRecordedAt">): string {
  if (patient.age == null) return "age unknown";
  if (patient.ageSource === "recorded" && patient.ageRecordedAt) {
    const when = new Date(patient.ageRecordedAt).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
    return `${patient.age}y (as of ${when})`;
  }
  return `${patient.age}y`;
}

const SEX_LABEL: Record<string, string> = { male: "M", female: "F", other: "—" };

/**
 * One line with enough to tell two same-named people apart. Name alone is
 * never sufficient — that is the entire problem this module exists to fix.
 */
export function formatPatientLine(patient: IPatient): string {
  return [
    patient.patientId,
    patient.name,
    SEX_LABEL[patient.sex] || patient.sex,
    formatAge(patient),
    patient.phone || "no phone",
  ].join(" · ");
}

export function formatLastVisit(lastVisit?: string | null): string {
  if (!lastVisit) return "no reports yet";
  return `last visit ${new Date(lastVisit).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}
