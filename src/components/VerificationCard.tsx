import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Clock, FileText } from "lucide-react";
import { HoverCard } from "@/utils/animations";

interface VerificationCardProps {
  report: {
    id: string;
    reportType: string;
    patientName: string;
    technician: string;
    createdAt: string;
    remarks?: string;
  };
}

const VerificationCard: React.FC<VerificationCardProps> = ({ report }) => {
  const navigate = useNavigate();

  const getReportTypeName = (id: string) => {
    const reportTypes = {
      cbc: "Complete Blood Count",
      hiv: "HIV Test",
      liver: "Liver Function Test",
      kidney: "Kidney Function Test",
      thyroid: "Thyroid Function Test",
      lipid: "Lipid Profile",
    };
    return reportTypes[id as keyof typeof reportTypes] || id;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleReview = () => {
    navigate(`/report/${report.id}`);
  };

  return (
    <HoverCard>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">{report.patientName}</CardTitle>
              <CardDescription className="mt-1">
                {getReportTypeName(report.reportType)}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1"
            >
              <Clock size={14} /> Pending verification
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pb-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Created by:</span>
              <p>{report.technician}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>
              <p>{formatDate(report.createdAt)}</p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-2">
          <Button onClick={handleReview} className="gap-1.5 w-full">
            <FileText size={14} />
            Review Report
          </Button>
        </CardFooter>
      </Card>
    </HoverCard>
  );
};

export default VerificationCard;
