import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Minus } from "lucide-react";

const ROLE_CARDS = [
  {
    role: "Technician",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    description:
      "Creates reports, enters patient info and test values, submits for approval, and revises anything a doctor sends back.",
    ownership: (
      <>
        Owns the report while status is <strong>draft</strong> or <strong>changes requested</strong>
      </>
    ),
  },
  {
    role: "Doctor",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
    description:
      "Reviews submitted reports, adjusts values, signs to finalise, requests changes with a comment, rejects, or un-signs a correction.",
    ownership: (
      <>
        Owns the report while status is <strong>pending approval</strong>
      </>
    ),
  },
  {
    role: "Admin",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    description:
      "Manages users, role assignment, report templates and lab settings. Never edits report content or signs.",
    ownership: "No ownership of report content at any status",
  },
];

type Cell = "yes" | "owner" | "no";

interface Capability {
  name: string;
  description: string;
  technician: Cell;
  doctor: Cell;
  admin: Cell;
}

// Fixed permission model — matches the server-side enforcement in
// api/middleware/reportAccess.js and api/middleware/auth.js. Template
// editing and audit-trail access stay Admin-only by design, not the
// design mockup's Doctor checkmarks.
const CAPABILITIES: Capability[] = [
  { name: "Create report", description: "Start a draft for a patient", technician: "yes", doctor: "yes", admin: "no" },
  { name: "Edit draft content", description: "Only while the report is theirs to own", technician: "owner", doctor: "no", admin: "no" },
  { name: "Submit for approval", description: "Moves draft to pending approval", technician: "yes", doctor: "yes", admin: "no" },
  { name: "Sign report", description: "Doctors only — recorded with HMAC signature", technician: "no", doctor: "yes", admin: "no" },
  { name: "Request changes / reject", description: "Comment required on bounce-back", technician: "no", doctor: "yes", admin: "no" },
  { name: "Un-sign a signed report", description: "Reopens a finalised report for correction", technician: "no", doctor: "yes", admin: "no" },
  { name: "Print / export signed report", description: "Gated to signed status", technician: "yes", doctor: "yes", admin: "yes" },
  { name: "Manage users & roles", description: "Invite, suspend, reassign roles", technician: "no", doctor: "no", admin: "yes" },
  { name: "Manage report templates", description: "Parameters, units, normal ranges", technician: "no", doctor: "no", admin: "yes" },
  { name: "View audit trail", description: "All signature and access events", technician: "no", doctor: "no", admin: "yes" },
];

const CellIcon: React.FC<{ value: Cell }> = ({ value }) => {
  if (value === "no") {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground">
        <Minus size={14} />
      </span>
    );
  }
  const cls =
    value === "owner"
      ? "border-blue-300 bg-blue-50 text-blue-700"
      : "border-green-300 bg-green-50 text-green-700";
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${cls}`}>
      <Check size={14} />
    </span>
  );
};

const AdminRolesTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ROLE_CARDS.map((card) => (
          <Card key={card.role}>
            <CardContent className="pt-6 space-y-3">
              <Badge variant="outline" className={`${card.badgeClass} uppercase text-xs tracking-wide`}>
                {card.role}
              </Badge>
              <p className="text-sm">{card.description}</p>
              <p className="text-xs text-muted-foreground">{card.ownership}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission matrix</CardTitle>
          <CardDescription>Signing and ownership rules are enforced server-side and can't be granted away</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="pb-3 text-muted-foreground font-medium text-sm">Capability</th>
                  <th className="pb-3 text-muted-foreground font-medium text-sm text-center">Technician</th>
                  <th className="pb-3 text-muted-foreground font-medium text-sm text-center">Doctor</th>
                  <th className="pb-3 text-muted-foreground font-medium text-sm text-center">Admin</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((cap) => (
                  <tr key={cap.name} className="border-t border-border">
                    <td className="py-3">
                      <p className="font-medium text-sm">{cap.name}</p>
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    </td>
                    <td className="py-3 text-center">
                      <CellIcon value={cap.technician} />
                    </td>
                    <td className="py-3 text-center">
                      <CellIcon value={cap.doctor} />
                    </td>
                    <td className="py-3 text-center">
                      <CellIcon value={cap.admin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRolesTab;
