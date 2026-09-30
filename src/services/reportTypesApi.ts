import { API_BASE_URL, Pagination } from './api';

export interface ReportType {
  _id: string;
  name: string;
  code: string;
  description: string;
  parameters: Parameter[];
  sections?: Section[];
  isActive: boolean;
  method?: string;
  defaultRemarks?: string;
  sectionWiseRemarks?: boolean;
  sectionWiseMethod?: boolean;
}

export interface Parameter {
  name: string;
  description: string;
  unit: string;
  type: 'number' | 'text' | 'select' | 'range' | 'boolean' | 'paragraph' | 'datedReadings' | 'breakdown';
  options?: string[];
  booleanLabels?: { trueLabel?: string; falseLabel?: string };
  referenceRangeText?: string;
  // Fixed, admin-defined list of named sub-values for a "breakdown"
  // parameter (e.g. Motility: Actively Motile / Sluggishly Motile / Non
  // Motile) — order here is the order they render in.
  subFields?: SubField[];
  normalValues: NormalValue[];
  isRequired: boolean;
  displayOrder: number;
  section: string;
}

export interface SubField {
  label: string;
  unit?: string;
}

export interface Section {
  key: string;
  title: string;
  description?: string;
  displayOrder: number;
  collapsedByDefault?: boolean;
  remarksEnabled?: boolean;
  defaultRemarks?: string;
  method?: string;
}

export interface NormalValue {
  min: number;
  max: number;
  unit: string;
  gender: 'male' | 'female' | 'all';
  ageRange: {
    min: number;
    max: number;
  };
}

export const reportTypesApi = {
  // Get all active report types
  getReportTypes: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/report-types`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch report types');
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch report types');
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching report types:', error);
      throw error;
    }
  },

  // Get a specific report type by ID
  getReportType: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/report-types/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch report type');
      }

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch report type');
      }

      return data.data;
    } catch (error) {
      console.error('Error fetching report type:', error);
      throw error;
    }
  },

  // Get every report type, including drafts (Admin only) — paginated.
  getAdminReportTypes: async (
    params: { page?: number; limit?: number; search?: string; status?: 'active' | 'draft' } = {}
  ): Promise<{ data: ReportType[]; pagination: Pagination }> => {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);

      const response = await fetch(`${API_BASE_URL}/report-types/admin?${query.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
        },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch report types');
      }

      return { data: data.data, pagination: data.pagination };
    } catch (error) {
      console.error('Error fetching admin report types:', error);
      throw error;
    }
  },

  // Create a report type (Admin only)
  createReportType: async (reportType: Partial<ReportType>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/report-types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
        },
        body: JSON.stringify(reportType),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create report type');
      }

      return data.data;
    } catch (error) {
      console.error('Error creating report type:', error);
      throw error;
    }
  },

  // Update a report type (Admin only)
  updateReportType: async (id: string, updates: Partial<ReportType>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/report-types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
        },
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to update report type');
      }

      return data.data;
    } catch (error) {
      console.error('Error updating report type:', error);
      throw error;
    }
  },

  // Permanently delete a report type (Admin only) — the backend blocks this
  // if any report references it (use updateReportType({isActive:false}) /
  // "Set to draft" for a template that's actually been used).
  deleteReportType: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/report-types/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
        },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete report type');
      }

      return data;
    } catch (error) {
      console.error('Error deleting report type:', error);
      throw error;
    }
  }
};
