import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { PageTransition } from "@/utils/animations";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, Mail, Pencil, Printer, Save, Send, Trash2 } from "lucide-react";
import { reportsApi, IReport, IParameter, IDatedReading, IBreakdownEntry } from "@/services/reportsApi";
import { reportTypesApi, ReportType } from "@/services/reportTypesApi";
import { labSettingsApi, LabSettings } from "@/services/labSettingsApi";
import PatientInfoCard from "@/components/report/PatientInfoCard";
import ReportSectionCard from "@/components/report/ReportSectionCard";
import ReportReadOnlyView from "@/components/report/ReportReadOnlyView";
import RemarksEditor from "@/components/report/RemarksEditor";
import { stripHtmlForPlaceholder } from "@/lib/remarksHtml";
import ReportStatusBadge, { ReportStatusValue } from "@/components/report/ReportStatusBadge";
import { PatientInfo } from "@/components/ReportForm";
import { groupParametersBySection } from "@/lib/reportSections";
import { FieldFormat } from "@/components/report/ReportFieldInput";
import { canEditReportContent, canDeleteReport } from "@/lib/reportAccess";
import SendReportEmailDialog from "@/components/report/SendReportEmailDialog";
import { usePdfJob, saveBlobAs } from "@/hooks/usePdfJob";
import LinkPatientDialog from "@/components/patient/LinkPatientDialog";
import { Link2 } from "lucide-react";

type ActionKey = "sign" | "finalize" | "reject" | "requestChanges" | "unsign";

const ACTION_CONFIG: Record<
  ActionKey,
  { title: string; description: string; requiresRemarks: boolean; confirmLabel: string; destructive?: boolean }
> = {
  sign: {
    title: "Sign this report?",
    description: "This locks the report's values and records your digital signature.",
    requiresRemarks: false,
    confirmLabel: "Sign Report",
  },
  finalize: {
    title: "Sign this report?",
    description:
      "This locks the report's values and records your digital signature — no approval queue needed since it's your own report.",
    requiresRemarks: false,
    confirmLabel: "Sign Report",
  },
  reject: {
    title: "Reject this report?",
    description:
      "The report will be marked rejected. This is terminal — a new report will need to be created if it should be redone.",
    requiresRemarks: true,
    confirmLabel: "Reject Report",
    destructive: true,
  },
  requestChanges: {
    title: "Request changes?",
    description: "The report will be sent back to the technician for corrections.",
    requiresRemarks: true,
    confirmLabel: "Request Changes",
  },
  unsign: {
    title: "Edit this report?",
    description:
      "This report is signed. To make changes, it will return to Pending Approval and the current signature will be invalidated — you'll sign again once you're done editing.",
    requiresRemarks: true,
    confirmLabel: "Continue to Edit",
    destructive: false,
  },
};

const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [report, setReport] = useState<IReport | null>(null);
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [labSettings, setLabSettings] = useState<LabSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: "unauthorized" | "notFound" | "other"; message: string } | null>(
    null
  );

  const [formValues, setFormValues] = useState<
    Record<string, string | number | boolean | IDatedReading[] | IBreakdownEntry[]>
  >({});
  const [formFormats, setFormFormats] = useState<Record<string, FieldFormat>>({});
  const [reportRemarks, setReportRemarks] = useState("");
  // Only used when the report's type has sectionWiseRemarks enabled —
  // mutually exclusive with reportRemarks above; keyed by section key.
  const [sectionRemarksState, setSectionRemarksState] = useState<Record<string, string>>({});
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: "",
    referredBy: "",
    sex: "",
    age: "",
    date: "",
    reportType: "",
  });

  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [actionRemarks, setActionRemarks] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [linkPatientOpen, setLinkPatientOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Top-level Report field, deliberately not part of patientInfo state.
  const [patientEmail, setPatientEmail] = useState<string>("");
  const { requestPdf } = usePdfJob();

  // The PDF is rendered server-side as a background job, so this waits for
  // the render to finish and then downloads it — hence the loading state on
  // the button. The filename comes from the server rather than being
  // re-derived here, so it matches what an emailed copy is called.
  const handleDownloadPdf = async () => {
    if (!id) return;
    setDownloadingPdf(true);
    try {
      const { blob, filename } = await requestPdf(id);
      saveBlobAs(blob, filename);
    } catch (error) {
      toast({
        title: "Couldn't generate the PDF",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const loadReport = useCallback(async () => {
    if (!id) return;
    try {
      const fetchedReport: IReport = await reportsApi.getReportById(id);
      setReport(fetchedReport);
      setLoadError(null);

      const fetchedType: ReportType = await reportTypesApi.getReportType(fetchedReport.reportTypeId);
      setReportType(fetchedType);

      labSettingsApi
        .getLabSettings()
        .then(setLabSettings)
        .catch((err) => console.error("Error fetching lab settings:", err));

      const values: Record<string, string | number | boolean | IDatedReading[] | IBreakdownEntry[]> = {};
      const formats: Record<string, FieldFormat> = {};
      (fetchedReport.parameters || []).forEach((p) => {
        values[p.name] = (p.value ?? "") as string | number | boolean | IDatedReading[] | IBreakdownEntry[];
        formats[p.name] = { bold: !!p.bold, italic: !!p.italic, underline: !!p.underline };
      });
      setFormValues(values);
      setFormFormats(formats);
      setReportRemarks(fetchedReport.remarks || "");
      const sectionRemarksMap: Record<string, string> = {};
      (fetchedReport.sectionRemarks || []).forEach((sr) => {
        sectionRemarksMap[sr.sectionKey] = sr.remarks;
      });
      setSectionRemarksState(sectionRemarksMap);

      setPatientEmail(fetchedReport.patientEmail || "");

      setPatientInfo({
        name: fetchedReport.patientInfo?.name || "",
        referredBy: fetchedReport.patientInfo?.referredBy || "",
        sex: fetchedReport.patientInfo?.sex || "",
        age: fetchedReport.patientInfo?.age != null ? String(fetchedReport.patientInfo.age) : "",
        date: fetchedReport.patientInfo?.date ? fetchedReport.patientInfo.date.split("T")[0] : "",
        reportType: fetchedReport.reportTypeCode,
      });
    } catch (error) {
      console.error("Error loading report:", error);
      const status = (error as Error & { status?: number })?.status;
      if (status === 401 || status === 403) {
        setLoadError({ kind: "unauthorized", message: "Your session has expired. Please log in again." });
      } else if (status === 404) {
        setLoadError({ kind: "notFound", message: "This report doesn't exist." });
      } else {
        setLoadError({
          kind: "other",
          message: error instanceof Error ? error.message : "Something went wrong while loading this report.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const groupedSections = groupParametersBySection(reportType?.parameters, reportType?.sections);

  const canEdit = report ? canEditReportContent(report, user?.id, user?.role) : false;

  const buildParametersPayload = useCallback((): IParameter[] => {
    return (reportType?.parameters || []).map((p) => {
      const format = formFormats[p.name];
      return {
        name: p.name,
        value: formValues[p.name] ?? "",
        unit: p.unit,
        section: p.section,
        notes: "",
        bold: !!format?.bold,
        italic: !!format?.italic,
        underline: !!format?.underline,
      };
    });
  }, [reportType, formValues, formFormats]);

  const handleChange = useCallback(
    (paramName: string, value: string | number | boolean | IDatedReading[] | IBreakdownEntry[]) => {
      setFormValues((prev) => ({ ...prev, [paramName]: value }));
    },
    []
  );

  const handleFormatChange = useCallback((paramName: string, format: FieldFormat) => {
    setFormFormats((prev) => ({ ...prev, [paramName]: format }));
  }, []);

  const handleSectionRemarksChange = useCallback((sectionKey: string, html: string) => {
    setSectionRemarksState((prev) => ({ ...prev, [sectionKey]: html }));
  }, []);

  // Shared by every update call below — sends sectionRemarks (section-wise
  // mode) or remarks (default mode), matching whichever the template uses.
  const buildRemarksPayload = useCallback(() => {
    if (reportType?.sectionWiseRemarks) {
      return {
        sectionRemarks: Object.entries(sectionRemarksState)
          .filter(([, html]) => !!html)
          .map(([sectionKey, remarks]) => ({ sectionKey, remarks })),
      };
    }
    return { remarks: reportRemarks };
  }, [reportType, sectionRemarksState, reportRemarks]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await reportsApi.updateReport(id, {
        parameters: buildParametersPayload(),
        patientInfo: {
          ...patientInfo,
          age: Number(patientInfo.age),
        },
        patientEmail: patientEmail.trim() || null,
        ...buildRemarksPayload(),
      });
      toast({ title: "Saved", description: "Report changes saved." });
      await loadReport();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save report",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await reportsApi.updateReport(id, {
        parameters: buildParametersPayload(),
        patientInfo: { ...patientInfo, age: Number(patientInfo.age) },
        patientEmail: patientEmail.trim() || null,
        ...buildRemarksPayload(),
      });
      await reportsApi.submitReport(id);
      toast({ title: "Submitted", description: "Report submitted for doctor approval." });
      await loadReport();
    } catch (error) {
      toast({
        title: "Submit failed",
        description: error instanceof Error ? error.message : "Failed to submit report",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const runPendingAction = async () => {
    if (!pendingAction || !id) return;
    const config = ACTION_CONFIG[pendingAction];
    if (config.requiresRemarks && !actionRemarks.trim()) return;

    setActionSubmitting(true);
    try {
      if (canEdit) {
        await reportsApi.updateReport(id, {
          parameters: buildParametersPayload(),
          patientInfo: { ...patientInfo, age: Number(patientInfo.age) },
          patientEmail: patientEmail.trim() || null,
          ...buildRemarksPayload(),
        });
      }
      if (pendingAction === "sign") await reportsApi.signReport(id);
      if (pendingAction === "finalize") await reportsApi.finalizeReport(id);
      if (pendingAction === "reject") await reportsApi.rejectReport(id, actionRemarks);
      if (pendingAction === "requestChanges") await reportsApi.requestChanges(id, actionRemarks);
      if (pendingAction === "unsign") await reportsApi.unsignReport(id, actionRemarks);

      toast({ title: "Success", description: `${config.confirmLabel} completed.` });
      setPendingAction(null);
      setActionRemarks("");
      await loadReport();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await reportsApi.deleteReport(id);
      toast({ title: "Deleted", description: "Report deleted." });
      navigate("/reports");
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete report",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="page-container text-center text-muted-foreground py-20">Loading report...</div>
      </div>
    );
  }

  if (loadError || !report) {
    const isUnauthorized = loadError?.kind === "unauthorized";
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="page-container text-center py-20">
          <p className="text-lg font-medium">
            {loadError?.kind === "notFound" ? "Report not found" : loadError?.message || "Report not found"}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate(isUnauthorized ? "/login" : "/reports")}
          >
            {isUnauthorized ? "Log In" : "Back to Reports"}
          </Button>
        </div>
      </div>
    );
  }

  const status = report.status?.value as ReportStatusValue;
  // deliveries[] is append-only, so the most recent entry is the last one.
  const lastDelivery = report.deliveries?.length
    ? report.deliveries[report.deliveries.length - 1]
    : null;
  const isDoctor = user?.role === "Doctor";
  const showDelete = canDeleteReport(report, user?.id, user?.role);

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print">
        <Navbar />
      </div>
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6 no-print">
            <div>
              <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
                <ArrowLeft size={16} className="mr-1.5" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{report.patientInfo?.name}</h1>
                <ReportStatusBadge status={status} />
              </div>
              <p className="text-muted-foreground mt-1">{reportType?.name || report.reportTypeCode}</p>
              {lastDelivery && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Mail size={12} />
                  {lastDelivery.status === "sent" ? (
                    <>
                      Emailed to {lastDelivery.recipient}
                      {lastDelivery.sentAt && ` on ${new Date(lastDelivery.sentAt).toLocaleString()}`}
                    </>
                  ) : (
                    <span className="text-destructive">
                      Last email to {lastDelivery.recipient} failed
                      {lastDelivery.sentAt && ` on ${new Date(lastDelivery.sentAt).toLocaleString()}`}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Print (and any future email/WhatsApp share buttons) must stay gated on
                  status === "signed" — an unsigned report has no doctor sign-off yet and
                  shouldn't be printable or shareable, regardless of who's viewing it. */}
              {status === "signed" && (
                <>
                  <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
                    <Printer size={16} />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="gap-1.5"
                  >
                    <Download size={16} />
                    {downloadingPdf ? "Preparing…" : "Download PDF"}
                  </Button>
                  <Button variant="outline" onClick={() => setEmailDialogOpen(true)} className="gap-1.5">
                    <Mail size={16} />
                    Send via Email
                  </Button>
                </>
              )}
              {!canEdit && isDoctor && status === "signed" && (
                <>
                  <Button variant="outline" onClick={() => setPendingAction("requestChanges")}>
                    Request Changes
                  </Button>
                  <Button variant="outline" onClick={() => setPendingAction("unsign")} className="gap-1.5">
                    <Pencil size={16} />
                    Edit Report
                  </Button>
                </>
              )}
              {canEdit && (
                <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
                  <Save size={16} />
                  Save
                </Button>
              )}
              {canEdit && !isDoctor && (
                <Button onClick={handleSubmitForApproval} disabled={saving} className="gap-1.5">
                  <Send size={16} />
                  Submit for Approval
                </Button>
              )}
              {/* A Doctor reviewing a report submitted by someone else — the
                  only state `sign`/`reject`/`requestChanges` are valid from. */}
              {canEdit && isDoctor && status === "pendingApproval" && (
                <>
                  <Button variant="outline" onClick={() => setPendingAction("requestChanges")}>
                    Request Changes
                  </Button>
                  <Button variant="destructive" onClick={() => setPendingAction("reject")}>
                    Reject
                  </Button>
                  <Button onClick={() => setPendingAction("sign")} className="gap-1.5">
                    <Send size={16} />
                    Sign
                  </Button>
                </>
              )}
              {/* A Doctor on their own still-unsubmitted report — signs
                  directly, skipping the approval queue entirely. */}
              {canEdit && isDoctor && (status === "draft" || status === "changesRequested") && (
                <Button onClick={() => setPendingAction("finalize")} className="gap-1.5">
                  <Send size={16} />
                  Sign
                </Button>
              )}
              {showDelete && (
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {!report.patientId && (
            <Card className="mb-6 no-print border-dashed">
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="text-sm">
                  <p className="font-medium">Not linked to a patient record</p>
                  <p className="text-muted-foreground">
                    This report was created before patient records existed. Link it so it appears in
                    the patient&rsquo;s history and can be sent alongside their other reports.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setLinkPatientOpen(true)}
                >
                  <Link2 size={16} className="mr-1.5" />
                  Link to patient
                </Button>
              </CardContent>
            </Card>
          )}

          {!canEdit && status === "pendingApproval" && (
            <Card className="mb-6 no-print">
              <CardContent className="py-4 text-sm text-muted-foreground">
                Awaiting doctor review — you can't edit this report until it's returned to you.
              </CardContent>
            </Card>
          )}

          {status === "changesRequested" && report.status?.remarks && (
            <Card className="mb-6 no-print border-orange-200 bg-orange-50">
              <CardContent className="py-4">
                <p className="text-sm font-medium text-orange-800 mb-1">Doctor requested changes</p>
                <p className="text-sm text-orange-700 whitespace-pre-wrap">{report.status.remarks}</p>
              </CardContent>
            </Card>
          )}

          {canEdit ? (
            <div className="space-y-6">
              <PatientInfoCard
                patientInfo={patientInfo}
                setPatientInfo={setPatientInfo}
                onSelectReportType={() => undefined}
                editMode={false}
                lockReportType
                reportType={patientInfo.reportType}
                patient=""
                setPatient={() => undefined}
                reportTypes={reportType ? [reportType] : []}
                patientEmail={patientEmail}
                onPatientEmailChange={setPatientEmail}
              />

              {groupedSections.map((section) => (
                <React.Fragment key={section.key}>
                  <ReportSectionCard
                    key={section.key}
                    sectionKey={section.title}
                    parameters={section.parameters}
                    expanded
                    onToggle={() => undefined}
                    formValues={formValues}
                    onChange={handleChange}
                    errors={{}}
                    patientInfo={patientInfo}
                    formFormats={formFormats}
                    onFormatChange={handleFormatChange}
                  />
                  {reportType?.sectionWiseRemarks && section.remarksEnabled && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{section.title} — Remarks</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <RemarksEditor
                          value={sectionRemarksState[section.key] || ""}
                          onChange={(html) => handleSectionRemarksChange(section.key, html)}
                          placeholder={
                            stripHtmlForPlaceholder(section.defaultRemarks) ||
                            "Optional — leave blank to use the template's default remarks for this section, if any."
                          }
                        />
                      </CardContent>
                    </Card>
                  )}
                </React.Fragment>
              ))}

              {!reportType?.sectionWiseRemarks && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Remarks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RemarksEditor
                      value={reportRemarks}
                      onChange={setReportRemarks}
                      placeholder={
                        stripHtmlForPlaceholder(reportType?.defaultRemarks) ||
                        "Optional — leave blank to use the template's default remarks, if any."
                      }
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <ReportReadOnlyView report={report} reportType={reportType} labSettings={labSettings} />
          )}
        </div>
      </PageTransition>

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          {pendingAction && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{ACTION_CONFIG[pendingAction].title}</AlertDialogTitle>
                <AlertDialogDescription>{ACTION_CONFIG[pendingAction].description}</AlertDialogDescription>
              </AlertDialogHeader>
              {ACTION_CONFIG[pendingAction].requiresRemarks && (
                <Textarea
                  placeholder="Add a reason (required)..."
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  className="resize-none"
                />
              )}
              <AlertDialogFooter>
                <Button variant="outline" onClick={() => setPendingAction(null)} disabled={actionSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant={ACTION_CONFIG[pendingAction].destructive ? "destructive" : "default"}
                  onClick={runPendingAction}
                  disabled={
                    actionSubmitting ||
                    (ACTION_CONFIG[pendingAction].requiresRemarks && !actionRemarks.trim())
                  }
                >
                  {actionSubmitting ? "Working..." : ACTION_CONFIG[pendingAction].confirmLabel}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the report and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Report"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkPatientDialog
        reportId={id!}
        open={linkPatientOpen}
        onOpenChange={setLinkPatientOpen}
        onLinked={loadReport}
        recordedName={report.patientInfo?.name}
      />

      <SendReportEmailDialog
        reportId={id || null}
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        defaultRecipient={report.patientEmail}
        patientName={report.patientInfo?.name}
        onSent={loadReport}
      />
    </div>
  );
};

export default ReportDetail;
