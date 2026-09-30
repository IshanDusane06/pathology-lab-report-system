
// import React from 'react';
// import { Input } from '@/components/ui/input';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';

// interface ReportFieldInputProps {
//   field: any;
//   value: any;
//   onChange: (fieldId: string, value: any) => void;
//   disabled: boolean;
// }

// const ReportFieldInput: React.FC<ReportFieldInputProps> = ({ 
//   field, 
//   value, 
//   onChange, 
//   disabled 
// }) => {
//   const getStatusForValue = (field: any, value: number | string) => {
//     if (field.options) return 'normal'; // Option fields don't have range status
//     if (value === '' || value === null || value === undefined) return '';
    
//     const numValue = Number(value);
//     if (isNaN(numValue)) return '';
    
//     if (field.min !== null && numValue < field.min) return 'low';
//     if (field.max !== null && numValue > field.max) return 'high';
//     return 'normal';
//   };

//   const status = getStatusForValue(field, value);

//   if (field.options) {
//     return (
//       <Select
//         value={value}
//         onValueChange={(val) => onChange(field.id, val)}
//         disabled={disabled}
//       >
//         <SelectTrigger className="w-full">
//           <SelectValue placeholder="Select an option" />
//         </SelectTrigger>
//         <SelectContent>
//           {field.options.map((option: string) => (
//             <SelectItem key={option} value={option}>
//               {option}
//             </SelectItem>
//           ))}
//         </SelectContent>
//       </Select>
//     );
//   }
  
//   return (
//     <div className="flex items-center space-x-2">
//       <Input
//         value={value}
//         onChange={(e) => onChange(field.id, e.target.value)}
//         className={`flex-1 ${
//           status === 'low' ? 'border-blue-400 bg-blue-50' :
//           status === 'high' ? 'border-red-400 bg-red-50' :
//           status === 'normal' ? 'border-green-400 bg-green-50' : ''
//         }`}
//         disabled={disabled}
//         type={field.unit ? 'number' : 'text'}
//         step={field.unit ? '0.01' : undefined}
//       />
//       {field.unit && <span className="text-sm text-muted-foreground w-14">{field.unit}</span>}
//       {(field.min !== null || field.max !== null) && (
//         <span className="text-xs text-muted-foreground w-28">
//           {field.min !== null && field.max !== null
//             ? `${field.min} - ${field.max}`
//             : field.min !== null
//             ? `Min: ${field.min}`
//             : `Max: ${field.max}`}
//         </span>
//       )}
//     </div>
//   );
// };

// export default ReportFieldInput;


// import React from 'react';
// import { Input } from '@/components/ui/input';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';
// import { Slider } from '@/components/ui/slider'; // For range type if available

interface ReportFieldInputProps {
  field: any;
  value: any;
  onChange: (fieldId: string, value: any) => void;
  disabled: boolean;
  format?: FieldFormat;
  onFormatChange?: (format: FieldFormat) => void;
  patientSex?: string;
  patientAge?: string | number;
}

// const ReportFieldInput: React.FC<ReportFieldInputProps> = ({
//   field,
//   value,
//   onChange,
//   disabled,
// }) => {
//   const normalRange = field.normalValues?.[0]; // Assuming only one normal range per parameter for now
//   const min = normalRange?.min ?? null;
//   const max = normalRange?.max ?? null;

//   const getStatusForValue = (val: number | string) => {
//     if (field.type === 'select') return 'normal';
//     if (val === '' || val === null || val === undefined) return '';
//     const numValue = Number(val);
//     if (isNaN(numValue)) return '';
//     if (min !== null && numValue < min) return 'low';
//     if (max !== null && numValue > max) return 'high';
//     return 'normal';
//   };

//   const status = getStatusForValue(value);

//   // Handle Select Field
//   if (field.type === 'select' && Array.isArray(field.options)) {
//     return (
//       <Select
//         value={value}
//         onValueChange={(val) => onChange(field._id || field.id, val)}
//         disabled={disabled}
//       >
//         <SelectTrigger className="w-full">
//           <SelectValue placeholder="Select an option" />
//         </SelectTrigger>
//         <SelectContent>
//           {field.options.map((option: string) => (
//             <SelectItem key={option} value={option}>
//               {option}
//             </SelectItem>
//           ))}
//         </SelectContent>
//       </Select>
//     );
//   }

//   // Handle Range Field
//   if (field.type === 'range' && min !== null && max !== null) {
//     return (
//       <div className="w-full">
//         <Slider
//           value={[Number(value) || min]}
//           onValueChange={([val]) => onChange(field._id || field.id, val)}
//           min={min}
//           max={max}
//           step={1}
//           disabled={disabled}
//         />
//         <div className="flex justify-between text-xs text-muted-foreground mt-1">
//           <span>{min}</span>
//           <span>{max}</span>
//         </div>
//       </div>
//     );
//   }

//   // Handle Text or Number Field
//   return (
//     <div className="flex items-center space-x-2">
//       <Input
//         value={value}
//         onChange={(e) => onChange(field._id || field.id, e.target.value)}
//         className={`flex-1 ${
//           status === 'low'
//             ? 'border-blue-400 bg-blue-50'
//             : status === 'high'
//             ? 'border-red-400 bg-red-50'
//             : status === 'normal'
//             ? 'border-green-400 bg-green-50'
//             : ''
//         }`}
//         disabled={disabled}
//         type={field.type === 'number' ? 'number' : 'text'}
//         step={field.type === 'number' ? '0.01' : undefined}
//       />
//       {field.unit && (
//         <span className="text-sm text-muted-foreground w-14">
//           {field.unit}
//         </span>
//       )}
//       {(min !== null || max !== null) && field.type === 'number' && (
//         <span className="text-xs text-muted-foreground w-28">
//           {min !== null && max !== null
//             ? `${min} - ${max}`
//             : min !== null
//             ? `Min: ${min}`
//             : `Max: ${max}`}
//         </span>
//       )}
//     </div>
//   );
// };

// export default ReportFieldInput;

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '@radix-ui/react-slider';
import { Input } from '../ui/input';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { Bold, Italic, Underline } from 'lucide-react';
import { selectNormalValue } from '@/lib/normalRange';
import RemarksEditor from './RemarksEditor';
import DatedReadingsField from './DatedReadingsField';
import BreakdownField from './BreakdownField';
import { IDatedReading, IBreakdownEntry } from '@/services/reportsApi';
// ... other imports ...

export interface FieldFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const FORMAT_KEYS: (keyof FieldFormat)[] = ['bold', 'italic', 'underline'];

function formatToValues(format?: FieldFormat): string[] {
  if (!format) return [];
  return FORMAT_KEYS.filter((key) => format[key]);
}

function formatClassName(format?: FieldFormat): string {
  if (!format) return '';
  return [format.bold && 'font-bold', format.italic && 'italic', format.underline && 'underline']
    .filter(Boolean)
    .join(' ');
}

// Bold/Italic/Underline toggles — lets whoever is filling in this specific
// report flag a value (e.g. "High", "Positive") as notable. This is a
// per-report choice, not a template-level rule.
const FormatToggles: React.FC<{
  format?: FieldFormat;
  onFormatChange?: (format: FieldFormat) => void;
  disabled?: boolean;
}> = ({ format, onFormatChange, disabled }) => {
  if (!onFormatChange) return null;
  return (
    <ToggleGroup
      type="multiple"
      size="sm"
      value={formatToValues(format)}
      onValueChange={(values: string[]) =>
        onFormatChange({
          bold: values.includes('bold'),
          italic: values.includes('italic'),
          underline: values.includes('underline'),
        })
      }
      disabled={disabled}
    >
      <ToggleGroupItem value="bold" aria-label="Bold">
        <Bold size={14} />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <Italic size={14} />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <Underline size={14} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

const ReportFieldInput: React.FC<ReportFieldInputProps> = ({
  field,
  value,
  onChange,
  disabled,
  format,
  onFormatChange,
  patientSex,
  patientAge,
}) => {
  const normalRange = selectNormalValue(field.normalValues, patientSex, patientAge);
  const min = normalRange?.min ?? null;
  const max = normalRange?.max ?? null;

  const getStatusForValue = (val: number | string) => {
    if (field.type === 'select' || field.type === 'boolean') return 'normal';
    if (val === '' || val === null || val === undefined) return '';
    const numValue = Number(val);
    if (isNaN(numValue)) return '';
    if (min !== null && numValue < min) return 'low';
    if (max !== null && numValue > max) return 'high';
    return 'normal';
  };

  const status = getStatusForValue(value);

  // Free-running rich text, no unit/range/per-value bold-italic-underline
  // toggle — formatting lives inside the HTML value itself, same mechanism
  // as Remarks (RemarksEditor's own toolbar), not the FormatToggles used
  // below for a single flat value.
  if (field.type === 'paragraph') {
    return (
      <RemarksEditor
        value={(value as string) || ''}
        onChange={(html) => onChange(field.name, html)}
        placeholder="Type this paragraph..."
        disabled={disabled}
      />
    );
  }

  // The same measurement, recorded again on one or more different dates —
  // e.g. a Mantoux test's Day 1/2/3 readings. Always calls back with the
  // whole updated array; no unit/range/FormatToggles apply, same as paragraph.
  if (field.type === 'datedReadings') {
    return (
      <DatedReadingsField
        value={(value as IDatedReading[]) || []}
        onChange={(next) => onChange(field.name, next)}
        disabled={disabled}
      />
    );
  }

  // A fixed, admin-defined set of named sub-values (e.g. Motility: Actively
  // Motile / Sluggishly Motile / Non Motile) — no add/remove here, the row
  // set comes straight from the template's own subFields. Same "always call
  // back with the whole array" contract as datedReadings.
  if (field.type === 'breakdown') {
    return (
      <BreakdownField
        subFields={field.subFields || []}
        value={(value as IBreakdownEntry[]) || []}
        onChange={(next) => onChange(field.name, next)}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'boolean') {
    const trueLabel = field.booleanLabels?.trueLabel || 'Positive';
    const falseLabel = field.booleanLabels?.falseLabel || 'Negative';
    return (
      <div className="flex items-center space-x-2">
        <Select
          value={value}
          onValueChange={(val) => onChange(field.name, val)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={trueLabel}>{trueLabel}</SelectItem>
            <SelectItem value={falseLabel}>{falseLabel}</SelectItem>
          </SelectContent>
        </Select>
        <FormatToggles format={format} onFormatChange={onFormatChange} disabled={disabled} />
      </div>
    );
  }

  if (field.type === 'select' && Array.isArray(field.options)) {
    return (
      <div className="flex items-center space-x-2">
        <Select
          value={value}
          onValueChange={(val) => onChange(field.name, val)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option: string) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormatToggles format={format} onFormatChange={onFormatChange} disabled={disabled} />
      </div>
    );
  }

  if (field.type === 'range' && min !== null && max !== null) {
    return (
      <div className="flex items-center space-x-2 w-full">
        <div className="flex-1">
          <Slider
            value={[Number(value) || min]}
            onValueChange={([val]) => onChange(field.name, val)}
            min={min}
            max={max}
            step={1}
            disabled={disabled}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>
        <FormatToggles format={format} onFormatChange={onFormatChange} disabled={disabled} />
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(field.name, e.target.value)}
        className={`flex-1 ${formatClassName(format)} ${
          status === 'low' || status === 'high'
            ? 'border-red-400 bg-red-50'
            : status === 'normal'
            ? 'border-green-400 bg-green-50'
            : ''
        }`}
        disabled={disabled}
        type={field.type === 'number' ? 'number' : 'text'}
        step={field.type === 'number' ? '0.01' : undefined}
      />
      {field.unit && (
        <span className="text-sm text-muted-foreground w-14">
          {field.unit}
        </span>
      )}
      {(min !== null || max !== null) && field.type === 'number' && (
        <span className="text-xs text-muted-foreground w-28">
          {min !== null && max !== null
            ? `${min} - ${max}`
            : min !== null
            ? `Min: ${min}`
            : `Max: ${max}`}
        </span>
      )}
      <FormatToggles format={format} onFormatChange={onFormatChange} disabled={disabled} />
    </div>
  );
};

export default React.memo(ReportFieldInput, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.field.name === next.field.name &&
    prev.format?.bold === next.format?.bold &&
    prev.format?.italic === next.format?.italic &&
    prev.format?.underline === next.format?.underline
  );
});
