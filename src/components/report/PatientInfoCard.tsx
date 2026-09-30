
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REPORT_TYPES } from '@/data/reportMockData';
import { AlertCircle } from 'lucide-react';
import { ReportType } from '@/services/reportTypesApi';

interface PatientInfo {
  name: string;
  referredBy: string;
  sex: string;
  age: string;
  date: string;
  reportType: string;
}

interface PatientInfoCardProps {
  patient: string;
  setPatient: (value: string) => void;
  reportType: string;
  onSelectReportType: (field: string, value: string) => void;
  editMode: boolean;
  patientInfo: PatientInfo;
  setPatientInfo: (info: PatientInfo) => void;
  validationErrors?: {[key: string]: string};
  reportTypes: ReportType[];
  // Locks only the report-type selector, independent of `editMode` (which
  // disables every other field). Used when reopening an existing report,
  // where patient info stays editable but changing the report type would
  // silently invalidate already-entered parameter values.
  lockReportType?: boolean;
  // Locks the identity fields (name, sex, age) because they are being driven
  // by a selected Patient record rather than typed here. They stay visible —
  // the technician should see exactly what will be snapshotted onto the
  // report — but correcting them means editing the patient, not the report.
  lockIdentity?: boolean;
  // Optional patient email, kept deliberately separate from patientInfo (see
  // the field's own comment below). The input renders only when a change
  // handler is supplied.
  patientEmail?: string | null;
  onPatientEmailChange?: (value: string) => void;
}

const PatientInfoCard: React.FC<PatientInfoCardProps> = ({
  patient,
  setPatient,
  reportType,
  onSelectReportType,
  editMode,
  patientInfo,
  setPatientInfo,
  reportTypes,
  validationErrors = {}, // Default to empty object if not provided
  lockReportType = false,
  lockIdentity = false,
  patientEmail,
  onPatientEmailChange
}) => {
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  const handlePatientInfoChange = (field: string, value: string) => {
    setPatientInfo({
      ...patientInfo,
      [field]: value
    });
    
    // Clear error when field is changed
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: ''
      });
    }
  };

  const validateField = (field: string, value: string): string => {
    if (!value.trim()) {
      return 'This field is required';
    }
    
    if (field === 'age') {
      if (isNaN(Number(value))) {
        return 'Age must be a number';
      }
      if (Number(value) <= 0 || Number(value) > 150) {
        return 'Please enter a valid age (1-150)';
      }
    }
    
    return '';
  };

  const validateAllFields = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    let isValid = true;
    
    for (const [field, value] of Object.entries(patientInfo)) {
      const errorMessage = validateField(field, value);
      if (errorMessage) {
        newErrors[field] = errorMessage;
        isValid = false;
      }
    }
    
    if (!reportType) {
      newErrors['reportType'] = 'Please select a report type';
      isValid = false;
    }
    
    setErrors(newErrors);
    return isValid;
  };

  // Expose validation method to parent
  React.useEffect(() => {
    interface WindowWithValidatePatientInfo extends Window {
      validatePatientInfo?: typeof validateAllFields;
    }

    if (window) {
      (window as WindowWithValidatePatientInfo).validatePatientInfo = validateAllFields;
    }
    
    return () => {
      if (window && (window as WindowWithValidatePatientInfo).validatePatientInfo) {
        delete (window as WindowWithValidatePatientInfo).validatePatientInfo;
      }
    };
  }, [patientInfo, reportType]);

  // Combine local errors with validation errors from parent
  const displayErrors = { ...errors, ...validationErrors };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Information</CardTitle>
        <CardDescription>Enter patient details and select report type</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <Label htmlFor="patientName" className="flex items-center gap-1">
              Patient Name <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="patientName"
              value={patientInfo.name}
              onChange={(e) => handlePatientInfoChange('name', e.target.value)}
              disabled={editMode || lockIdentity}
              placeholder="Enter patient name"
              required
              className={displayErrors.name ? 'border-red-500' : ''}
            />
            {displayErrors.name && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.name}
              </p>
            )}
          </div>
          
          <div className="form-group">
            <Label htmlFor="patientDate" className="flex items-center gap-1">
              Date <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="patientDate"
              type="date"
              value={patientInfo.date}
              onChange={(e) => handlePatientInfoChange('date', e.target.value)}
              disabled={editMode}
              required
              className={displayErrors.date ? 'border-red-500' : ''}
            />
            {displayErrors.date && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.date}
              </p>
            )}
          </div>
          
          <div className="form-group">
            <Label htmlFor="referredBy" className="flex items-center gap-1">
              Referred By <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="referredBy"
              value={patientInfo.referredBy}
              onChange={(e) => handlePatientInfoChange('referredBy', e.target.value)}
              disabled={editMode}
              placeholder="Referring doctor"
              required
              className={displayErrors.referredBy ? 'border-red-500' : ''}
            />
            {displayErrors.referredBy && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.referredBy}
              </p>
            )}
          </div>
          
          <div className="form-group">
            <Label htmlFor="patientSex" className="flex items-center gap-1">
              Sex <span className="text-red-500">*</span>
            </Label>
            <Select
              value={patientInfo.sex}
              onValueChange={(value) => handlePatientInfoChange('sex', value)}
              disabled={editMode || lockIdentity}
              required
            >
              <SelectTrigger className={displayErrors.sex ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {displayErrors.sex && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.sex}
              </p>
            )}
          </div>
          
          <div className="form-group">
            <Label htmlFor="patientAge" className="flex items-center gap-1">
              Age <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="patientAge"
              type="number"
              value={patientInfo.age}
              onChange={(e) => handlePatientInfoChange('age', e.target.value)}
              disabled={editMode || lockIdentity}
              placeholder="Patient age"
              required
              min="1"
              max="150"
              className={displayErrors.age ? 'border-red-500' : ''}
            />
            {displayErrors.age && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.age}
              </p>
            )}
          </div>
        
          {/* Communication only. Held outside the patientInfo object on
              purpose: it's a top-level Report field (kept out of the signed
              content hash), and validateAllFields() below treats every key of
              patientInfo as required — which would wrongly make this
              mandatory. Never rendered on the report, PDF, or WhatsApp. */}
          {onPatientEmailChange && (
            <div className="form-group">
              <Label htmlFor="patientEmail">Email (optional)</Label>
              <Input
                id="patientEmail"
                type="email"
                value={patientEmail || ''}
                onChange={(e) => onPatientEmailChange(e.target.value)}
                placeholder="patient@example.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used only to email this report. It never appears on the report itself.
              </p>
            </div>
          )}

          <div className="form-group">
            <Label htmlFor="reportType" className="flex items-center gap-1">
              Report Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={reportType}
              // onValueChange={(value) => handlePatientInfoChange('reportType', value)}
              onValueChange={(value) => onSelectReportType('reportType', value)}
              disabled={editMode || lockReportType}
              required
            >
              <SelectTrigger className={displayErrors.reportType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type._id} value={type.code}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {displayErrors.reportType && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {displayErrors.reportType}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientInfoCard;
