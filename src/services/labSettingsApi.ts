import { API_BASE_URL } from './api';

export interface LabWorkflowPolicy {
  limitUnsignHours: number | null;
  commentRequiredOnChangesRequested: boolean;
  secondDoctorReviewForCritical: boolean;
  autoSuspendAfterDaysInactive: number | null;
  twoFactorForDoctorsAndAdmins: boolean;
}

export interface LabEmailSettings {
  enabled: boolean;
  senderName: string;
  senderAddress: string;
  replyTo: string;
  footerNote: string;
}

export interface LabSettings {
  _id: string;
  labName: string;
  tagline: string;
  registrationNumber: string;
  address: string;
  workflowPolicy: LabWorkflowPolicy;
  // Presentation half of email config — SMTP credentials never leave the
  // server's environment and are never part of this payload.
  email: LabEmailSettings;
  // Derived server-side from env, read-only: whether SMTP is actually wired
  // up, and which account it authenticates as (for the Gmail From-mismatch
  // warning). Never sent back on update.
  emailConfigured?: boolean;
  smtpAccount?: string | null;
  lastVerification: { at: string | null; checked: number; mismatches: number };
}

// A 202 receipt, not a result. The sweep runs as a background job, so the
// counts arrive later as an SSE job event (and are persisted to
// lastVerification). `alreadyRunning` means a sweep was already in flight and
// this request joined it — the sweep is a lab-wide singleton, so that is the
// normal outcome of two admins clicking, not an error.
export interface QueuedReverify {
  jobId: string;
  activityId: string | null;
  status: 'queued';
  alreadyRunning: boolean;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('patho_token')}`,
  };
}

export const labSettingsApi = {
  getLabSettings: async (): Promise<LabSettings> => {
    try {
      const response = await fetch(`${API_BASE_URL}/lab-settings`, { headers: authHeaders() });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch lab settings');
      }

      return data.data;
    } catch (error) {
      console.error('Error fetching lab settings:', error);
      throw error;
    }
  },

  updateLabSettings: async (updates: Partial<Omit<LabSettings, '_id' | 'lastVerification'>>): Promise<LabSettings> => {
    try {
      const response = await fetch(`${API_BASE_URL}/lab-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to update lab settings');
      }

      return data.data;
    } catch (error) {
      console.error('Error updating lab settings:', error);
      throw error;
    }
  },

  reverifySignatures: async (): Promise<QueuedReverify> => {
    try {
      const response = await fetch(`${API_BASE_URL}/lab-settings/reverify-signatures`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to re-verify signatures');
      }

      return data.data;
    } catch (error) {
      console.error('Error re-verifying signatures:', error);
      throw error;
    }
  },

  // Sends to the requesting Admin's own address — validates SMTP config
  // without involving patient data.
  sendTestEmail: async (): Promise<{ to: string; messageId?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/lab-settings/test-email`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to send the test email');
      }

      return data.data;
    } catch (error) {
      console.error('Error sending test email:', error);
      throw error;
    }
  },
};
