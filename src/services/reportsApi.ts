import { API_BASE_URL, Pagination } from './api';
export interface IPatientInfo {
    name: string;
    date: string; // ISO string (e.g., 2024-05-27T12:00:00Z)
    referredBy: string;
    sex: 'male' | 'female' | 'other';
    age: number;
    contact?: string;
    address?: string;
}

// One entry in a "datedReadings"-type parameter's value — the same
// measurement recorded again on a different date within one report (e.g. a
// Mantoux test's Day 1 / Day 2 / Day 3 readings). `value` is rich-text HTML,
// same as a "paragraph"-type parameter's value.
export interface IDatedReading {
    date: string; // "YYYY-MM-DD"
    value: string;
}

// One entry in a "breakdown"-type parameter's value — a fixed, admin-defined
// sub-item (e.g. Motility: "Actively Motile") filled in with its own number
// at report time. `label` always matches one of the template parameter's own
// subFields[].label.
export interface IBreakdownEntry {
    label: string;
    value: string | number;
}

export interface IParameter {
    name: string;
    // string | number | boolean for every scalar type; IDatedReading[]/
    // IBreakdownEntry[] only for a "datedReadings"/"breakdown"-type parameter.
    value: string | number | boolean | IDatedReading[] | IBreakdownEntry[];
    unit?: string;
    section?: string;
    notes?: string;
    // Per-report formatting, chosen by whoever filled in this value.
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

/**
 * A report as it's offered in the "also attach" / send picker — the display
 * name resolved server-side (never the internal reportTypeCode slug), plus
 * just enough to render one row and drive a preview.
 */
export interface IRelatedReport {
    _id: string;
    reportTypeCode: string;
    reportTypeName: string;
    patientInfo?: IPatientInfo;
    status?: status;
    createdAt?: string;
}

export interface status {
    value: 'draft' | 'pendingApproval' | 'signed' | 'changesRequested' | 'rejected';
    updatedBy?: { userId?: string; name?: string; role?: string };
    updatedAt?: string;
    remarks?: string | null;
}

export interface ISignature {
    signedBy?: { userId?: string; name?: string; role?: string };
    signedAt?: string;
    contentHash?: string | null;
    hmac?: string | null;
    algorithm?: string;
    invalidatedAt?: string | null;
    invalidatedReason?: string | null;
}

export interface IPersonRef {
    userId?: string;
    name?: string;
    qualification?: string | null;
    registrationNumber?: string | null;
}

export interface IDelivery {
    channel: 'email';
    recipient: string;
    status: 'sent' | 'failed';
    error?: string | null;
    messageId?: string | null;
    includedReportIds?: string[];
    sentBy?: { userId?: string; name?: string; role?: string };
    sentAt?: string;
}

export interface IReport {
    _id?: string;
    // Never sent by the API — some pages mirror _id onto this after fetching,
    // since a couple of older call sites still read report.id.
    id?: string;
    reportTypeId: string; // MongoDB ObjectId as string
    reportTypeCode: string;
    patientInfo: IPatientInfo;
    parameters: IParameter[];
    status?: status;
    signatures?: ISignature[];
    // The API always returns these as denormalized objects, never a bare id
    // string. The union keeps outgoing creation payloads (which historically
    // sent a plain id, since overwritten server-side) type-compatible too.
    technician: IPersonRef | string;
    doctor?: IPersonRef | string;
    remarks?: string;
    // Only used when the report's type has sectionWiseRemarks enabled —
    // mutually exclusive with `remarks` above at the UI/rendering layer.
    sectionRemarks?: { sectionKey: string; remarks: string }[];
    // Communication only — deliberately NOT inside patientInfo, so it stays
    // out of the signed content hash and can never render on the report.
    patientEmail?: string | null;
    /**
     * Link to the Patient record. Top-level and outside the signed content
     * hash, so it can be set on an old report or re-pointed by a merge
     * without touching the patientInfo snapshot a signature covers.
     * Null on reports created before the patient module existed.
     */
    patientId?: string | null;
    // Append-only send log, successes and failures both.
    deliveries?: IDelivery[];
    createdAt?: string;  // auto-generated
    updatedAt?: string;  // auto-generated
}

// Emailing and PDF rendering are background jobs, so these responses are
// 202-accepted receipts, NOT results. `activityId` identifies this one user
// action (the durable JobActivity row) and is the key to match the live SSE
// event against; `jobId` is a content hash, so a repeat of the same request
// reuses it and is NOT unique per action.
//
// `deduped` means an identical request was already in flight and this one
// joined it rather than starting a second — a double-click or a second tab,
// not an error.
export interface QueuedJob {
    jobId: string;
    activityId: string | null;
    status: 'queued';
    deduped: boolean;
}

export interface PdfJob extends QueuedJob {
    filename: string;
}

export interface QueuedEmail extends QueuedJob {
    recipient: string;
    // Reports included, not literal files — the email always carries exactly
    // one merged PDF.
    attachments: number;
}

export interface PdfJobState {
    jobId: string;
    // Raw BullMQ state. Note 'delayed' is what a job sits in between a failed
    // attempt and its retry, so only 'failed' means terminally failed.
    state:
    | 'completed'
    | 'failed'
    | 'active'
    | 'waiting'
    | 'waiting-children'
    | 'delayed'
    | 'prioritized'
    | 'paused'
    | 'unknown';
    progress?: unknown;
    returnvalue?: { resultKey?: string; filename?: string; bytes?: number } | null;
    failedReason?: string | null;
}

export const reportsApi = {
    createReport: async (report: IReport) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify(report),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to create report');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to create report');
            }

            return data.data;
        } catch (error) {
            console.error('Error creating report:', error);
            throw error;
        }
    },

    deleteReport: async (reportId: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to delete report');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to delete report');
            }

            return data.data;
        } catch (error) {
            console.error('Error deleting report:', error);
            throw error;
        }
    },

    updateReport: async (reportId: string, report) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify(report),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update report');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to update report');
            }

            return data.data;
        } catch (error) {
            console.error('Error updating report:', error);
            throw error;
        }
    },

    addComment: async (reportId: string, comment: string, ) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ remarks: comment, status: 'requestChange' }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to add comment');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to add comment');
            }

            return data.data;
        } catch (error) {
            console.error('Error adding comment:', error);
            throw error;
        }
    },

    getReportById: async (reportId: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                const err = new Error(data.message || 'Failed to get report') as Error & { status?: number };
                err.status = response.status;
                throw err;
            }

            return data.data;
        } catch (error) {
            console.error('Error getting report:', error);
            throw error;
        }
    },

    getReports: async (
        params: {
            page?: number;
            limit?: number;
            status?: string;
            reportTypeCode?: string;
            search?: string;
            dateFrom?: string;
            dateTo?: string;
        } = {}
    ): Promise<{ data: IReport[]; pagination: Pagination }> => {
        try {
            const query = new URLSearchParams();
            if (params.page) query.set('page', String(params.page));
            if (params.limit) query.set('limit', String(params.limit));
            if (params.status) query.set('status', params.status);
            if (params.reportTypeCode) query.set('reportTypeCode', params.reportTypeCode);
            if (params.search) query.set('search', params.search);
            if (params.dateFrom) query.set('dateFrom', params.dateFrom);
            if (params.dateTo) query.set('dateTo', params.dateTo);

            const response = await fetch(`${API_BASE_URL}/reports?${query}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to get reports');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to get reports');
            }

            return { data: data.data, pagination: data.pagination };
        } catch (error) {
            console.error('Error getting reports:', error);
            throw error;
        }
    },

    getReportsByFilters: async (filters: Record<string, string>) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/filtered`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify(filters),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to get reports');
            }

            if (!data.success) {
                throw new Error(data.message || 'Failed to get reports');
            }

            return data.data;
        } catch (error) {
            console.error('Error getting reports:', error);
            throw error;
        }
    },

    submitReport: async (reportId: string, remarks?: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ remarks }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to submit report');
            }

            return data.data;
        } catch (error) {
            console.error('Error submitting report:', error);
            throw error;
        }
    },

    signReport: async (reportId: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to sign report');
            }

            return data.data;
        } catch (error) {
            console.error('Error signing report:', error);
            throw error;
        }
    },

    finalizeReport: async (reportId: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/finalize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to sign report');
            }

            return data.data;
        } catch (error) {
            console.error('Error finalizing report:', error);
            throw error;
        }
    },

    unsignReport: async (reportId: string, remarks: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/unsign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ remarks }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to un-sign report');
            }

            return data.data;
        } catch (error) {
            console.error('Error un-signing report:', error);
            throw error;
        }
    },

    requestChanges: async (reportId: string, remarks: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/request-changes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ remarks }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to request changes');
            }

            return data.data;
        } catch (error) {
            console.error('Error requesting changes:', error);
            throw error;
        }
    },

    rejectReport: async (reportId: string, remarks: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ remarks }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to reject report');
            }

            return data.data;
        } catch (error) {
            console.error('Error rejecting report:', error);
            throw error;
        }
    },

    /**
     * Link a historical report to a patient. The report's signed patientInfo
     * snapshot is never rewritten — an already-signed report keeps rendering
     * exactly what was signed.
     */
    linkPatient: async (reportId: string, patientId: string) => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/link-patient`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ patientId }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to link this report to a patient');
            }

            return data.data;
        } catch (error) {
            console.error('Error linking report to patient:', error);
            throw error;
        }
    },

    // Queues a server-side render and returns immediately — the bytes come
    // later from getPdfJobResult, once the job reports completion (over SSE,
    // or via getPdfJobState as a backstop). `filename` is known up front, so
    // the UI can name the file before rendering has even started.
    //
    // includeReportIds merges other signed reports for the same linked patient
    // into one combined PDF (the same set the "also attach" picker offers,
    // validated server-side exactly as POST /:id/email validates it).
    createPdfJob: async (reportId: string, includeReportIds: string[] = []): Promise<PdfJob> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/pdf-jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify({ includeReportIds }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to start the PDF render');
            }

            return data.data;
        } catch (error) {
            console.error('Error starting PDF render:', error);
            throw error;
        }
    },

    // Polled as a backstop to the live SSE event, for the cases where the push
    // never arrives (pub/sub down, stream blocked by a proxy). 404 means
    // BullMQ has already reaped the job record, not that anything failed.
    getPdfJobState: async (jobId: string): Promise<PdfJobState> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/pdf-jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                const err = new Error(data.message || 'Failed to read the PDF job') as Error & { status?: number };
                err.status = response.status;
                throw err;
            }

            return data.data;
        } catch (error) {
            console.error('Error reading PDF job state:', error);
            throw error;
        }
    },

    // The rendered bytes. Strictly single-use: the server deletes the blob the
    // moment it has been sent, and it expires 10 minutes after rendering. So a
    // 410 means "already taken, or the window closed" rather than a real
    // failure — status is attached so callers can re-render instead.
    getPdfJobResult: async (jobId: string): Promise<Blob> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/pdf-jobs/${jobId}/result`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });

            if (!response.ok) {
                // Errors still come back as JSON even though success is a PDF.
                let message = 'Failed to fetch the rendered PDF';
                try {
                    const data = await response.json();
                    message = data.message || message;
                } catch (_) {
                    // Non-JSON error body — keep the default message.
                }
                const err = new Error(message) as Error & { status?: number };
                err.status = response.status;
                throw err;
            }

            return await response.blob();
        } catch (error) {
            console.error('Error fetching rendered PDF:', error);
            throw error;
        }
    },

    /**
     * Other signed reports for the SAME linked patient (scoped by patientId,
     * not name — see Report.patientId's own comment for why that distinction
     * matters). `patientLinked: false` means the report predates the patient
     * module and has no reliable identity to match against, rather than
     * meaning "no other reports exist." `primary` is the report the call was
     * made against, carried back with the same resolved display name as
     * `data`'s rows so the caller never needs a second fetch just to label it.
     */
    getRelatedReports: async (
        reportId: string
    ): Promise<{ data: IRelatedReport[]; patientLinked: boolean; primary: IRelatedReport }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/related`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to fetch related reports');
            }

            return { data: data.data, patientLinked: data.patientLinked !== false, primary: data.primary };
        } catch (error) {
            console.error('Error fetching related reports:', error);
            throw error;
        }
    },

    // Queues the send. A resolved promise means "accepted for sending", NOT
    // "sent" — the outcome arrives later as an SSE job event. Pass
    // retryOfActivityId when re-sending a failed row so the server links the
    // two and stops counting the old one as needing attention.
    emailReport: async (
        reportId: string,
        options: { recipient?: string; includeReportIds?: string[]; retryOfActivityId?: string } = {}
    ): Promise<QueuedEmail> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${reportId}/email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
                },
                body: JSON.stringify(options),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to send the report email');
            }

            return data.data;
        } catch (error) {
            console.error('Error emailing report:', error);
            throw error;
        }
    },
}
