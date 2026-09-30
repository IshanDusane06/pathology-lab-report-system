
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { PageTransition, StaggerContainer, StaggerItem } from '@/utils/animations';
import { Activity, Beaker, Check, FileText, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { reportsApi, IReport, IPersonRef } from '@/services/reportsApi';
import ReportStatusBadge, { ReportStatusValue } from '@/components/report/ReportStatusBadge';
import { canEditReportContent } from '@/lib/reportAccess';

interface RecentReport {
  id: string;
  patient: string;
  type: string;
  date: string;
  status: string;
  technicianUserId?: string;
}

const activityData = [
  { name: 'Mon', reports: 4, verifications: 3 },
  { name: 'Tue', reports: 6, verifications: 5 },
  { name: 'Wed', reports: 8, verifications: 7 },
  { name: 'Thu', reports: 7, verifications: 6 },
  { name: 'Fri', reports: 9, verifications: 8 },
  { name: 'Sat', reports: 5, verifications: 4 },
  { name: 'Sun', reports: 3, verifications: 2 },
];

const reportTypeData = [
  { name: 'CBC', value: 35 },
  { name: 'HIV', value: 20 },
  { name: 'Liver', value: 15 },
  { name: 'Kidney', value: 10 },
  { name: 'Thyroid', value: 12 },
  { name: 'Lipid', value: 8 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Dashboard = () => {
  const { user, isDoctor, isTechnician } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);

  useEffect(() => {
    // Simulate loading dashboard data
    const fetchDashboardData = async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      setPendingCount(8);
      setCompletedCount(24);
      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  useEffect(() => {
    const fetchRecentReports = async () => {
      try {
        const { data: reports } = await reportsApi.getReports({ limit: 5 });
        setRecentReports(
          reports.map((report) => ({
            id: report._id || '',
            patient: report.patientInfo?.name || 'N/A',
            type: report.reportTypeCode,
            date: report.createdAt || '',
            status: report.status?.value || 'draft',
            technicianUserId:
              typeof report.technician === 'string' ? report.technician : report.technician?.userId,
          }))
        );
      } catch (err) {
        console.error('Error fetching recent reports:', err);
      }
    };

    fetchRecentReports();
  }, []);

  const handleCreateReport = () => {
    navigate('/report/create');
  };

  // Same navigation target either way — only changes what the button says,
  // so a report you can actually edit stops reading like a read-only link.
  const getRowActionLabel = (report: RecentReport) => {
    const pseudoReport = {
      status: { value: report.status },
      technician: { userId: report.technicianUserId } as IPersonRef,
    } as IReport;
    if (canEditReportContent(pseudoReport, user?.id, user?.role)) {
      return report.status === 'pendingApproval' ? 'Review' : 'Edit';
    }
    return 'View';
  };

  const handleViewPending = () => {
    if (isDoctor()) {
      navigate('/verification');
    } else {
      navigate('/reports?status=pendingApproval');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Welcome back, {user?.name}
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <Button onClick={handleCreateReport} className="gap-2">
                <Beaker size={18} />
                {isDoctor() ? 'Create & Verify Report' : 'Create New Report'}
              </Button>
            </div>
          </div>
          
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <StaggerItem>
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardDescription>Total Reports</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? (
                      <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                    ) : (
                      pendingCount + completedCount
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-muted-foreground">
                    <FileText size={16} className="mr-1" />
                    <span className="text-sm">All time</span>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
            
            <StaggerItem>
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardDescription>
                    {isDoctor() ? 'Pending Verification' : 'Pending Reports'}
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? (
                      <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                    ) : (
                      pendingCount
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="link" 
                    className="px-0 h-auto text-primary" 
                    onClick={handleViewPending}
                  >
                    View pending
                  </Button>
                </CardContent>
              </Card>
            </StaggerItem>
            
            <StaggerItem>
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardDescription>Verified Reports</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? (
                      <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                    ) : (
                      completedCount
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-muted-foreground">
                    <Check size={16} className="mr-1" />
                    <span className="text-sm">Completed</span>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
            
            <StaggerItem>
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardDescription>Active Patients</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? (
                      <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                    ) : (
                      12
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-muted-foreground">
                    <Users size={16} className="mr-1" />
                    <span className="text-sm">Past 30 days</span>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerContainer>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Activity Overview</CardTitle>
                <CardDescription>Weekly report creation and verification</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" stroke="#888888" fontSize={12} />
                      <YAxis stroke="#888888" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #f0f0f0',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }} 
                      />
                      <Line
                        type="monotone"
                        dataKey="reports"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Reports Created"
                      />
                      <Line
                        type="monotone"
                        dataKey="verifications"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Verifications"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Report Types</CardTitle>
                <CardDescription>Distribution by test type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[240px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {reportTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #f0f0f0',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Recent Reports</CardTitle>
                  <CardDescription>Latest activities in the lab</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/reports')}>
                  View all
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Patient</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Test Type</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Date</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">Status</th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReports.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                          No reports yet
                        </td>
                      </tr>
                    )}
                    {recentReports.map((report) => (
                      <tr key={report.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="py-3">{report.patient}</td>
                        <td className="py-3">{report.type}</td>
                        <td className="py-3">{formatDate(report.date)}</td>
                        <td className="py-3">
                          <ReportStatusBadge status={report.status as ReportStatusValue} />
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/report/${report.id}`)}
                          >
                            {getRowActionLabel(report)}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </div>
  );
};

export default Dashboard;
