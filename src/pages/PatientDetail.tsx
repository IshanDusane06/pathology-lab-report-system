import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { PageTransition } from "@/utils/animations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Phone, Mail, MapPin, FileText, Plus, Info, Send } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { patientsApi, IPatient } from "@/services/patientsApi";
import { reportTypesApi } from "@/services/reportTypesApi";
import { Pagination } from "@/services/api";
import { IReport } from "@/services/reportsApi";
import { canEditReportContent } from "@/lib/reportAccess";
import ReportStatusBadge from "@/components/report/ReportStatusBadge";
import EditPatientDialog from "@/components/patient/EditPatientDialog";
import SendReportEmailDialog from "@/components/report/SendReportEmailDialog";
import { formatAge } from "@/components/patient/patientDisplay";

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other" };

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [patient, setPatient] = useState<IPatient | null>(null);
  const [mergedFrom, setMergedFrom] = useState<IPatient | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const [reports, setReports] = useState<IReport[]>([]);
  const [reportsPagination, setReportsPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportTypeNames, setReportTypeNames] = useState<Record<string, string>>({});

  const loadPatient = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await patientsApi.getPatient(id);
      setPatient(res.patient);
      setMergedFrom(res.mergedFrom);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 404) setNotFound(true);
      else {
        toast({ title: "Error", description: "Failed to load this patient", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadReports = useCallback(async () => {
    if (!id) return;
    setReportsLoading(true);
    try {
      const res = await patientsApi.getPatientReports(id, { page: reportsPage, limit: 10 });
      setReports(res.data as IReport[]);
      setReportsPagination(res.pagination);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load this patient's reports", variant: "destructive" });
    } finally {
      setReportsLoading(false);
    }
  }, [id, reportsPage]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Fetched once — this is purely a code→display-name lookup, same pattern
  // Reports.tsx already uses, not something that needs to move with pagination.
  useEffect(() => {
    reportTypesApi
      .getReportTypes()
      .then((types: { code: string; name: string }[]) => {
        setReportTypeNames(Object.fromEntries(types.map((t) => [t.code, t.name])));
      })
      .catch(() => undefined);
  }, []);

  const lastVisit = reports[0]?.createdAt;
  const mostRecentSigned = reports.find((r) => r.status?.value === "signed");

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="page-container py-16 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (notFound || !patient) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="page-container py-16 text-center space-y-3">
          <p className="text-lg font-medium">Patient not found</p>
          <Button variant="outline" onClick={() => navigate("/patients")}>
            Back to patients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container space-y-6">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/patients")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to patients
          </Button>

          {mergedFrom && (
            <Card className="border-dashed">
              <CardContent className="py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  {mergedFrom.name} ({mergedFrom.patientId}) was merged into this record.
                </span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold">{patient.name}</h1>
                    <span className="text-sm font-mono text-primary">{patient.patientId}</span>
                    {!patient.isActive && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    {SEX_LABEL[patient.sex] || patient.sex} · {formatAge(patient)}
                    {lastVisit &&
                      ` · Last visit ${new Date(lastVisit).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {patient.phone || "No phone on file"}
                    </span>
                    {patient.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {patient.email}
                      </span>
                    )}
                    {patient.address && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {patient.address}
                      </span>
                    )}
                  </div>
                  {patient.notes && (
                    <p className="text-sm text-muted-foreground pt-1 max-w-2xl">{patient.notes}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                  {mostRecentSigned && (
                    <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
                      <Send className="h-4 w-4 mr-1.5" />
                      Send reports
                    </Button>
                  )}
                  <Button size="sm" onClick={() => navigate("/report/create", { state: { patient } })}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    New report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Report history
              </CardTitle>
              <CardDescription>
                {reportsPagination.total} report{reportsPagination.total === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsLoading && !reports.length ? (
                <div className="py-10 flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : reports.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No reports yet for this patient.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-3 text-muted-foreground font-medium text-sm">Report type</th>
                          <th className="pb-3 text-muted-foreground font-medium text-sm">Date</th>
                          <th className="pb-3 text-muted-foreground font-medium text-sm">Status</th>
                          <th className="pb-3 text-muted-foreground font-medium text-sm" />
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => {
                          const canEdit = canEditReportContent(r, user?.id, user?.role);
                          const label = canEdit
                            ? r.status?.value === "pendingApproval"
                              ? "Review"
                              : "Edit"
                            : "View";
                          return (
                            <tr
                              key={r._id}
                              className="border-t border-border cursor-pointer hover:bg-muted/40"
                              onClick={() => navigate(`/report/${r._id}`)}
                            >
                              <td className="py-3 font-medium">
                                {reportTypeNames[r.reportTypeCode] || r.reportTypeCode}
                              </td>
                              <td className="py-3 text-sm text-muted-foreground">
                                {new Date(r.createdAt || "").toLocaleDateString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="py-3">
                                {r.status?.value && <ReportStatusBadge status={r.status.value} />}
                              </td>
                              <td className="py-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/report/${r._id}`);
                                  }}
                                >
                                  {label}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {reportsPagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {reportsPagination.page} of {reportsPagination.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reportsPage <= 1}
                          onClick={() => setReportsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reportsPage >= reportsPagination.totalPages}
                          onClick={() => setReportsPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PageTransition>

      <EditPatientDialog
        patient={patient}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={setPatient}
      />

      {mostRecentSigned && (
        <SendReportEmailDialog
          reportId={mostRecentSigned._id || null}
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultRecipient={patient.email}
          patientName={patient.name}
          onSent={loadReports}
        />
      )}
    </div>
  );
};

export default PatientDetail;
