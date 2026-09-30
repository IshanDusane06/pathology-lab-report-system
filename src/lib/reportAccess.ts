import { IReport, IPersonRef } from "@/services/reportsApi";

export function asPerson(p: IPersonRef | string | undefined | null): IPersonRef | null {
  if (!p || typeof p === "string") return null;
  return p;
}

// Mirrors the backend's ownership invariant (api/middleware/reportAccess.js):
// exactly one party may edit a report's content per status — the owning
// technician for draft/changesRequested, any Doctor for pendingApproval.
export function canEditReportContent(report: IReport, userId?: string, userRole?: string): boolean {
  const status = report.status?.value;
  if (status === "draft" || status === "changesRequested") {
    const tech = asPerson(report.technician);
    return !!tech?.userId && !!userId && String(tech.userId) === String(userId);
  }
  if (status === "pendingApproval") {
    return userRole === "Doctor";
  }
  return false;
}

// Mirrors the backend's delete rule (api/middleware/reportAccess.js's
// canDeleteReport) — for button visibility only, the server is the real
// enforcement. Admin: any status. Doctor: any status except signed.
// Technician: their own draft or changesRequested only.
export function canDeleteReport(report: IReport, userId?: string, userRole?: string): boolean {
  const status = report.status?.value;
  if (userRole === "Admin") return true;
  if (userRole === "Doctor") return status !== "signed";
  if (userRole === "Technician") {
    const tech = asPerson(report.technician);
    return (
      !!tech?.userId &&
      !!userId &&
      String(tech.userId) === String(userId) &&
      (status === "draft" || status === "changesRequested")
    );
  }
  return false;
}
