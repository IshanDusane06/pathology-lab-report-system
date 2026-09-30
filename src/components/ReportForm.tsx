import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Save, Send } from "lucide-react";
import { reportTypesApi } from "@/services/reportTypesApi";
import PatientInfoCard from "@/components/report/PatientInfoCard";
import PatientPicker from "@/components/patient/PatientPicker";
import { IPatient } from "@/services/patientsApi";
import ReportSectionCard from "./report/ReportSectionCard";
import { debounce } from "lodash";
import { reportsApi, IReport, IParameter } from "../services/reportsApi";
import { useNavigate } from "react-router-dom";
import { groupParametersBySection } from "@/lib/reportSections";
import { FieldFormat } from "@/components/report/ReportFieldInput";
import RemarksEditor from "@/components/report/RemarksEditor";
import { stripHtmlForPlaceholder } from "@/lib/remarksHtml";
import { isParamValueEmpty } from "@/lib/paramValue";

export interface PatientInfo {
  name: string;
  referredBy: string;
  sex: string;
  age: string;
  date: string;
  reportType: string;
}

const ReportForm = ({ reportData, editMode, onSubmit }) => {
  const { user, isDoctor } = useAuth();
  const navigate = useNavigate();
  const [reportTypes, setReportTypes] = useState([]);
  const [reportType, setReportType] = useState(reportData?.reportType || "");
  const [patient, setPatient] = useState(reportData?.patient || "");
  const [patientInfo, setPatientInfo] = useState(
    reportData?.patientInfo || {
      name: reportData?.preselectedPatient?.name || "",
      date: new Date().toISOString().split("T")[0],
      referredBy: "",
      sex: reportData?.preselectedPatient?.sex || "",
      age:
        reportData?.preselectedPatient?.age != null
          ? String(reportData.preselectedPatient.age)
          : "",
      reportType: "",
    }
  );
  // Separate from patientInfo on purpose — it's a top-level Report field
  // (outside the signed content hash) and must not be swept into
  // validatePatientInfo()'s required-field checks.
  const [patientEmail, setPatientEmail] = useState<string>(
    reportData?.patientEmail || reportData?.preselectedPatient?.email || ""
  );
  // The selected Patient record. Its identity fields are mirrored into
  // patientInfo below so the existing validation and the reference-range
  // logic (which reads patientInfo.sex/age) keep working untouched — but the
  // server rebuilds the snapshot from the patient record on save regardless,
  // so this mirror is for the UI, never the source of truth.
  const [selectedPatient, setSelectedPatient] = useState<IPatient | null>(
    reportData?.preselectedPatient || null
  );
  const [formValues, setFormValues] = useState(reportData?.formValues || {});
  const [formFormats, setFormFormats] = useState<Record<string, FieldFormat>>(
    reportData?.formFormats || {}
  );
  const [expandedSections, setExpandedSections] = useState(
    reportData?.expandedSections || {}
  );
  const [validationErrors, setValidationErrors] = useState(
    reportData?.validationErrors || {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remarks, setRemarks] = useState(reportData?.remarks || "");
  // Only used when the selected report type has sectionWiseRemarks enabled —
  // mutually exclusive with `remarks` above; keyed by section key.
  const [sectionRemarks, setSectionRemarks] = useState<Record<string, string>>(
    reportData?.sectionRemarks || {}
  );

  const reportTypeObj = useMemo(
    () =>
      reportTypes.find(
        (rt) =>
          rt._id === patientInfo.reportType ||
          rt.code === patientInfo.reportType
      ),
    [reportTypes, patientInfo.reportType]
  );

  useEffect(() => {
    const saved = localStorage.getItem("reportFormDraft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setReportType(parsed.reportType);
        setPatient(parsed.patient);
        // Identity comes from the selected patient, which is not persisted in
        // the draft — restoring a previous patient's name/sex/age into a fresh
        // form is how one person's details end up on another's report. When a
        // patient was preselected (arriving from their profile), their
        // identity wins instead of being blanked.
        setPatientInfo({
          ...parsed.patientInfo,
          name: reportData?.preselectedPatient?.name || "",
          sex: reportData?.preselectedPatient?.sex || "",
          age:
            reportData?.preselectedPatient?.age != null
              ? String(reportData.preselectedPatient.age)
              : "",
        });
        setFormValues(parsed.formValues);

        // Optionally expand sections from report type
        const foundType = reportTypes.find(
          (rt) => rt.code === parsed.reportType || rt._id === parsed.reportType
        );
        if (foundType) {
          const expanded = {};
          foundType.parameters.forEach((p) => {
            expanded[p.section] = true;
          });
          setExpandedSections(expanded);
        }

        console.log("✅ Loaded saved draft:", parsed);
      } catch (err) {
        console.error("❌ Failed to parse saved draft:", err);
      }
    }
  }, [reportTypes]);

  const groupedSections = useMemo(
    () => groupParametersBySection(reportTypeObj?.parameters, reportTypeObj?.sections),
    [reportTypeObj]
  );

  const handleChange = useCallback((paramName, value) => {
    setFormValues((prev) => ({ ...prev, [paramName]: value }));
  }, []);

  const handleFormatChange = useCallback((paramName: string, format: FieldFormat) => {
    setFormFormats((prev) => ({ ...prev, [paramName]: format }));
  }, []);

  const handleSectionRemarksChange = useCallback((sectionKey: string, html: string) => {
    setSectionRemarks((prev) => ({ ...prev, [sectionKey]: html }));
  }, []);

  const handleToggleSection = useCallback((section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleSelectReportType = useCallback(
    (value) => {
      setReportType(value);
      const selectedType = reportTypes.find((rt) => rt.code === value);
      const sections: Record<string, boolean> = {};
      if (selectedType) {
        selectedType.parameters.forEach((param) => {
          sections[param.section] = true;
        });
      }
      setExpandedSections(sections);
      setFormValues({});
      setSectionRemarks({});
      setPatientInfo((prev) => ({ ...prev, reportType: value }));
    },
    [reportTypes]
  );

  // Mirror the chosen patient's identity into the form. Date and referredBy
  // are deliberately left alone — they're facts about this visit, not about
  // the person, and a returning patient is routinely referred by someone new.
  const handleSelectPatient = (patient: IPatient | null) => {
    setSelectedPatient(patient);
    if (!patient) return;
    setPatientInfo((prev) => ({
      ...prev,
      name: patient.name,
      sex: patient.sex,
      age: patient.age != null ? String(patient.age) : "",
    }));
    if (patient.email && !patientEmail) setPatientEmail(patient.email);
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next.patient;
      delete next.name;
      delete next.sex;
      delete next.age;
      return next;
    });
  };

  const validatePatientInfo = () => {
    const errors: Record<string, string> = {};
    if (!selectedPatient) errors.patient = "Select a patient, or create one, before saving";
    if (!patientInfo.name.trim()) errors.name = "Patient name is required";
    if (!patientInfo.date) errors.date = "Date is required";
    if (!patientInfo.referredBy.trim())
      errors.referredBy = "Referring doctor is required";
    if (!patientInfo.sex) errors.sex = "Sex is required";
    if (
      !patientInfo.age ||
      isNaN(Number(patientInfo.age)) ||
      Number(patientInfo.age) <= 0
    ) {
      errors.age = "Valid age is required";
    }
    if (!patientInfo.reportType) errors.reportType = "Report type is required";
    return errors;
  };

  // Shared validation + payload-building for both Save and Submit — returns
  // null (and sets validationErrors) if the form isn't ready to send.
  const buildReportData = (): IReport | null => {
    const patientErrors = validatePatientInfo();
    const formErrors: Record<string, string> = {};

    const parameters: IParameter[] = groupedSections
      .flatMap((section) => section.parameters)
      .map((param) => {
        if (param.isRequired && isParamValueEmpty(formValues[param.name])) {
          formErrors[param.name] = `${param.name} is required`;
        }
        const format = formFormats[param.name];
        return {
          name: param.name,
          value: formValues[param.name],
          unit: param.unit,
          section: param.section,
          notes: "",
          bold: !!format?.bold,
          italic: !!format?.italic,
          underline: !!format?.underline,
        };
      });

    const allErrors = { ...patientErrors, ...formErrors };
    if (Object.keys(allErrors).length > 0) {
      setValidationErrors(allErrors);
      return null;
    }

    return {
      reportTypeId: reportTypeObj._id,
      reportTypeCode: reportType,
      parameters,
      technician: user.id,
      doctor: user.id,
      ...(reportTypeObj?.sectionWiseRemarks
        ? {
            sectionRemarks: Object.entries(sectionRemarks)
              .filter(([, html]) => !!html)
              .map(([sectionKey, remarksHtml]) => ({ sectionKey, remarks: remarksHtml })),
          }
        : { remarks }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      patientInfo,
      patientEmail: patientEmail.trim() || null,
      // The link. The server rebuilds patientInfo from this patient's record,
      // so the snapshot is authoritative rather than whatever the form held.
      patientId: selectedPatient?._id,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = buildReportData();
    if (!data) return;

    setIsSubmitting(true);
    try {
      await reportsApi.createReport(data);
      toast({ title: "Success", description: "Report saved as draft" });
      handleReset();
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to save report",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Creates the report, then immediately sends it on for doctor approval —
  // sparing the technician a separate trip back into the report to click
  // "Submit for Approval" there.
  const handleSaveAndSubmit = async () => {
    const data = buildReportData();
    if (!data) return;

    setIsSubmitting(true);
    try {
      const created = await reportsApi.createReport(data);
      await reportsApi.submitReport(created._id);
      toast({ title: "Submitted", description: "Report submitted for doctor approval." });
      handleReset();
      navigate(`/report/${created._id}`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to submit report",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // A Doctor creating their own report already has signing authority, so
  // there's no one else to route it to for approval — this creates and
  // finalizes it in one step, skipping the approval queue entirely.
  const handleCreateAndSign = async () => {
    const data = buildReportData();
    if (!data) return;

    setIsSubmitting(true);
    try {
      const created = await reportsApi.createReport(data);
      await reportsApi.finalizeReport(created._id);
      toast({ title: "Signed", description: "Report created and signed." });
      handleReset();
      navigate(`/report/${created._id}`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to sign report",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormValues({});
    setFormFormats({});
    setSectionRemarks({});
    setValidationErrors({});
    setReportType("");
    setPatient("");
    setSelectedPatient(null);
    setPatientEmail("");
    setPatientInfo({
      name: "",
      date: new Date().toISOString().split("T")[0],
      referredBy: "",
      sex: "",
      age: "",
      reportType: "",
    });
    localStorage.removeItem("reportFormDraft");
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const types = await reportTypesApi.getReportTypes();
        setReportTypes(types);
      } catch (err) {
        console.error(err);
        toast({
          title: "Error",
          description: "Failed to load report types",
          variant: "destructive",
        });
      }
    };
    fetch();
  }, []);

  const latestState = useRef({
    reportType,
    patient,
    patientInfo,
    formValues,
  });

  useEffect(() => {
    latestState.current = { reportType, patient, patientInfo, formValues };
  }, [reportType, patient, patientInfo, formValues]);

  const autosave = useCallback(() => {
    const { reportType, patient, patientInfo, formValues } =
      latestState.current;
    const draft = {
      reportType,
      patient,
      patientInfo,
      formValues,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("reportFormDraft", JSON.stringify(draft));
    console.log("Autosaved draft:", draft);
  }, []);

  const debouncedAutosave = useRef(debounce(autosave, 1500));

  useEffect(() => {
    debouncedAutosave.current();
  }, [formValues, patientInfo, reportType]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-semibold">Report Form</h2>

      <PatientPicker
        selected={selectedPatient}
        onSelect={handleSelectPatient}
        error={validationErrors.patient}
      />

      <PatientInfoCard
        lockIdentity={!!selectedPatient}
        patientInfo={patientInfo}
        onSelectReportType={(field, value) => {
          if (field === "reportType") {
            handleSelectReportType(value);
          } else {
            setPatientInfo((prev) => ({ ...prev, [field]: value }));
          }
        }}
        validationErrors={validationErrors}
        editMode={editMode}
        setPatientInfo={setPatientInfo}
        reportType={reportType}
        patient={patient}
        setPatient={setPatient}
        reportTypes={reportTypes}
        patientEmail={patientEmail}
        onPatientEmailChange={setPatientEmail}
      />

      {groupedSections.map((section) => (
        <React.Fragment key={section.key}>
          <ReportSectionCard
            key={section.key}
            sectionKey={section.title}
            parameters={section.parameters}
            expanded={!!expandedSections[section.key]}
            onToggle={() => handleToggleSection(section.key)}
            formValues={formValues}
            onChange={handleChange}
            errors={validationErrors}
            patientInfo={patientInfo}
            formFormats={formFormats}
            onFormatChange={handleFormatChange}
          />
          {reportTypeObj?.sectionWiseRemarks && section.remarksEnabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{section.title} — Remarks</CardTitle>
              </CardHeader>
              <CardContent>
                <RemarksEditor
                  value={sectionRemarks[section.key] || ""}
                  onChange={(html) => handleSectionRemarksChange(section.key, html)}
                  placeholder={
                    stripHtmlForPlaceholder(section.defaultRemarks) ||
                    "Optional — leave blank to use the template's default remarks for this section, if any."
                  }
                />
              </CardContent>
            </Card>
          )}
        </React.Fragment>
      ))}

      {reportTypeObj && !reportTypeObj.sectionWiseRemarks && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <RemarksEditor
              value={remarks}
              onChange={setRemarks}
              placeholder={
                stripHtmlForPlaceholder(reportTypeObj?.defaultRemarks) ||
                "Optional — leave blank to use the template's default remarks, if any."
              }
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={handleReset}>
          Reset
        </Button>
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Save className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>
        {isDoctor() ? (
          <Button type="button" onClick={handleCreateAndSign} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Send className="mr-2 h-4 w-4 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Sign
              </>
            )}
          </Button>
        ) : (
          <Button type="button" onClick={handleSaveAndSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Send className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit for Approval
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  );
};

export default ReportForm;
