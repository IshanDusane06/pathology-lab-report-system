import { Parameter, Section } from "@/services/reportTypesApi";

export interface GroupedSection {
  key: string;
  title: string;
  displayOrder: number;
  parameters: Parameter[];
  // Section-wise remarks metadata (only meaningful when the template has
  // sectionWiseRemarks enabled) — carried through from sections[] so every
  // consumer of this grouping (read-only view, create/edit forms) can decide
  // whether this section gets its own remarks without a second lookup.
  remarksEnabled?: boolean;
  defaultRemarks?: string;
  // Section-wise method metadata (only meaningful when the template has
  // sectionWiseMethod enabled) — carried through the same way as the remarks
  // fields above, no per-report override to resolve.
  method?: string;
}

// Groups a report type's parameter *definitions* by its sections[], sorted by
// displayOrder, with real titles looked up from section metadata. A parameter
// tagged with a section key that has no matching sections[] entry still
// renders, titled by its raw key. Only returns sections that actually have at
// least one parameter — an empty defined section has nothing to show.
export function groupParametersBySection(
  parameters: Parameter[] | undefined,
  sections: Section[] | undefined
): GroupedSection[] {
  const paramsByKey: Record<string, Parameter[]> = {};
  (parameters || []).forEach((p) => {
    const key = p.section || "main";
    if (!paramsByKey[key]) paramsByKey[key] = [];
    paramsByKey[key].push(p);
  });

  const sectionMeta = new Map<string, Section>();
  (sections || []).forEach((s) => sectionMeta.set(s.key, s));

  return Object.keys(paramsByKey)
    .map((key) => {
      const meta = sectionMeta.get(key);
      return {
        key,
        title: meta?.title || key,
        displayOrder: meta?.displayOrder ?? 0,
        parameters: paramsByKey[key],
        remarksEnabled: meta?.remarksEnabled,
        defaultRemarks: meta?.defaultRemarks,
        method: meta?.method,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
