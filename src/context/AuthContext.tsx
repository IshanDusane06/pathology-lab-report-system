
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { MOCK_USERS } from './authData';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'Doctor' | 'Technician' | 'Admin';
  profile?: {
    specialization?: string;
    qualification?: string;
    contactNumber?: string;
    address?: string;
  };
  permissions?: Record<string, boolean>;
  mustChangePassword?: boolean;
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: 'Doctor' | 'Technician' | 'Admin') => boolean;
  hasPermission: (permission: string) => boolean;
  isDoctor: () => boolean;
  isTechnician: () => boolean;
  isAdmin: () => boolean;
  navigate: (path: string) => void;
  updateUser: (updates: Partial<User>) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};



export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  // useEffect(() => {
  //   // Check if user is already logged in via localStorage
  //   const storedUser = localStorage.getItem('patho_user');
  //   if (storedUser) {
  //     try {
  //       setUser(JSON.parse(storedUser));
  //     } catch (error) {
  //       console.error('Failed to parse stored user', error);
  //       localStorage.removeItem('patho_user');
  //     }
  //   }
  //   setIsLoading(false);
  // }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('patho_user');
    const token = localStorage.getItem('patho_token');
  
    if (storedUser && token) {
      try {
        // Decode token to check expiration
        const payload = JSON.parse(atob(token.split('.')[1])); // base64 decode JWT payload
        const isTokenExpired = payload.exp * 1000 < Date.now();
  
        if (isTokenExpired) {
          console.warn('JWT token has expired');
          localStorage.removeItem('patho_user');
          localStorage.removeItem('patho_token');
          setUser(null);
        } else {
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error('Invalid token or user data:', error);
        localStorage.removeItem('patho_user');
        localStorage.removeItem('patho_token');
        setUser(null);
      }
    }
  
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      console.log('Attempting login with:', { email }); // Only log email for security
      
      // Log request body before sending
      const requestBody = { email, password: '***' }; // Mask password for security
      console.log('Sending login request with body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      console.log('Response status:', response.status); // Log response status
      console.log('Response headers:', Object.fromEntries(response.headers.entries())); // Log headers
      
      try {
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2)); // Pretty print response data
        
        if (!data.success) {
          console.error('Login failed:', data.message || 'Login failed');
          throw new Error(data.message || 'Login failed');
        }

        // Store the token and user data
        const { token, user } = data.data;
        localStorage.setItem('patho_token', token);
        localStorage.setItem('patho_user', JSON.stringify(user));
        setUser(user);
        
        toast({
          title: "Login successful",
          description: `Welcome back, ${user.name}`,
        });
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Login failed', error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      localStorage.setItem('patho_user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('patho_user');
    localStorage.removeItem('patho_token');
    navigate('/login');
    toast({
      title: "Logged out",
      description: "You have been successfully logged out",
    });
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasRole: (role: 'Doctor' | 'Technician' | 'Admin') => user?.role === role,
    hasPermission: (permission: string) => user?.permissions?.[permission] ?? false,
    isDoctor: () => user?.role === 'Doctor',
    isTechnician: () => user?.role === 'Technician',
    isAdmin: () => user?.role === 'Admin',
    navigate: (path: string) => navigate(path),
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
