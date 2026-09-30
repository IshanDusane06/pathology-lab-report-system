import React from "react";
import { BadgeCheck } from "lucide-react";

interface SignatureInfo {
  name?: string;
  qualification?: string | null;
  registrationNumber?: string | null;
}

interface ReportSignatureBlockProps {
  role: "Doctor" | "Technician";
  person?: SignatureInfo | null;
  signedAt?: string | null;
  verificationCode?: string | null; // short signature reference, doctor only
}

const ReportSignatureBlock: React.FC<ReportSignatureBlockProps> = ({
  role,
  person,
  signedAt,
  verificationCode,
}) => {
  if (!person?.name) return null;

  return (
    <div className="text-sm break-inside-avoid">
      {verificationCode && (
        <div className="flex items-center gap-1.5 text-green-700 text-xs mb-1">
          <BadgeCheck size={14} />
          Digitally Verified
        </div>
      )}
      <p className="font-medium">{person.name}</p>
      {person.qualification && (
        <p className="text-muted-foreground text-xs">{person.qualification}</p>
      )}
      {person.registrationNumber && (
        <p className="text-muted-foreground text-xs">Reg.No. {person.registrationNumber}</p>
      )}
      <p className="text-muted-foreground text-xs mt-1">
        {role === "Doctor" ? "Pathologist" : "Prepared by"}
      </p>
      {signedAt && (
        <p className="text-muted-foreground text-xs">
          {new Date(signedAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {verificationCode && (
        <p className="text-muted-foreground text-[10px] mt-1 font-mono">
          Ref: {verificationCode}
        </p>
      )}
    </div>
  );
};

export default ReportSignatureBlock;
