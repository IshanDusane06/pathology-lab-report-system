import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageTransition } from "@/utils/animations";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { reportsApi } from "@/services/reportsApi";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";

export interface RequestChangeProps {
  patientName: string;
  testType: string;
  changesRequestedBy: string;
  comments: string;
}

const RequestChanges = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [filteredReports, setFilteredReports] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchReports = async () => {
      setLoading(true);
      try {
        const response = await reportsApi.getReportsByFilters({
          "status.value": "changesRequested",
          "technician.userId": user.id,
        });
        const reports = response.map((report) => ({
          ...report,
          id: report._id,
          testType: report.reportTypeCode,
          patientName: report.patientInfo.name,
          technician: report.technician.name,
          changesRequestedBy: report.status?.updatedBy?.name || "Doctor",
          createdAt: report.createdAt.toString(),
          comments: report.status?.remarks || "",
        }));
        setFilteredReports(reports);
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
  }, [user?.id]);

  return (
    <>
      <Navbar />
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Request Changes</h1>
              <p className="text-muted-foreground mt-1">
                View and manage requests for changes to reports
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
              <CardDescription>{filteredReports.length} requests found</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-16">
                  <ClipboardCheck className="h-16 w-16 text-muted-foreground/60 mx-auto mb-4" />
                  <h3 className="text-xl font-medium mb-2">All caught up!</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    There are no reports waiting for verification. Check back
                    later or create a new report.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="pb-3 text-muted-foreground font-medium text-sm">
                          Patient
                        </th>
                        <th className="pb-3 text-muted-foreground font-medium text-sm">
                          Test Type
                        </th>
                        <th className="pb-3 text-muted-foreground font-medium text-sm">
                          Changes Requested By
                        </th>
                        <th className="pb-3 text-muted-foreground font-medium text-sm">
                          Comments
                        </th>
                        <th className="pb-3 text-muted-foreground font-medium text-sm">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((report, index) => (
                        <tr
                          key={report.id || `report-${index}`}
                          className="border-t border-border hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-2 ">{report.patientName}</td>
                          <td className="py-2">{report.testType}</td>
                          <td className="py-2">{report.changesRequestedBy}</td>
                          <td className="py-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <div className="max-w-[500px] line-clamp-3 cursor-pointer hover:text-primary">
                                  {report.comments}
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Comments</DialogTitle>
                                </DialogHeader>
                                <div className="mt-4">
                                  <p className="text-sm text-muted-foreground">
                                    {report.comments}
                                  </p>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </td>
                          <td className="py-2">
                            <Button
                              variant="outline"
                              onClick={() => navigate(`/report/${report.id}`)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </>
  );
};

export default RequestChanges;
