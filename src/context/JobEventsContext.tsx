import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/services/api';
import { eventsApi } from '@/services/eventsApi';

// Live job outcomes, pushed from the server over Server-Sent Events.
//
// The backend runs report emails, PDF renders and signature sweeps as
// background jobs, so the HTTP response to "send this" only means *queued*.
// This provider holds the one connection per tab that carries the real
// outcome back, and fans it out to whoever is waiting.

export type JobName = 'report-email' | 'report-pdf' | 'reverify-all';
export type JobEventStatus = 'completed' | 'failed' | 'progress';

// Every field any job can report, all optional — the server sends a different
// shape per job name and status (see api/queue/worker.js's mapReturnValue and
// each job in api/jobs/). Flattening them keeps narrowing at the call site
// without a cross-product union of name x status.
export interface JobEventData {
  // report-email, completed
  recipient?: string;
  attachments?: number;
  messageId?: string;
  resent?: boolean;
  alreadySent?: boolean;
  // report-pdf, completed
  resultKey?: string;
  filename?: string;
  bytes?: number;
  // reverify-all, completed + progress
  checked?: number;
  reportsScanned?: number;
  mismatchCount?: number;
  mismatches?: number | { reportId: string; signatureIndex: number }[];
  verifiedAt?: string;
  // any, failed
  failedReason?: string;
  willRetry?: boolean;
}

export interface JobEvent {
  jobId: string;
  activityId: string | null;
  name: JobName;
  status: JobEventStatus;
  // False on a failure that BullMQ is going to retry. Anything user-facing
  // must gate on this: a 3-attempt email fires 'failed' three times, and only
  // the last one means the send actually failed.
  final: boolean;
  data: JobEventData;
}

type Listener = (event: JobEvent) => void;

interface JobEventsValue {
  connected: boolean;
  subscribe: (listener: Listener) => () => void;
  // Terminal events seen recently, keyed by activityId and by jobId. A fast
  // job can finish before its caller has subscribed; without this that
  // outcome is lost to a race no retry recovers from.
  getTerminalEvent: (key?: string | null) => JobEvent | undefined;
}

const JobEventsContext = createContext<JobEventsValue | undefined>(undefined);

export const useJobEvents = () => {
  const context = useContext(JobEventsContext);
  if (!context) throw new Error('useJobEvents must be used within a JobEventsProvider');
  return context;
};

const TERMINAL_CACHE_LIMIT = 50;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export const JobEventsProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [connected, setConnected] = useState(false);

  const listenersRef = useRef<Set<Listener>>(new Set());
  const terminalRef = useRef<Map<string, JobEvent>>(new Map());
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  // Guards the async gap between minting a token and opening the stream: the
  // user can log out, or the effect can re-run, while that request is in
  // flight, and the resulting EventSource would otherwise be orphaned.
  const generationRef = useRef(0);

  // The headless PDF renderer loads /report/:id/export and Puppeteer waits for
  // networkidle0 before capturing. An SSE connection is an HTTP request that
  // never completes, so that page would never reach network idle and every
  // render would stall until its 30s timeout — breaking the exact feature
  // these events report on. The export view has no UI to update anyway.
  const isRenderTarget = location.pathname.endsWith('/export');

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getTerminalEvent = useCallback((key?: string | null) => {
    if (!key) return undefined;
    return terminalRef.current.get(key);
  }, []);

  useEffect(() => {
    const remember = (key: string | null | undefined, event: JobEvent) => {
      if (!key) return;
      const cache = terminalRef.current;
      // Re-insert so iteration order stays least-recently-seen first.
      cache.delete(key);
      cache.set(key, event);
      while (cache.size > TERMINAL_CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
      }
    };

    const handleJobMessage = (raw: string) => {
      let event: JobEvent;
      try {
        event = JSON.parse(raw);
      } catch (error) {
        console.error('Error parsing job event:', error);
        return;
      }

      if (event.final) {
        remember(event.activityId, event);
        remember(event.jobId, event);
      }

      // One listener throwing must not starve the rest.
      listenersRef.current.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in job event listener:', error);
        }
      });
    };

    const teardown = () => {
      generationRef.current += 1;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
    };

    if (!isAuthenticated || isRenderTarget) {
      teardown();
      terminalRef.current.clear();
      return;
    }

    const generation = ++generationRef.current;
    const isStale = () => generationRef.current !== generation;

    const scheduleReconnect = () => {
      if (isStale() || retryTimerRef.current !== null) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attemptRef.current);
      attemptRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        connect();
      }, delay);
    };

    const connect = async () => {
      if (isStale()) return;
      try {
        // Minted fresh on every connect, which is what makes expiry a
        // non-issue: the token is only checked when the stream opens, so
        // there is nothing to rotate mid-stream and no gap where a healthy
        // connection gets torn down to refresh a credential.
        const { token } = await eventsApi.mintStreamToken();
        if (isStale()) return;

        const source = new EventSource(
          `${API_BASE_URL}/events/stream?token=${encodeURIComponent(token)}`
        );
        sourceRef.current = source;

        source.addEventListener('open', () => {
          if (isStale()) return;
          attemptRef.current = 0;
          setConnected(true);
        });

        // The server emits a NAMED event (`event: job` in api/events/hub.js),
        // so this must be addEventListener('job'). onmessage never fires for
        // named events and the whole feature would look silently broken.
        source.addEventListener('job', (event) => {
          if (isStale()) return;
          handleJobMessage((event as MessageEvent).data);
        });

        source.addEventListener('error', () => {
          if (isStale()) return;
          setConnected(false);
          // EventSource retries a dropped connection by itself (readyState
          // CONNECTING) — leave it alone. But a non-200 response, which is
          // what an expired token produces, closes it permanently. That is
          // the case we have to re-mint and reconnect for.
          if (source.readyState === EventSource.CLOSED) {
            source.close();
            if (sourceRef.current === source) sourceRef.current = null;
            scheduleReconnect();
          }
        });
      } catch (error) {
        // Minting failed (API down, session expired). Back off and retry.
        console.error('Error opening the live updates stream:', error);
        scheduleReconnect();
      }
    };

    connect();
    return teardown;
  }, [isAuthenticated, isRenderTarget]);

  return (
    <JobEventsContext.Provider value={{ connected, subscribe, getTerminalEvent }}>
      {children}
    </JobEventsContext.Provider>
  );
};
