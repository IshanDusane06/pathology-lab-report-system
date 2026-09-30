import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  FileEdit,
  MessageSquareWarning,
  XCircle,
} from "lucide-react";

export type ReportStatusValue =
  | "draft"
  | "pendingApproval"
  | "signed"
  | "changesRequested"
  | "rejected";

export const STATUS_CONFIG: Record<
  ReportStatusValue,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    className: "bg-slate-50 text-slate-700 border-slate-200",
    icon: <FileEdit size={14} />,
  },
  pendingApproval: {
    label: "Pending Doctor Approval",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: <Clock size={14} />,
  },
  signed: {
    label: "Signed",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: <CheckCircle size={14} />,
  },
  changesRequested: {
    label: "Changes Requested",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    icon: <MessageSquareWarning size={14} />,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: <XCircle size={14} />,
  },
};

interface ReportStatusBadgeProps {
  status: ReportStatusValue;
  className?: string;
}

const ReportStatusBadge: React.FC<ReportStatusBadgeProps> = ({
  status,
  className,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 w-fit ${config.className} ${className || ""}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
};

export default ReportStatusBadge;
