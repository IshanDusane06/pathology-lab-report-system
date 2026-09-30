import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import ChangePasswordForm from '@/components/profile/ChangePasswordForm';
import { KeyRound } from 'lucide-react';

const ForceChangePassword: React.FC = () => {
  const { updateUser, logout, navigate } = useAuth();

  const handleSuccess = () => {
    updateUser({ mustChangePassword: false });
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-md">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-lg">Set a new password</CardTitle>
          </div>
          <CardDescription>
            You're signing in with a temporary password. Please set a new password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm onSuccess={handleSuccess} currentPasswordLabel="Temporary password" />
          <button
            type="button"
            onClick={logout}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
          >
            Not you? Log out
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForceChangePassword;
