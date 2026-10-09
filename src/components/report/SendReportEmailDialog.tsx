import React, { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Paperclip, Eye, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { reportsApi, IRelatedReport, QueuedEmail } from "@/services/reportsApi";
import { usePdfJob, writeTabPlaceholder } from "@/hooks/usePdfJob";
import { useJobOutcome } from "@/hooks/useJobOutcome";

// Mirrors the server's check — catches typos without rejecting valid but
// unusual addresses. The server validates independently regardless.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendReportEmailDialogProps {
  reportId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the recipient when the report already has one stored. */
  defaultRecipient?: string | null;
  patientName?: string;
  /** Fired after a successful send, so the caller can refresh delivery history. */
  onSent?: () => void;
}

const SendReportEmailDialog: React.FC<SendReportEmailDialogProps> = ({
  reportId,
  open,
  onOpenChange,
  defaultRecipient,
  patientName,
  onSent,
}) => {
  const [recipient, setRecipient] = useState("");
  const [primary, setPrimary] = useState<IRelatedReport | null>(null);
  const [related, setRelated] = useState<IRelatedReport[]>([]);
  const [patientLinked, setPatientLinked] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-report id, so one row's spinner doesn't imply the others are loading
  // too — "all" is tracked separately since it drives its own button label.
  const [previewingIds, setPreviewingIds] = useState<Set<string>>(new Set());
  const [previewingAll, setPreviewingAll] = useState(false);
  const { requestPdf } = usePdfJob();
  const { waitForJob } = useJobOutcome();

  useEffect(() => {
    if (!open || !reportId) return;

    setRecipient(defaultRecipient || "");
    setError(null);
    setSelectedIds([]);
    setPrimary(null);

    // Other signed reports for this patient, offered as extra attachments.
    // Non-fatal if it fails — the primary report can still be sent.
    setLoadingRelated(true);
    reportsApi
      .getRelatedReports(reportId)
      .then((res) => {
        setRelated(res.data);
        setPatientLinked(res.patientLinked);
        setPrimary(res.primary);
      })
      .catch(() => {
        setRelated([]);
        setPatientLinked(true);
      })
      .finally(() => setLoadingRelated(false));
  }, [open, reportId, defaultRecipient]);

  const toggleRelated = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Fetches one report's PDF and shows it in the browser's own viewer — a
  // preview, so it opens inline rather than forcing a save like Download PDF
  // does. The blank tab is opened synchronously, inside the click handler's
  // call stack, and filled in once the PDF is ready; opening it only after
  // the await would read as script-initiated to most popup blockers. Since
  // the render is queued now, that wait is seconds rather than one request —
  // hence the placeholder, so the tab isn't a blank page the whole time.
  const previewOne = async (report: IRelatedReport) => {
    const tab = window.open("", "_blank");
    writeTabPlaceholder(tab);
    setPreviewingIds((prev) => new Set(prev).add(report._id));
    try {
      const { blob } = await requestPdf(report._id, [], {
        onQueued: (job) => writeTabPlaceholder(tab, job.filename),
      });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else {
        toast({
          title: "Pop-up blocked",
          description: "Allow pop-ups for this site to preview reports.",
          variant: "destructive",
        });
      }
    } catch (err) {
      tab?.close();
      toast({
        title: `Couldn't preview "${report.reportTypeName}"`,
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPreviewingIds((prev) => {
        const next = new Set(prev);
        next.delete(report._id);
        return next;
      });
    }
  };

  // Every report currently set to go out — primary always included, plus
  // whichever extras are ticked — previewed as ONE combined PDF, matching
  // exactly what POST /:id/email will attach (also one merged PDF, not N
  // separate files). A single tab, same popup-blocker-safe pattern as
  // previewOne: opened synchronously, before the await.
  const handlePreviewAll = async () => {
    if (!primary) return;
    const tab = window.open("", "_blank");
    writeTabPlaceholder(tab);
    setPreviewingAll(true);
    try {
      const { blob } = await requestPdf(primary._id, selectedIds, {
        onQueued: (job) => writeTabPlaceholder(tab, job.filename),
      });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else {
        toast({
          title: "Pop-up blocked",
          description: "Allow pop-ups for this site to preview the combined report.",
          variant: "destructive",
        });
      }
    } catch (err) {
      tab?.close();
      toast({
        title: "Couldn't preview the combined PDF",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPreviewingAll(false);
    }
  };

  const handleSend = async () => {
    if (!reportId) return;

    const trimmed = recipient.trim();
    if (!trimmed) {
      setError("Enter the recipient's email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("That doesn't look like a valid email address.");
      return;
    }

    setSending(true);
    setError(null);

    let queued: QueuedEmail;
    try {
      queued = await reportsApi.emailReport(reportId, {
        recipient: trimmed,
        includeReportIds: selectedIds,
      });
    } catch (err) {
      // Kept inline rather than as a toast so the entered recipient survives
      // and a retry doesn't start from scratch.
      setError(err instanceof Error ? err.message : "Failed to send the report email.");
      setSending(false);
      return;
    }

    // This response means *accepted for sending*, not sent — the send runs as
    // a background job. So the dialog closes now and the real outcome arrives
    // in a second toast once the job reports back.
    setSending(false);
    onOpenChange(false);
    toast({
      title: queued.deduped ? "Already sending" : "Queued for sending",
      description: queued.deduped
        ? `This report is already on its way to ${queued.recipient}.`
        : `${queued.attachments} report${queued.attachments === 1 ? "" : "s"} going to ${queued.recipient}…`,
    });

    const outcome = await waitForJob({ activityId: queued.activityId, jobId: queued.jobId });

    if (outcome.kind === "timeout") {
      // The send is most likely still running. Saying it failed would be a
      // guess, and the durable record is the honest place to look.
      toast({
        title: "Still sending",
        description: `This is taking longer than usual. The outcome is recorded against the report either way.`,
      });
      return;
    }

    if (outcome.kind === "failed") {
      toast({
        title: "Couldn't send the report",
        description: outcome.reason,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Report sent",
        description: `${queued.attachments} report${queued.attachments === 1 ? "" : "s"} sent to ${queued.recipient}.`,
      });
    }

    // Deliberately only now, not at queue time: this refreshes the report's
    // delivery history, and at queue time the delivery record doesn't exist
    // yet. Failures are recorded there too, so it runs for both outcomes.
    onSent?.();
  };

  const attachmentCount = 1 + selectedIds.length;

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send report by email</DialogTitle>
          <DialogDescription>
            {patientName
              ? `The signed report for ${patientName} will be attached as a PDF.`
              : "The signed report will be attached as a PDF."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="recipient-email">Recipient email</Label>
            <Input
              id="recipient-email"
              type="email"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                if (error) setError(null);
              }}
              placeholder="patient@example.com"
              disabled={sending}
              autoFocus
            />
            {!defaultRecipient && (
              <p className="text-xs text-muted-foreground mt-1">
                This report has no email on file. The address you enter is saved for future sends.
              </p>
            )}
          </div>

          {/* Everything that will actually be sent — the primary report
              (always included, not a checkbox) followed by optional extras
              for the same linked patient. Each row's name is the template's
              display name, never the internal reportTypeCode slug, and each
              can be previewed as the exact PDF that will be attached. */}
          {loadingRelated ? (
            <p className="text-sm text-muted-foreground">Checking for other reports…</p>
          ) : primary ? (
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Reports to send</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handlePreviewAll}
                  disabled={previewingAll || sending}
                >
                  {previewingAll ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Eye size={13} />
                  )}
                  Preview combined PDF ({attachmentCount})
                </Button>
              </div>

              <div className="space-y-2 pt-1 max-h-56 overflow-y-auto">
                {/* Primary — always sent, so it's shown locked rather than as
                    a checkbox that could misleadingly suggest it's optional. */}
                <div className="flex items-start gap-2">
                  <Checkbox checked disabled />
                  <span className="text-sm leading-tight flex-1">
                    <span className="font-medium">{primary.reportTypeName}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {primary.patientInfo?.date
                        ? new Date(primary.patientInfo.date).toLocaleDateString()
                        : "—"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => previewOne(primary)}
                    disabled={previewingIds.has(primary._id)}
                  >
                    {previewingIds.has(primary._id) ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Eye size={12} />
                    )}
                    Preview
                  </Button>
                </div>

                {related.map((r) => (
                  <div key={r._id} className="flex items-start gap-2">
                    <Checkbox
                      checked={selectedIds.includes(r._id)}
                      onCheckedChange={() => toggleRelated(r._id)}
                      disabled={sending}
                      className="mt-0.5"
                    />
                    <label className="text-sm leading-tight flex-1 cursor-pointer" onClick={() => toggleRelated(r._id)}>
                      <span className="font-medium">{r.reportTypeName}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {r.patientInfo?.date
                          ? new Date(r.patientInfo.date).toLocaleDateString()
                          : "—"}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => previewOne(r)}
                      disabled={previewingIds.has(r._id)}
                    >
                      {previewingIds.has(r._id) ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Eye size={12} />
                      )}
                      Preview
                    </Button>
                  </div>
                ))}
              </div>

              {related.length === 0 && !patientLinked && (
                <p className="text-xs text-muted-foreground pt-1">
                  This report isn't linked to a patient record, so other reports for the same
                  person can't be offered here. Link it from the report page to enable this.
                </p>
              )}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Paperclip size={13} />
            {attachmentCount === 1
              ? "1 PDF will be attached."
              : `${attachmentCount} reports will be combined into one PDF attachment.`}
          </p>

          {error && (
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-1.5">
            <Mail size={15} />
            {sending ? "Sending…" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendReportEmailDialog;
