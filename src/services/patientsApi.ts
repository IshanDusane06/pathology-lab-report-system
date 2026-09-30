import { API_BASE_URL, Pagination } from './api';

export interface IPatient {
  _id: string;
  patientId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  sex: 'male' | 'female' | 'other';
  dob?: string | null;
  /** Fallback age, only set when dob is unknown. */
  ageYears?: number | null;
  ageRecordedAt?: string | null;
  /** Resolved age — derived from dob when known, else the recorded ageYears. */
  age: number | null;
  /** Which of the two the resolved age came from, so a stale age can be shown as stale. */
  ageSource: 'dob' | 'recorded' | 'unknown';
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  mergedInto?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A search result carries the last visit, which is what tells two same-named people apart. */
export interface IPatientSearchResult extends IPatient {
  lastVisit?: string | null;
}

export interface IDuplicateCandidate {
  patient: IPatient;
  confidence: 'strong' | 'medium';
  reasons: string[];
}

/** One group of existing patients that look like duplicates of each other. */
export interface IDuplicateGroup {
  key: string;
  reason: string;
  /** All members share the same phone — a stronger, non-family-confusable signal. */
  sharesPhone: boolean;
  patients: IPatient[];
}

export interface PatientInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  sex: 'male' | 'female' | 'other';
  dob?: string | null;
  ageYears?: number | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Thrown when POST /patients finds possible existing patients. The caller is
 * expected to show `candidates` and either select one or retry with force.
 */
export class DuplicatePatientError extends Error {
  candidates: IDuplicateCandidate[];
  constructor(message: string, candidates: IDuplicateCandidate[]) {
    super(message);
    this.name = 'DuplicatePatientError';
    this.candidates = candidates;
  }
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('patho_token')}`,
  };
}

export const patientsApi = {
  /**
   * Candidate duplicate groups for cleanup (Admin only). Grouped by
   * near-identical name + sex — the near-duplicates that got through
   * creation via force:true, not families sharing a phone number.
   */
  getDuplicateGroups: async (): Promise<IDuplicateGroup[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/duplicates`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to find duplicate patients');
      }

      return data.data;
    } catch (error) {
      console.error('Error finding duplicate patients:', error);
      throw error;
    }
  },

  /**
   * Merge `sourceId` into `targetId` (Admin only). Every report belonging to
   * the source is re-pointed at the target; the source becomes a tombstone,
   * never deleted. No report's own patientInfo snapshot is touched.
   */
  mergePatients: async (
    sourceId: string,
    targetId: string
  ): Promise<{ survivor: IPatient; merged: IPatient; reportsMoved: number }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/${sourceId}/merge`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ targetId }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to merge patients');
      }

      return data.data;
    } catch (error) {
      console.error('Error merging patients:', error);
      throw error;
    }
  },


  /** Typeahead for the patient picker. Accepts a phone number, a name, or a patient ID. */
  searchPatients: async (
    query: string,
    limit = 10
  ): Promise<{ data: IPatientSearchResult[]; matchedOn: string }> => {
    try {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      const response = await fetch(`${API_BASE_URL}/patients/search?${params}`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to search patients');
      }

      return { data: data.data, matchedOn: data.matchedOn };
    } catch (error) {
      console.error('Error searching patients:', error);
      throw error;
    }
  },

  getPatients: async (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: 'active' | 'inactive';
    } = {}
  ): Promise<{ data: IPatient[]; pagination: Pagination }> => {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);

      const response = await fetch(`${API_BASE_URL}/patients?${query}`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch patients');
      }

      return { data: data.data, pagination: data.pagination };
    } catch (error) {
      console.error('Error fetching patients:', error);
      throw error;
    }
  },

  /**
   * One patient. A merged record resolves to its survivor, with `mergedFrom`
   * describing the record that was asked for.
   */
  getPatient: async (id: string): Promise<{ patient: IPatient; mergedFrom?: IPatient }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/${id}`, { headers: authHeaders() });
      const data = await response.json();

      if (!response.ok || !data.success) {
        const err = new Error(data.message || 'Failed to fetch patient') as Error & {
          status?: number;
        };
        err.status = response.status;
        throw err;
      }

      return { patient: data.data, mergedFrom: data.mergedFrom };
    } catch (error) {
      console.error('Error fetching patient:', error);
      throw error;
    }
  },

  getPatientReports: async (
    id: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<{ data: unknown[]; pagination: Pagination }> => {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));

      const response = await fetch(`${API_BASE_URL}/patients/${id}/reports?${query}`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch patient reports');
      }

      return { data: data.data, pagination: data.pagination };
    } catch (error) {
      console.error('Error fetching patient reports:', error);
      throw error;
    }
  },

  /**
   * Create a patient. Throws DuplicatePatientError (HTTP 409) when possible
   * existing patients are found — pass `force` to create anyway, which is the
   * correct path for genuinely different people sharing a family phone number.
   */
  createPatient: async (patient: PatientInput, force = false): Promise<IPatient> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...patient, force }),
      });
      const data = await response.json();

      if (response.status === 409 && data?.data?.candidates) {
        throw new DuplicatePatientError(
          data.message || 'This may already be an existing patient',
          data.data.candidates
        );
      }
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create patient');
      }

      return data.data;
    } catch (error) {
      if (!(error instanceof DuplicatePatientError)) {
        console.error('Error creating patient:', error);
      }
      throw error;
    }
  },

  updatePatient: async (id: string, updates: Partial<PatientInput> & { isActive?: boolean }): Promise<IPatient> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to update patient');
      }

      return data.data;
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  },

  /** Duplicate check without creating — powers the live warning in the create dialog. */
  checkDuplicates: async (
    input: Pick<PatientInput, 'name' | 'phone' | 'sex' | 'dob' | 'ageYears'> & { excludeId?: string }
  ): Promise<IDuplicateCandidate[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/duplicates/check`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(input),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to check for duplicates');
      }

      return data.data;
    } catch (error) {
      console.error('Error checking for duplicate patients:', error);
      throw error;
    }
  },
};
