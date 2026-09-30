import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import VerificationCard from "@/components/VerificationCard";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import {
  PageTransition,
  StaggerContainer,
  StaggerItem,
} from "@/utils/animations";
import { ClipboardCheck, Search } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { reportsApi } from "@/services/reportsApi";

const ReportVerification = () => {
  const navigate = useNavigate();
  const { isDoctor } = useAuth();
  const [pendingReports, setPendingReports] = useState<any[]>([]);
  const [filteredReports, setFilteredReports] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is a doctor
    if (!isDoctor()) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }
  }, [isDoctor, navigate]);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const response = await reportsApi.getReportsByFilters({ "status.value": "pendingApproval" });

        const reports = response.map((report) => ({
          ...report,
          id: report._id,
          reportType: report.reportTypeCode,
          patientName: report.patientInfo.name,
          technician: report.technician.name,
          createdAt: report.createdAt.toString(),
          remarks: report.remarks,
          status: "pendingApproval" as const,
        }));

        setPendingReports(reports);
      } catch (error) {
        console.error("Error fetching reports:", error);
        toast({
          title: "Error",
          description: "Failed to load reports. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  // Handle search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredReports(pendingReports);
      return;
    }

    const search = searchTerm.toLowerCase();
    const filtered = pendingReports.filter(
      (report) =>
        report.patientName.toLowerCase().includes(search) ||
        report.reportType.toLowerCase().includes(search) ||
        report.technician.toLowerCase().includes(search)
    );
    setFilteredReports(filtered);
  }, [searchTerm, pendingReports]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Verification Queue</h1>
              <p className="text-muted-foreground mt-1">
                Review and verify pending reports
              </p>
            </div>
          </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search by patient name or test type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardCheck className="h-16 w-16 text-muted-foreground/60 mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">All caught up!</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                There are no reports waiting for verification. Check back later
                or create a new report.
              </p>
            </div>
          ) : (
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredReports.map((report) => (
                <StaggerItem key={report.id}>
                  <VerificationCard report={report} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </PageTransition>
    </div>
  );
};

export default ReportVerification;
