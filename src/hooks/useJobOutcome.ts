import { useCallback } from 'react';
import { useJobEvents, JobEvent, JobEventData } from '@/context/JobEventsContext';
import { reportsApi } from '@/services/reportsApi';

// Waits for a background job to reach a terminal outcome.
//
// Primary signal is the live SSE event. For PDF jobs a state endpoint also
// exists, so those can additionally poll — which is what keeps a download
// working when the push never arrives (pub/sub down, a proxy buffering the
// stream, an event lost to a reconnect). Emails and sweeps have no such
// endpoint and are SSE-only; they fall back to the timeout.

export type JobOutcome =
  | { kind: 'completed'; data: JobEventData }
  | { kind: 'failed'; reason: string }
  // Neither signal arrived in time. Distinct from 'failed' on purpose: the
  // job is most likely still running, and the durable Activity record is the
  // place to find out — telling the user it failed would be a guess.
  | { kind: 'timeout' };

export interface WaitForJobOptions {
  activityId?: string | null;
  jobId: string;
  // Poll GET /reports/pdf-jobs/:jobId alongside the SSE wait. PDF jobs only.
  pollState?: boolean;
  timeoutMs?: number;
  // Called for non-terminal updates: sweep progress, and the retry notice on
  // a failed-but-will-retry attempt.
  onProgress?: (event: JobEvent) => void;
}

const DEFAULT_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 2000;

export function useJobOutcome() {
  const { subscribe, getTerminalEvent } = useJobEvents();

  const waitForJob = useCallback(
    ({ activityId, jobId, pollState = false, timeoutMs = DEFAULT_TIMEOUT_MS, onProgress }: WaitForJobOptions) =>
      new Promise<JobOutcome>((resolve) => {
        // A job can finish before this wait is even set up, so check the
        // recently-seen cache before subscribing to anything.
        const already = getTerminalEvent(activityId) || getTerminalEvent(jobId);
        if (already) {
          resolve(toOutcome(already));
          return;
        }

        let settled = false;
        let unsubscribe: (() => void) | null = null;
        let pollTimer: number | null = null;
        let timeoutTimer: number | null = null;

        const settle = (outcome: JobOutcome) => {
          if (settled) return;
          settled = true;
          unsubscribe?.();
          if (pollTimer !== null) window.clearTimeout(pollTimer);
          if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
          resolve(outcome);
        };

        unsubscribe = subscribe((event) => {
          const matches =
            (!!activityId && !!event.activityId && event.activityId === activityId) ||
            event.jobId === jobId;
          if (!matches) return;

          // BullMQ emits 'failed' on every attempt, not just the last. Only
          // the final one is an outcome; the rest mean "retrying".
          if (!event.final) {
            onProgress?.(event);
            return;
          }

          settle(toOutcome(event));
        });

        if (pollState) {
          const poll = async () => {
            if (settled) return;
            try {
              const state = await reportsApi.getPdfJobState(jobId);
              if (settled) return;
              if (state.state === 'completed') {
                settle({ kind: 'completed', data: state.returnvalue || {} });
                return;
              }
              if (state.state === 'failed') {
                settle({ kind: 'failed', reason: state.failedReason || 'The PDF render failed' });
                return;
              }
            } catch (error) {
              // 404 means BullMQ already reaped the record; anything else is
              // a transport problem. Either way this is only a backstop, so
              // stop polling and let SSE or the timeout decide rather than
              // reporting a failure the job never had.
              return;
            }
            pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
          };
          pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }

        timeoutTimer = window.setTimeout(() => settle({ kind: 'timeout' }), timeoutMs);
      }),
    [subscribe, getTerminalEvent]
  );

  return { waitForJob };
}

function toOutcome(event: JobEvent): JobOutcome {
  if (event.status === 'failed') {
    return { kind: 'failed', reason: event.data?.failedReason || 'The job failed' };
  }
  return { kind: 'completed', data: event.data || {} };
}
