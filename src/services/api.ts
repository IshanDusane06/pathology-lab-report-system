
// API base URL
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Shared shape for every paginated list endpoint (users, admin report types, audit log).
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchWithErrorHandling(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'An error occurred');
    }
    
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Reports API methods
 */
export const reportsApi = {
  // Create a new report
  createReport: async (reportData: any) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reportData),
    });
  },
  
  // Get all reports
  getReports: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/reports`);
  },
  
  // Get a report by ID
  getReportById: async (reportId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/reports/${reportId}`);
  },
  
  // Update a report
  updateReport: async (reportId: string, updates: any) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/reports/${reportId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
  },
};

/**
 * Auth API methods
 */
export const authApi = {
  // Login
  login: async (email: string, password: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  },
  
  // Get current user
  getCurrentUser: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/auth/me`);
  },
};
