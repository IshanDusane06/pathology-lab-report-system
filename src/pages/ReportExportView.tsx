import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReportReadOnlyView from "@/components/report/ReportReadOnlyView";
import { reportsApi, IReport } from "@/services/reportsApi";
import { reportTypesApi, ReportType } from "@/services/reportTypesApi";
import { labSettingsApi, LabSettings } from "@/services/labSettingsApi";

/**
 * Bare render target for the server-side PDF exporter — no Navbar, no action
 * bar, no cards, just the report itself.
 *
 * That emptiness is the point. `.no-print` covers two different intents in
 * this app: page chrome we never want in a PDF (navbar, buttons) and content
 * that's hidden only because the lab prints onto pre-printed letterhead paper
 * (the letterhead header and signature blocks). An emailed PDF needs the
 * second group. Because this route never renders the first group at all, the
 * exporter can simply emulate `screen` media — keeping letterhead and
 * signatures visible — without dragging any chrome along, and without a
 * single change to ReportReadOnlyView or the print CSS.
 *
 * Puppeteer waits on data-report-ready="true" before calling page.pdf().
 */
const ReportExportView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<IReport | null>(null);
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [labSettings, setLabSettings] = useState<LabSettings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!id) return;
      try {
        const fetchedReport: IReport = await reportsApi.getReportById(id);
        const [fetchedType, fetchedSettings] = await Promise.all([
          reportTypesApi.getReportType(fetchedReport.reportTypeId),
          // Non-fatal: a missing letterhead shouldn't block the whole export.
          labSettingsApi.getLabSettings().catch(() => null),
        ]);
        if (cancelled) return;
        setReport(fetchedReport);
        setReportType(fetchedType);
        setLabSettings(fetchedSettings);
      } catch (error) {
        console.error("Error loading report for export:", error);
        if (!cancelled) setFailed(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) {
    // Never sets data-report-ready, so the exporter times out with a clear
    // failure rather than silently producing a blank PDF.
    return <div style={{ padding: 24 }}>Unable to load this report.</div>;
  }

  if (!report) return null;

  return (
    <div data-report-ready="true" className="p-6">
      <ReportReadOnlyView report={report} reportType={reportType} labSettings={labSettings} />
    </div>
  );
};

export default ReportExportView;
