import { API_BASE_URL, Pagination } from './api';

export interface IAuditEvent {
  _id: string;
  actor?: { userId?: string; name?: string; role?: string };
  action: string;
  category: 'Signature' | 'Access' | 'Template' | 'Delivery';
  description: string;
  targetType?: string;
  targetId?: string;
  createdAt: string;
}

export interface GetAuditEventsParams {
  page?: number;
  limit?: number;
  category?: 'Signature' | 'Access' | 'Template' | 'Delivery';
}

export const auditApi = {
  // List audit events (Admin only) — paginated, newest first.
  getEvents: async (params: GetAuditEventsParams = {}): Promise<{ data: IAuditEvent[]; pagination: Pagination }> => {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.category) query.set('category', params.category);

      const response = await fetch(`${API_BASE_URL}/audit?${query.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('patho_token')}`,
        },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch audit log');
      }

      return { data: data.data, pagination: data.pagination };
    } catch (error) {
      console.error('Error fetching audit log:', error);
      throw error;
    }
  },
};
