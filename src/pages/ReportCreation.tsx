import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ReportForm from "@/components/ReportForm";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { PageTransition } from "@/utils/animations";
import { reportTypesApi } from "@/services/reportTypesApi";
import { toast } from "@/components/ui/use-toast";
import { useShowConfirmDialog } from "@/hooks/use-show-confirm-dialog";
import ConfirmationAlertDialog from "@/components/ui/confirmation-alert-dialog";
import { IPatient } from "@/services/patientsApi";

const ReportCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDoctor } = useAuth();
  // Set only when arriving from a patient's profile via "New report" — carries
  // the already-selected patient so the create form skips straight past search.
  const preselectedPatient = (location.state as { patient?: IPatient } | null)?.patient;
  const [reportData, setReportData] = useState({ preselectedPatient });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (reportData: any) => {
    try {
      setIsSubmitting(true);
      console.log("Report to submit:", reportData);
      const response = await api.createReport(reportData);
      console.log("Report response:", response);

      if (response.status === "pending") {
        // Technician created a report that needs verification
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      toast({
        title: "Error",
        description: "Failed to submit report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* {showDialog && (
        <ConfirmationAlertDialog
          showDialog={showDialog}
          handleConfirm={() => {
            setShowDialog(false);
            navigate("/dashboard");
          }}
          handleOnClose={() => setShowDialog(false)}
        />
      )} */}
      <div className="min-h-screen bg-background">
        <Navbar />
        <PageTransition>
          <div className="page-container">
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Create New Report</h1>
              <p className="text-muted-foreground mt-1">
                {isDoctor()
                  ? "Create and verify a new laboratory report"
                  : "Create a new laboratory report for verification"}
              </p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Report Details</CardTitle>
                <CardDescription>
                  Fill in the required information to create a new report
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReportForm
                  reportData={reportData}
                  editMode={false}
                  onSubmit={handleSubmit}
                />
              </CardContent>
            </Card>
          </div>
        </PageTransition>
      </div>
    </>
  );
};

export default ReportCreation;
