import React from "react";
import { IReport, IPersonRef, IDatedReading, IBreakdownEntry } from "@/services/reportsApi";
import { ReportType, Parameter } from "@/services/reportTypesApi";
import { LabSettings } from "@/services/labSettingsApi";
import ReportSignatureBlock from "./ReportSignatureBlock";
import ReportLetterheadHeader from "./ReportLetterheadHeader";
import { groupParametersBySection, GroupedSection } from "@/lib/reportSections";
import { toRemarksHtml } from "@/lib/remarksHtml";
import { selectNormalValue } from "@/lib/normalRange";
import { isParamValueEmpty } from "@/lib/paramValue";

interface ReportReadOnlyViewProps {
  report: IReport;
  reportType: ReportType | null;
  labSettings?: LabSettings | null;
}

// Fixed-width columns (including the last one) so every row has the same
// total width regardless of content — that's what lets the whole row block
// be centered as one consistent unit via mx-auto below, while the
// label/colon/value alignment relative to each other stays untouched.
// Total width (14+1+10+12=37rem) is shared with SECTION_HEADER_WIDTH so a
// section title lines up with where "Volume" starts, not independently
// centered against a different width.
const ROW_GRID =
  "grid grid-cols-[14rem_1rem_10rem_12rem] gap-x-1 text-left w-[37rem] mx-auto";
const SECTION_HEADER_WIDTH = "w-[37rem] mx-auto text-left";

function asPerson(
  p: IPersonRef | string | undefined | null,
): IPersonRef | null {
  if (!p || typeof p === "string") return null;
  return p;
}

// Boolean/select parameters (Present/Absent, Positive/Negative, etc.) never
// show a reference range in the real paper reports — the value itself is the
// whole finding. `referenceRangeText` on those types only records the
// "expected/normal" label for abnormal-flagging purposes, not something to
// print, so it's deliberately ignored here.
function formatNormalRange(param: Parameter, sex?: string, age?: string | number): string {
  if (
    param.type === "boolean" ||
    param.type === "select" ||
    param.type === "paragraph" ||
    param.type === "datedReadings" ||
    param.type === "breakdown"
  )
    return "—";
  if (param.referenceRangeText) return param.referenceRangeText;
  const nv = selectNormalValue(param.normalValues, sex, age);
  if (
    !nv ||
    nv.min === undefined ||
    nv.min === null ||
    nv.max === undefined ||
    nv.max === null
  ) {
    return "—";
  }
  return `${nv.min} - ${nv.max}${nv.unit ? ` ${nv.unit}` : ""}`;
}

// Per-report formatting (chosen by whoever filled in this value), not a
// template rule — read directly off the report's own saved parameter.
function valueFormatClassName(
  found: IReport["parameters"][number] | undefined,
): string {
  if (!found) return "";
  return [
    found.bold && "font-bold",
    found.italic && "italic",
    found.underline && "underline",
  ]
    .filter(Boolean)
    .join(" ");
}

function hasValue(found: IReport["parameters"][number] | undefined): boolean {
  return found !== undefined && !isParamValueEmpty(found.value);
}

// Shared by the global remarks block and each section's own remarks block
// (section-wise mode) — same look either way, just scoped differently.
const RemarksBlock: React.FC<{ html: string }> = ({ html }) => (
  <div className="space-y-1">
    <p className="italic uppercase">Remarks :</p>
    <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: html }} />
  </div>
);

function isAbnormal(param: Parameter, value: unknown, sex?: string, age?: string | number): boolean {
  const nv = selectNormalValue(param.normalValues, sex, age);
  if (
    !nv ||
    nv.min === undefined ||
    nv.min === null ||
    nv.max === undefined ||
    nv.max === null
  ) {
    return false;
  }
  const numValue = Number(value);
  if (value === undefined || value === null || value === "" || isNaN(numValue))
    return false;
  return numValue < nv.min || numValue > nv.max;
}

// One field of the patient-info box, reproducing the paper form's "value
// typed above a dashed blank line" look via a flexible dashed rule instead of
// literal counted dashes. Shared by all five fields (Name, Date, Referred By,
// Sex, Age) so they render consistently; `suffix` is for a trailing word
// after the blank line (e.g. Age's "Years"), which the other four don't use.
const PatientInfoField: React.FC<{
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
}> = ({ label, value, suffix }) => (
  <div>
    <p className="text-center text-sm">{value}</p>
    <p className="flex items-baseline gap-1 whitespace-nowrap">
      <span>{label} :</span>
      <span className="flex-1 border-b border-dashed border-foreground/60" />
      {suffix && <span>{suffix}</span>}
    </p>
  </div>
);

const ReportReadOnlyView: React.FC<ReportReadOnlyViewProps> = ({
  report,
  reportType,
  labSettings,
}) => {
  // Normal case: group the template's current parameter definitions by its
  // sections[] (real titles, real order). Fallback (no reportType, or a
  // reportType with zero parameters defined — e.g. orphaned/legacy data):
  // synthesize sections from the report's own saved values instead, since
  // there's no template to draw definitions from.
  const groupedSections: GroupedSection[] = reportType?.parameters?.length
    ? groupParametersBySection(reportType.parameters, reportType.sections)
    : Array.from(
        new Set((report.parameters || []).map((p) => p.section || "main")),
      ).map((key) => ({
        key,
        title: key,
        displayOrder: 0,
        parameters: (report.parameters || [])
          .filter((p) => (p.section || "main") === key)
          .map(
            (p): Parameter => ({
              name: p.name,
              description: "",
              unit: p.unit || "",
              type: "text",
              normalValues: [],
              isRequired: false,
              displayOrder: 0,
              section: key,
            }),
          ),
      }));

  const valueByName: Record<string, IReport["parameters"][number]> = {};
  (report.parameters || []).forEach((p) => {
    valueByName[p.name] = p;
  });

  // A section whose parameters were all left blank on this specific report
  // (e.g. Biochemical Test wasn't ordered for this patient) is dropped
  // entirely — header, dashed rule, and all — rather than printing a titled
  // block full of "—" placeholders. This is evaluated per report, not per
  // template: the same "Serum Electrolyte & Biochemical Test" type can print
  // with just Electrolyte, just Biochemical, or both, depending on what was
  // actually filled in.
  const visibleSections = groupedSections.filter(
    (s) => s.parameters.length > 0 && s.parameters.some((p) => hasValue(valueByName[p.name])),
  );

  // Only sections the admin actually defined on the template get a visible
  // header + dashed rule; parameters left in the implicit "main" bucket (no
  // section assigned) render as a flat list — matches how the real reports
  // only label sections that genuinely exist (e.g. CRP's un-named first
  // block vs. its explicit "Biochemistry Test" section) — keyed off whether
  // any parameter actually has a `section` value, not whether the template
  // separately registered matching sections[] metadata (admins commonly tag
  // a parameter's section without also filling in that metadata).
  //
  // Computed over `visibleSections`, not every template-defined section — a
  // ranged section that's actually hidden this time (all blank) must not
  // "claim" the header row and prevent it appearing above whichever ranged
  // section is actually shown.
  const patientSex = report.patientInfo?.sex;
  const patientAge = report.patientInfo?.age;

  const hasAnyRange = visibleSections.some((s) =>
    s.parameters.some((p) => formatNormalRange(p, patientSex, patientAge) !== "—"),
  );
  const firstRangedSectionKey = visibleSections.find((s) =>
    s.parameters.some((p) => formatNormalRange(p, patientSex, patientAge) !== "—"),
  )?.key;

  const activeSignature = [...(report.signatures || [])]
    .reverse()
    .find((s) => !s.invalidatedAt);
  const technician = asPerson(report.technician);
  const doctor = asPerson(report.doctor);

  return (
    <div className="report-document max-w-3xl mx-auto space-y-6 text-sm">
      <div className="no-print">
        <ReportLetterheadHeader
          labSettings={labSettings}
          reportTypeName={reportType?.name}
        />
      </div>

      <div className="border border-foreground/50 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-8">
          <PatientInfoField
            label="Patient's Name"
            value={report.patientInfo?.name || "—"}
          />
          <PatientInfoField
            label="Date"
            value={
              report.patientInfo?.date
                ? new Date(report.patientInfo.date).toLocaleDateString()
                : "—"
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-8">
          <PatientInfoField
            label="Referred By"
            value={report.patientInfo?.referredBy || "—"}
          />
          <PatientInfoField
            label="Sex"
            value={
              <span className="capitalize">
                {report.patientInfo?.sex || "—"}
              </span>
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-8">
          <PatientInfoField
            label="Age"
            value={report.patientInfo?.age || "—"}
            suffix="Years"
          />
        </div>
      </div>

      {reportType?.name && (
        <div className="text-center">
          <p className="font-bold uppercase tracking-wide">
            --- {reportType.name} ---
          </p>
          <div className="border-t border-dashed border-foreground/50 mt-1" />
        </div>
      )}

      {visibleSections.map((section) => {
        const paramDefs = section.parameters;
        const showSectionHeader = section.key !== "main";
        const showColumnHeader =
          hasAnyRange && section.key === firstRangedSectionKey;
        const sectionRemarksHtml =
          reportType?.sectionWiseRemarks && section.remarksEnabled
            ? report.sectionRemarks?.find((sr) => sr.sectionKey === section.key)?.remarks ||
              section.defaultRemarks
            : null;
        return (
          <div key={section.key} className="report-section space-y-1">
            {showSectionHeader && (
              <div className={SECTION_HEADER_WIDTH}>
                <div className="inline-block">
                  <p className="font-bold uppercase">{section.title.trim()} :</p>
                  <div className="border-t border-dashed border-foreground/50 mb-3" />
                </div>
              </div>
            )}
            {showColumnHeader && (
              <div
                className={`${ROW_GRID} text-xs font-semibold uppercase text-muted-foreground pb-1`}
              >
                <span className="col-span-2 border-b border-dashed border-muted-foreground/50 pb-0.5">
                  Investigations
                </span>
                <span className="border-b border-dashed border-muted-foreground/50 pb-0.5">
                  Findings
                </span>
                <span className="border-b border-dashed border-muted-foreground/50 pb-0.5">
                  Reference Range
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {paramDefs.map((paramDef) => {
                const found = valueByName[paramDef.name];
                const rowHasValue = hasValue(found);

                // Free-running rich text, no label/colon/range — just the
                // formatted value, same as the section-wise remarks block,
                // and likewise omitted entirely when blank rather than
                // shown as a labeled empty row (there's no label to anchor
                // an empty state to here).
                if (paramDef.type === "paragraph") {
                  if (!rowHasValue) return null;
                  return (
                    <div
                      key={paramDef.name}
                      className={`${SECTION_HEADER_WIDTH} py-0.5`}
                      dangerouslySetInnerHTML={{ __html: toRemarksHtml(String(found.value)) }}
                    />
                  );
                }

                // The same measurement recorded on more than one date — one
                // line per reading, sorted by date, in the same bare
                // free-running-text style as paragraph (no label/colon/range;
                // the reading's own text carries the meaning).
                if (paramDef.type === "datedReadings") {
                  if (!rowHasValue) return null;
                  const readings = (Array.isArray(found.value) ? found.value : []) as IDatedReading[];
                  const sorted = [...readings]
                    .filter((r) => String(r?.value ?? "").trim() !== "")
                    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
                  return (
                    <div key={paramDef.name} className={`${SECTION_HEADER_WIDTH} space-y-1.5 py-0.5`}>
                      {sorted.map((reading, i) => (
                        // A reading's rich text (from RemarksEditor) can
                        // contain block elements (<div>/<br>), so the date
                        // label gets its own line rather than sharing a <p>
                        // with dangerouslySetInnerHTML content — nesting a
                        // block element inside inline text is invalid HTML.
                        <div key={i}>
                          <p className="font-semibold">
                            {reading.date ? new Date(reading.date).toLocaleDateString() : "—"}
                          </p>
                          <div dangerouslySetInnerHTML={{ __html: toRemarksHtml(reading.value) }} />
                        </div>
                      ))}
                    </div>
                  );
                }

                // A fixed, admin-defined set of named sub-values (e.g.
                // Motility: Actively Motile / Sluggishly Motile / Non
                // Motile) — one line per sub-field, in the template's own
                // order (not save order), sharing the parameter's name/colon
                // the way the mockup shows: name once on the first line,
                // colon repeated, "label - value unit" per line.
                if (paramDef.type === "breakdown") {
                  if (!rowHasValue) return null;
                  const entries = (Array.isArray(found.value) ? found.value : []) as IBreakdownEntry[];
                  const valueByLabel = new Map(entries.map((e) => [e.label, e.value]));
                  const rows = (paramDef.subFields || [])
                    .map((sf) => ({ sf, value: valueByLabel.get(sf.label) }))
                    .filter(({ value }) => String(value ?? "").trim() !== "");
                  if (!rows.length) return null;
                  return (
                    <React.Fragment key={paramDef.name}>
                      {rows.map(({ sf, value: subValue }, i) => (
                        <div key={sf.label} className={`${ROW_GRID} py-0.5`}>
                          <span>{i === 0 ? paramDef.name : ""}</span>
                          <span>:</span>
                          <span className="col-span-2">
                            {sf.label} - {subValue}
                            {sf.unit ? ` ${sf.unit}` : ""}
                          </span>
                        </div>
                      ))}
                    </React.Fragment>
                  );
                }

                const abnormal = rowHasValue && isAbnormal(paramDef, found.value, patientSex, patientAge);
                const range = formatNormalRange(paramDef, patientSex, patientAge);
                const cellClassName = [
                  abnormal && "font-bold",
                  valueFormatClassName(found),
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={paramDef.name} className={`${ROW_GRID} py-0.5`}>
                    <span>{paramDef.name}</span>
                    <span>:</span>
                    <span className={cellClassName || undefined}>
                      {rowHasValue
                        ? `${found.value}${paramDef.unit ? ` ${paramDef.unit}` : ""}`
                        : "—"}
                    </span>
                    <span className="text-muted-foreground">
                      {range !== "—" ? `(${range})` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            {reportType?.sectionWiseMethod && section.method && (
              <p className="italic">
                <span className="font-semibold not-italic">Method</span> : {section.method}
              </p>
            )}
            {sectionRemarksHtml && <RemarksBlock html={toRemarksHtml(sectionRemarksHtml)} />}
          </div>
        );
      })}

      {report.status?.remarks && (
        <div className="space-y-1">
          <p className="font-bold uppercase">
            {report.status.value === "rejected"
              ? "Reason for Rejection"
              : report.status.value === "changesRequested"
                ? "Requested Changes"
                : "Doctor's Note"}{" "}
            :
          </p>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {report.status.remarks}
          </p>
        </div>
      )}

      {!reportType?.sectionWiseMethod && reportType?.method && (
        <p className="italic">
          <span className="font-semibold not-italic">Method</span> :{" "}
          {reportType.method}
        </p>
      )}

      {/* Mutually exclusive with the per-section remarks rendered inside the
          section loop above — a template is in exactly one mode. */}
      {!reportType?.sectionWiseRemarks && (report.remarks || reportType?.defaultRemarks) && (
        <RemarksBlock html={toRemarksHtml(report.remarks || reportType?.defaultRemarks)} />
      )}

      {(technician?.name || doctor?.name) && (
        <div className="no-print grid grid-cols-2 gap-6 pt-6 break-inside-avoid">
          <ReportSignatureBlock
            role="Doctor"
            person={doctor}
            signedAt={activeSignature?.signedAt}
            verificationCode={
              activeSignature?.hmac
                ? activeSignature.hmac.slice(0, 12)
                : undefined
            }
          />
          <ReportSignatureBlock role="Technician" person={technician} />
        </div>
      )}
    </div>
  );
};

export default ReportReadOnlyView;
