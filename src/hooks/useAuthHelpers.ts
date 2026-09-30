import { useAuth } from '../context/AuthContext';

/**
 * Custom hook to check if user has a specific role
 * @param role - The role to check for
 * @returns boolean indicating if user has the role
 */
export const useHasRole = (role: 'Doctor' | 'Technician' | 'Admin') => {
  const { user } = useAuth();
  return user?.role === role;
};

/**
 * Custom hook to check if user has a specific permission
 * @param permission - The permission to check for
 * @returns boolean indicating if user has the permission
 */
export const useHasPermission = (permission: string) => {
  const { user } = useAuth();
  return user?.permissions?.[permission] ?? false;
};
