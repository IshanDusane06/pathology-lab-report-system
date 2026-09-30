import React from "react";
import { LabSettings } from "@/services/labSettingsApi";

interface ReportLetterheadHeaderProps {
  labSettings: LabSettings | null;
  reportTypeName?: string;
}

const ReportLetterheadHeader: React.FC<ReportLetterheadHeaderProps> = ({
  labSettings,
  reportTypeName,
}) => {
  if (!labSettings?.labName) return null;

  return (
    <div className="text-center border-b border-border pb-4 mb-2">
      <h1 className="text-2xl font-bold">{labSettings.labName}</h1>
      {labSettings.tagline && (
        <p className="text-sm font-semibold italic">{labSettings.tagline}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {[labSettings.address, labSettings.registrationNumber && `Reg. No. ${labSettings.registrationNumber}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {reportTypeName && (
        <p className="text-base font-semibold uppercase tracking-wide mt-3">{reportTypeName}</p>
      )}
    </div>
  );
};

export default ReportLetterheadHeader;
