import { useCallback } from 'react';
import { useJobOutcome } from '@/hooks/useJobOutcome';
import { reportsApi } from '@/services/reportsApi';

// The whole "get me a PDF" sequence in one place: queue a render, wait for it,
// fetch the bytes. All four download/preview buttons differ only in how they
// present the result, so only the presentation lives at the call sites.

export interface PdfResult {
  blob: Blob;
  filename: string;
}

export interface RequestPdfOptions {
  // Fires as soon as the render is accepted, which is when the filename
  // becomes known — before any bytes exist. Lets a caller label its waiting
  // state with the real filename.
  onQueued?: (job: { filename: string; deduped: boolean }) => void;
}

export function usePdfJob() {
  const { waitForJob } = useJobOutcome();

  const requestPdf = useCallback(
    async (
      reportId: string,
      includeReportIds: string[] = [],
      { onQueued }: RequestPdfOptions = {}
    ): Promise<PdfResult> => {
      const run = async (): Promise<PdfResult> => {
        const job = await reportsApi.createPdfJob(reportId, includeReportIds);
        onQueued?.({ filename: job.filename, deduped: job.deduped });

        const outcome = await waitForJob({
          activityId: job.activityId,
          jobId: job.jobId,
          pollState: true,
        });

        if (outcome.kind === 'timeout') {
          throw new Error(
            'The PDF is taking longer than expected — it may still finish. Check Activity in a moment.'
          );
        }
        if (outcome.kind === 'failed') {
          throw new Error(outcome.reason);
        }

        const blob = await reportsApi.getPdfJobResult(job.jobId);
        return { blob, filename: outcome.data.filename || job.filename };
      };

      try {
        return await run();
      } catch (error) {
        // The rendered blob is single-use and the jobId is a content hash, so
        // two clicks on the same report share ONE job and ONE blob: both
        // waits succeed, the first fetch consumes it, and the second gets a
        // 410. That is a race, not a failure — render a fresh copy once.
        // A second 410 is a real problem and propagates.
        if ((error as Error & { status?: number }).status === 410) {
          return await run();
        }
        throw error;
      }
    },
    [waitForJob]
  );

  return { requestPdf };
}

// Hands the blob to the browser as a download. Shared by the two Download
// buttons; the preview buttons show it in a tab instead.
export function saveBlobAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// A pre-opened tab has to be opened synchronously inside the click handler or
// popup blockers eat it — but the render now takes seconds, so the tab would
// sit on about:blank looking broken. This gives it something honest to show
// until the bytes arrive.
export function writeTabPlaceholder(tab: Window | null, filename?: string) {
  if (!tab) return;
  try {
    tab.document.write(
      `<!doctype html><html><head><title>Preparing PDF…</title><meta name="color-scheme" content="light dark"></head>` +
      `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;` +
      `font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#64748b">` +
      `<p>Preparing ${escapeHtml(filename || 'your PDF')}…</p></body></html>`
    );
    tab.document.close();
  } catch (error) {
    // Cross-origin or a tab the user closed mid-render — nothing to show.
    console.error('Error writing the preview placeholder:', error);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string)
  );
}
