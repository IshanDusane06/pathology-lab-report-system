import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import ChangePasswordForm from '@/components/profile/ChangePasswordForm';
import { PageTransition } from '@/utils/animations';
import { UserCircle, KeyRound } from 'lucide-react';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container max-w-2xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Profile</h1>
            <p className="text-muted-foreground mt-1">Your account details and security settings</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCircle className="h-5 w-5" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{user?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{user?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <span className="inline-block bg-primary/10 text-primary text-xs py-0.5 px-2 rounded-full mt-0.5">
                      {user?.role}
                    </span>
                  </div>
                  {user?.profile?.specialization && (
                    <div>
                      <p className="text-xs text-muted-foreground">Specialization</p>
                      <p className="text-sm font-medium">{user.profile.specialization}</p>
                    </div>
                  )}
                  {user?.profile?.qualification && (
                    <div>
                      <p className="text-xs text-muted-foreground">Qualification</p>
                      <p className="text-sm font-medium">{user.profile.qualification}</p>
                    </div>
                  )}
                  {user?.profile?.contactNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground">Contact number</p>
                      <p className="text-sm font-medium">{user.profile.contactNumber}</p>
                    </div>
                  )}
                  {user?.profile?.address && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="text-sm font-medium">{user.profile.address}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => setChangePasswordOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setChangePasswordOpen(true);
                  }}
                  className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <CardContent className="pt-6 flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-md shrink-0">
                      <KeyRound className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Change Password</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Update the password you use to sign in
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </PageTransition>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Update the password you use to sign in</DialogDescription>
          </DialogHeader>
          <ChangePasswordForm onSuccess={() => setChangePasswordOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
