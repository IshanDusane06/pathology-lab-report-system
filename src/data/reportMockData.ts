
// Mock data for different report types
export const REPORT_TYPES = [
  { id: 'cbc', name: 'Complete Blood Count (CBC)' },
  { id: 'hiv', name: 'HIV Test' },
  { id: 'liver', name: 'Liver Function Test' },
  { id: 'kidney', name: 'Kidney Function Test' },
  { id: 'thyroid', name: 'Thyroid Function Test' },
  { id: 'lipid', name: 'Lipid Profile' },
];

// Mock field data that would come from backend
export const REPORT_FIELDS = {
  cbc: [
    { id: 'wbc', label: 'White Blood Cell Count (WBC)', unit: 'K/µL', min: 4.5, max: 11.0 },
    { id: 'rbc', label: 'Red Blood Cell Count (RBC)', unit: 'M/µL', min: 4.5, max: 5.9 },
    { id: 'hgb', label: 'Hemoglobin (HGB)', unit: 'g/dL', min: 13.5, max: 17.5 },
    { id: 'hct', label: 'Hematocrit (HCT)', unit: '%', min: 41, max: 50 },
    { id: 'plt', label: 'Platelet Count (PLT)', unit: 'K/µL', min: 150, max: 450 },
  ],
  hiv: [
    { id: 'hiv_result', label: 'HIV Antibody Test', unit: '', min: null, max: null, options: ['Negative', 'Positive', 'Indeterminate'] },
    { id: 'hiv_comment', label: 'Additional Comments', unit: '', min: null, max: null },
  ],
  liver: [
    { id: 'alt', label: 'Alanine Aminotransferase (ALT)', unit: 'U/L', min: 7, max: 56 },
    { id: 'ast', label: 'Aspartate Aminotransferase (AST)', unit: 'U/L', min: 10, max: 40 },
    { id: 'alp', label: 'Alkaline Phosphatase (ALP)', unit: 'U/L', min: 44, max: 147 },
    { id: 'ggt', label: 'Gamma-Glutamyl Transferase (GGT)', unit: 'U/L', min: 3, max: 95 },
    { id: 'bil_total', label: 'Total Bilirubin', unit: 'mg/dL', min: 0.1, max: 1.2 },
  ],
  kidney: [
    { id: 'bun', label: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', min: 7, max: 20 },
    { id: 'creatinine', label: 'Creatinine', unit: 'mg/dL', min: 0.6, max: 1.2 },
    { id: 'egfr', label: 'Estimated GFR', unit: 'mL/min/1.73m²', min: 90, max: null },
    { id: 'sodium', label: 'Sodium', unit: 'mmol/L', min: 135, max: 145 },
    { id: 'potassium', label: 'Potassium', unit: 'mmol/L', min: 3.5, max: 5.0 },
  ],
  thyroid: [
    { id: 'tsh', label: 'Thyroid Stimulating Hormone (TSH)', unit: 'µIU/mL', min: 0.4, max: 4.0 },
    { id: 't4', label: 'Thyroxine (T4)', unit: 'µg/dL', min: 4.5, max: 11.7 },
    { id: 't3', label: 'Triiodothyronine (T3)', unit: 'ng/dL', min: 80, max: 200 },
  ],
  lipid: [
    { id: 'total_cholesterol', label: 'Total Cholesterol', unit: 'mg/dL', min: null, max: 200 },
    { id: 'triglycerides', label: 'Triglycerides', unit: 'mg/dL', min: null, max: 150 },
    { id: 'hdl', label: 'HDL Cholesterol', unit: 'mg/dL', min: 40, max: null },
    { id: 'ldl', label: 'LDL Cholesterol', unit: 'mg/dL', min: null, max: 100 },
  ],
};

// Patient mock data
export const PATIENTS = [
  { id: 'p1', name: 'John Doe', age: 45, gender: 'Male' },
  { id: 'p2', name: 'Jane Smith', age: 32, gender: 'Female' },
  { id: 'p3', name: 'Robert Johnson', age: 56, gender: 'Male' },
  { id: 'p4', name: 'Emily Davis', age: 28, gender: 'Female' },
];
