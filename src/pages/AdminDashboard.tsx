import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Navbar from "@/components/Navbar";
import { PageTransition } from "@/utils/animations";
import { toast } from "@/components/ui/use-toast";
import { usersApi, IUser } from "@/services/usersApi";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminRolesTab from "@/components/admin/AdminRolesTab";
import AdminTemplatesTab from "@/components/admin/AdminTemplatesTab";
import AdminAuditTab from "@/components/admin/AdminAuditTab";
import AdminLabSettingsTab from "@/components/admin/AdminLabSettingsTab";

const AdminDashboard = () => {
  const [users, setUsers] = useState<IUser[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [createUserSignal, setCreateUserSignal] = useState(0);

  useEffect(() => {
    // Fetched independently of AdminUsersTab's own paginated table fetch —
    // these stats need the full user set, not just whatever page the table
    // happens to be showing.
    usersApi
      .getUsers({ limit: 100 })
      .then((res) => setUsers(res.data))
      .catch(() => undefined)
      .finally(() => setStatsLoading(false));
  }, []);

  const stats = useMemo(() => {
    const doctors = users.filter((u) => u.role === "Doctor").length;
    const technicians = users.filter((u) => u.role === "Technician").length;
    const neverSignedIn = users.filter((u) => !u.lastLogin).length;
    return { total: users.length, doctors, technicians, neverSignedIn };
  }, [users]);

  const handleNewReportTemplate = () => {
    toast({ title: "Use the Report templates tab", description: "Click \"+ New template\" there to create one." });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold">Admin</h1>
              <p className="text-muted-foreground mt-1">Manage users, roles, report templates and lab settings</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleNewReportTemplate}>
                New report template
              </Button>
              <Button
                onClick={() => {
                  setActiveTab("users");
                  setCreateUserSignal((s) => s + 1);
                }}
              >
                + Create user
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total users</CardDescription>
                <CardTitle className="text-3xl">{statsLoading ? "—" : stats.total}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Across 3 roles</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Doctors</CardDescription>
                <CardTitle className="text-3xl">{statsLoading ? "—" : stats.doctors}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Can sign reports</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Technicians</CardDescription>
                <CardTitle className="text-3xl">{statsLoading ? "—" : stats.technicians}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Can create & revise</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Never signed in</CardDescription>
                <CardTitle className="text-3xl">{statsLoading ? "—" : stats.neverSignedIn}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-600">Credentials issued, not used yet</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="roles">Roles &amp; permissions</TabsTrigger>
              <TabsTrigger value="templates">Report templates</TabsTrigger>
              <TabsTrigger value="audit">Audit trail</TabsTrigger>
              <TabsTrigger value="lab">Lab settings</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="pt-6">
              <AdminUsersTab openCreateSignal={createUserSignal} />
            </TabsContent>
            <TabsContent value="roles" className="pt-6">
              <AdminRolesTab />
            </TabsContent>
            <TabsContent value="templates" className="pt-6">
              <AdminTemplatesTab />
            </TabsContent>
            <TabsContent value="audit" className="pt-6">
              <AdminAuditTab />
            </TabsContent>
            <TabsContent value="lab" className="pt-6">
              <AdminLabSettingsTab />
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </div>
  );
};

export default AdminDashboard;
