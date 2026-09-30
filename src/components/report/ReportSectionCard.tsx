import React from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import ReportFieldInput, { FieldFormat } from "./ReportFieldInput";
import { Parameter } from "@/services/reportTypesApi";
import { IDatedReading, IBreakdownEntry } from "@/services/reportsApi";
import { PatientInfo } from "../ReportForm";

type ReportFieldValue = string | number | boolean | null | IDatedReading[] | IBreakdownEntry[];

type ReportFormValues = Record<string, ReportFieldValue>;

interface ReportSectionCardProps {
  key: string;
  sectionKey: string;
  parameters: Parameter[];
  expanded: boolean;
  onToggle: () => void;
  formValues: ReportFormValues;
  onChange: (
    // section: string,
    paramName: string,
    value: ReportFieldValue
  ) => void;
  errors: Record<string, string>;
  patientInfo: PatientInfo;
  formFormats?: Record<string, FieldFormat>;
  onFormatChange?: (paramName: string, format: FieldFormat) => void;
}

// const ReportSectionCard: React.FC<ReportSectionCardProps> = ({
//   sectionKey,
//   parameters,
//   expanded,
//   onToggle,
//   formValues,
//   onChange,
//   errors,
//   patientInfo,
//   getNormalValues
// }) => {
//   return (
//     <Card key={sectionKey} className="overflow-hidden">
//       <CardHeader
//         className="py-3 cursor-pointer bg-muted/30"
//         onClick={onToggle}
//       >
//         <div className="flex items-center justify-between">
//           <CardTitle className="text-md font-medium flex items-center gap-2">
//             {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
//             {sectionKey}
//           </CardTitle>
//         </div>
//       </CardHeader>

//       {expanded && (
//         <CardContent className="pt-4">
//           <motion.div
//             initial={{ opacity: 0, height: 0 }}
//             animate={{ opacity: 1, height: 'auto' }}
//             exit={{ opacity: 0, height: 0 }}
//             transition={{ duration: 0.2 }}
//             className="space-y-4"
//           >
//             {parameters.map((param) => (
//               <div key={param.name} className="form-group">
//                 <Label htmlFor={param.name} className="form-label">
//                   {param.name}
//                 </Label>
//                 <ReportFieldInput
//                   field={param}
//                   value={formValues[param.name] || ''}
//                   onChange={(value) => onChange(sectionKey, param.name, value)}
//                   disabled={false}
//                 />
//               </div>
//             ))}
//           </motion.div>
//         </CardContent>
//       )}
//     </Card>
//   );
// };

// export default ReportSectionCard;

const ReportSectionCard: React.FC<ReportSectionCardProps> = ({
  sectionKey,
  parameters,
  expanded,
  onToggle,
  formValues,
  onChange,
  errors,
  patientInfo,
  formFormats,
  onFormatChange,
}) => {

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="py-3 cursor-pointer bg-muted/30"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-md font-medium flex items-center gap-2">
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            {sectionKey}
          </CardTitle>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-4">
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {parameters.map((param) => (
              <div key={param.name} className="form-group">
                <Label htmlFor={param.name} className="form-label">
                  {param.name}
                </Label>
                <ReportFieldInput
                  field={param}
                  value={formValues[param.name] ?? (param.type === "datedReadings" || param.type === "breakdown" ? [] : "")}
                  // onChange={(value) => onChange(sectionKey, param.name, value)}
                  onChange={onChange}
                  disabled={false}
                  format={formFormats?.[param.name]}
                  onFormatChange={
                    onFormatChange ? (format) => onFormatChange(param.name, format) : undefined
                  }
                  patientSex={patientInfo?.sex}
                  patientAge={patientInfo?.age}
                />
              </div>
            ))}
          </motion.div>
        </CardContent>
      )}
    </Card>
  );
};

export default React.memo(ReportSectionCard);
