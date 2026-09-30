import { API_BASE_URL, Pagination } from './api';

export interface IUser {
  _id: string;
  name: string;
  email: string;
  role: 'Doctor' | 'Technician' | 'Admin';
  isActive: boolean;
  lastLogin?: string | null;
  createdAt?: string;
  mustChangePassword?: boolean;
  profile?: {
    specialization?: string;
    qualification?: string;
    contactNumber?: string;
    address?: string;
    registrationNumber?: string;
  };
}

export interface CreateUserInput {
  name: string;
  email: string;
  // Omit to have the backend auto-generate a temp password (returned once in
  // the response) instead of setting one explicitly.
  password?: string;
  role: 'Doctor' | 'Technician' | 'Admin';
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  role?: 'Doctor' | 'Technician' | 'Admin';
  status?: 'active' | 'suspended';
  search?: string;
  neverSignedIn?: boolean;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('patho_token')}`,
  };
}

export const usersApi = {
  // Create a user (Admin only). If no password was given, the response's
  // `tempPassword` is the only place it's ever visible — nothing stores it.
  createUser: async (user: CreateUserInput): Promise<IUser & { tempPassword?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(user),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create user');
      }

      return data.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  // List users (Admin only) — paginated, with optional role/status/search/neverSignedIn filters.
  getUsers: async (params: GetUsersParams = {}): Promise<{ data: IUser[]; pagination: Pagination }> => {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.role) query.set('role', params.role);
      if (params.status) query.set('status', params.status);
      if (params.search) query.set('search', params.search);
      if (params.neverSignedIn) query.set('neverSignedIn', 'true');

      const response = await fetch(`${API_BASE_URL}/users?${query.toString()}`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch users');
      }

      return { data: data.data, pagination: data.pagination };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Get a single user (Admin only)
  getUser: async (id: string): Promise<IUser> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch user');
      }

      return data.data;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  },

  // Update a user — role changes, isActive toggle (Admin only)
  updateUser: async (id: string, updates: Partial<Pick<IUser, 'name' | 'role' | 'isActive'>>): Promise<IUser> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to update user');
      }

      return data.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  // Admin-initiated password reset — returns the new temp password exactly once.
  resetPassword: async (id: string): Promise<{ tempPassword: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}/reset-password`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset password');
      }

      return data.data;
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  },

  // Delete a user — only allowed server-side for one that never signed in.
  deleteUser: async (id: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  // Self-service password change — requires the caller's current password.
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  },
};
