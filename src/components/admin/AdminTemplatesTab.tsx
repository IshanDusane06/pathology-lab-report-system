import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import RemarksEditor from "@/components/report/RemarksEditor";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { Search } from "lucide-react";
import { reportTypesApi, ReportType, Parameter, NormalValue, Section, SubField } from "@/services/reportTypesApi";
import { Pagination } from "@/services/api";

const PAGE_SIZE = 12;
type StatusFilter = "all" | "active" | "draft";

const PARAMETER_TYPES: { value: Parameter["type"]; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "text", label: "Text" },
  { value: "select", label: "Select" },
  { value: "range", label: "Range" },
  { value: "boolean", label: "Boolean" },
  { value: "paragraph", label: "Paragraph" },
  { value: "datedReadings", label: "Dated readings" },
  { value: "breakdown", label: "Breakdown (fixed categories)" },
];

// Types whose extra settings (options / boolean labels / reference range /
// breakdown sub-fields) live behind the "Configure" dialog rather than the
// Normal range columns. "paragraph" and "datedReadings" are deliberately
// excluded — none of that dialog's controls apply to free-running rich text,
// so they get their own inert-dash treatment in the table instead (see the
// Unit/Normal-range cells below). "breakdown" IS included — its sub-field
// list is exactly this kind of "configure once" setting.
const CONFIGURABLE_TYPES: Parameter["type"][] = ["text", "select", "boolean", "breakdown"];

function blankNormalValue(unit: string): NormalValue {
  return {
    min: undefined as unknown as number,
    max: undefined as unknown as number,
    unit,
    gender: "all",
    ageRange: { min: 0, max: 120 },
  };
}

function blankSection(displayOrder: number): Section {
  return { key: "", title: "", description: "", displayOrder, remarksEnabled: false, defaultRemarks: "" };
}

// The report-filling form keys a parameter's value by its name alone (no
// separate stable identifier is threaded through that pipeline), so two
// parameters sharing a name silently collapse into one shared value the
// instant a report is filled in — editing one edits both. Checked here for
// instant feedback; the backend enforces the same rule as the real gate.
function findDuplicateParameterName(parameters: Parameter[]): string | null {
  const seen = new Set<string>();
  for (const p of parameters) {
    const name = (p.name || "").trim();
    if (!name) continue;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

// A freshly-added ("+ Add parameter") row starts out unnamed — that's fine
// until save time. findDuplicateParameterName above deliberately skips blank
// names (a blank isn't a duplicate of anything), so this is checked
// separately; the backend enforces the same rule as the real gate.
function findBlankParameterName(parameters: Parameter[]): boolean {
  return parameters.some((p) => !(p.name || "").trim());
}

// Same "one name = one value" hazard as findDuplicateParameterName above,
// one level deeper: a breakdown parameter's sub-fields are looked up by their
// own label at both report-fill time and read-only render time, so a blank
// or duplicate sub-field label within one parameter would silently collapse
// two sub-items into one value. Checked here for instant feedback; the
// backend enforces the same rule as the real gate. Returns a message
// describing the first problem found, or null if every breakdown
// parameter's sub-fields are well-formed.
function findBreakdownSubFieldIssue(parameters: Parameter[]): string | null {
  for (const p of parameters) {
    if (p.type !== "breakdown") continue;
    const paramName = p.name || "a breakdown parameter";
    const seen = new Set<string>();
    for (const sf of p.subFields || []) {
      const label = (sf.label || "").trim();
      if (!label) {
        return `"${paramName}" has a sub-item with no label — every sub-item needs one before you can save.`;
      }
      if (seen.has(label)) {
        return `"${paramName}" has two sub-items both named "${label}" — give each a distinct label, or the report form won't be able to tell them apart.`;
      }
      seen.add(label);
    }
  }
  return null;
}

function blankParameter(): Parameter {
  return {
    name: "",
    description: "",
    unit: "",
    type: "number",
    normalValues: [{ min: undefined as unknown as number, max: undefined as unknown as number, unit: "", gender: "all", ageRange: { min: 0, max: 120 } }],
    isRequired: false,
    displayOrder: 0,
    section: "main",
  };
}

const AdminTemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<ReportType[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReportType | null>(null);
  const [saving, setSaving] = useState(false);
  const [configuringIndex, setConfiguringIndex] = useState<number | null>(null);
  const [rangesIndex, setRangesIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Uses the Admin-only endpoint (includes drafts) rather than the public
  // GET /report-types, which only returns isActive: true for the
  // create-report flow — drafts would otherwise vanish from this list.
  const loadTemplates = async (pageOverride?: number) => {
    setLoading(true);
    try {
      const targetPage = pageOverride ?? page;
      const { data, pagination: pag } = await reportTypesApi.getAdminReportTypes({
        page: targetPage,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setTemplates(data);
      setPagination(pag);
      if (!selectedId && data.length) {
        setSelectedId(data[0]._id);
        setDraft(JSON.parse(JSON.stringify(data[0])));
      }
      return { data, pagination: pag };
    } catch (error) {
      toast({ title: "Error", description: "Failed to load report templates", variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Debounced search — reset to page 1 whenever the query changes. Skips the
  // initial mount so it doesn't duplicate the page/status effect's fetch.
  const isFirstSearch = React.useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadTemplates();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const selectTemplate = (t: ReportType) => {
    setSelectedId(t._id);
    setDraft(JSON.parse(JSON.stringify(t)));
  };

  const updateDraftParam = (index: number, updates: Partial<Parameter>) => {
    if (!draft) return;
    const parameters = [...draft.parameters];
    parameters[index] = { ...parameters[index], ...updates };
    setDraft({ ...draft, parameters });
  };

  const updateDraftRange = (index: number, field: "min" | "max", value: string) => {
    if (!draft) return;
    const parameters = [...draft.parameters];
    const nv = parameters[index].normalValues?.[0] || { min: undefined, max: undefined, unit: "", gender: "all", ageRange: { min: 0, max: 120 } };
    parameters[index] = {
      ...parameters[index],
      normalValues: [{ ...nv, [field]: value === "" ? undefined : Number(value) }],
    };
    setDraft({ ...draft, parameters });
  };

  // Multiple normalValues[] entries per parameter — e.g. separate male/female
  // (and optionally age-banded) ranges. The inline Min/Max table columns stay
  // the fast path for the common single-range case; this dialog is where a
  // second (or third) range gets added and each entry's gender/age gets set.
  const addRange = (index: number) => {
    if (!draft) return;
    const current = draft.parameters[index];
    const normalValues = [...(current.normalValues || [])];
    normalValues.push(blankNormalValue(current.unit || ""));
    updateDraftParam(index, { normalValues });
  };

  const updateRange = (index: number, rangeIndex: number, updates: Partial<NormalValue>) => {
    if (!draft) return;
    const normalValues = [...(draft.parameters[index].normalValues || [])];
    normalValues[rangeIndex] = { ...normalValues[rangeIndex], ...updates };
    updateDraftParam(index, { normalValues });
  };

  const removeRange = (index: number, rangeIndex: number) => {
    if (!draft) return;
    const normalValues = (draft.parameters[index].normalValues || []).filter((_, i) => i !== rangeIndex);
    updateDraftParam(index, { normalValues });
  };

  // Sections manager — sections[] previously had no admin UI at all (it was
  // only ever set via direct API calls); this is the first real surface for
  // managing a template's section list, which the section-wise remarks
  // feature builds its per-section controls on top of.
  const addSection = () => {
    if (!draft) return;
    setDraft({ ...draft, sections: [...(draft.sections || []), blankSection(draft.sections?.length || 0)] });
  };

  const updateSection = (index: number, updates: Partial<Section>) => {
    if (!draft) return;
    const sections = [...(draft.sections || [])];
    sections[index] = { ...sections[index], ...updates };
    setDraft({ ...draft, sections });
  };

  const removeSection = (index: number) => {
    if (!draft) return;
    const key = draft.sections?.[index]?.key;
    const inUse = draft.parameters.some((p) => p.section === key);
    if (inUse) {
      toast({
        title: "Section still in use",
        description: "Reassign or remove the parameters using this section first.",
        variant: "destructive",
      });
      return;
    }
    setDraft({ ...draft, sections: (draft.sections || []).filter((_, i) => i !== index) });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const sections = [...(draft.sections || [])];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    sections.forEach((s, i) => (s.displayOrder = i));
    setDraft({ ...draft, sections });
  };

  const handleTypeChange = (index: number, newType: Parameter["type"]) => {
    if (!draft) return;
    const current = draft.parameters[index];
    const updates: Partial<Parameter> = { type: newType };
    if (newType === "boolean" && !current.booleanLabels?.trueLabel) {
      updates.booleanLabels = { trueLabel: "Positive", falseLabel: "Negative" };
    }
    if (newType === "select" && !current.options?.length) {
      updates.options = [];
    }
    if (newType === "breakdown" && !current.subFields?.length) {
      updates.subFields = [];
    }
    updateDraftParam(index, updates);
  };

  const addOption = (index: number) => {
    if (!draft) return;
    const current = draft.parameters[index];
    updateDraftParam(index, { options: [...(current.options || []), ""] });
  };

  const updateOption = (index: number, optionIndex: number, value: string) => {
    if (!draft) return;
    const options = [...(draft.parameters[index].options || [])];
    options[optionIndex] = value;
    updateDraftParam(index, { options });
  };

  const removeOption = (index: number, optionIndex: number) => {
    if (!draft) return;
    const options = (draft.parameters[index].options || []).filter((_, i) => i !== optionIndex);
    updateDraftParam(index, { options });
  };

  const addSubField = (index: number) => {
    if (!draft) return;
    const current = draft.parameters[index];
    updateDraftParam(index, { subFields: [...(current.subFields || []), { label: "", unit: "" }] });
  };

  const updateSubField = (index: number, subFieldIndex: number, patch: Partial<SubField>) => {
    if (!draft) return;
    const subFields = [...(draft.parameters[index].subFields || [])];
    subFields[subFieldIndex] = { ...subFields[subFieldIndex], ...patch };
    updateDraftParam(index, { subFields });
  };

  const removeSubField = (index: number, subFieldIndex: number) => {
    if (!draft) return;
    const subFields = (draft.parameters[index].subFields || []).filter((_, i) => i !== subFieldIndex);
    updateDraftParam(index, { subFields });
  };

  const addParameter = () => {
    if (!draft) return;
    setDraft({ ...draft, parameters: [...draft.parameters, blankParameter()] });
  };

  const removeParameter = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, parameters: draft.parameters.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!draft) return;
    if (findBlankParameterName(draft.parameters)) {
      toast({
        title: "Missing parameter name",
        description: "Every parameter needs a name — fill in the blank one before saving.",
        variant: "destructive",
      });
      return;
    }
    const duplicateName = findDuplicateParameterName(draft.parameters);
    if (duplicateName) {
      toast({
        title: "Duplicate parameter name",
        description: `Two parameters are both named "${duplicateName}" — give each a distinct name before saving, or the report form won't be able to tell them apart.`,
        variant: "destructive",
      });
      return;
    }
    const breakdownIssue = findBreakdownSubFieldIssue(draft.parameters);
    if (breakdownIssue) {
      toast({ title: "Breakdown sub-item problem", description: breakdownIssue, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await reportTypesApi.updateReportType(draft._id, {
        name: draft.name,
        code: draft.code,
        description: draft.description,
        parameters: draft.parameters,
        sections: draft.sections,
        method: draft.method,
        defaultRemarks: draft.defaultRemarks,
        sectionWiseRemarks: draft.sectionWiseRemarks,
        sectionWiseMethod: draft.sectionWiseMethod,
      });
      setTemplates((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      setDraft(JSON.parse(JSON.stringify(updated)));
      toast({ title: "Template saved" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!draft) return;
    const nextActive = !draft.isActive;
    try {
      const updated = await reportTypesApi.updateReportType(draft._id, { isActive: nextActive });
      setTemplates((prev) => prev.map((t) => (t._id === updated._id ? { ...t, isActive: nextActive } : t)));
      setDraft({ ...draft, isActive: nextActive });
      toast({ title: nextActive ? "Template set to active" : "Template set to draft" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update template status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await reportTypesApi.deleteReportType(deleteTarget._id);
      const wasSelected = selectedId === deleteTarget._id;
      if (wasSelected) {
        setSelectedId(null);
        setDraft(null);
      }
      // If this was the last item on a page beyond the first, step back a
      // page — the [page, statusFilter] effect picks up the reload from
      // there. Otherwise just refetch the current page in place.
      if (templates.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await loadTemplates();
      }
      toast({ title: "Template deleted" });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete template",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!draft) return;
    if (findBlankParameterName(draft.parameters)) {
      toast({
        title: "Missing parameter name",
        description: "Every parameter needs a name — fill in the blank one before duplicating.",
        variant: "destructive",
      });
      return;
    }
    const duplicateName = findDuplicateParameterName(draft.parameters);
    if (duplicateName) {
      toast({
        title: "Duplicate parameter name",
        description: `Two parameters are both named "${duplicateName}" — give each a distinct name before duplicating, or the report form won't be able to tell them apart.`,
        variant: "destructive",
      });
      return;
    }
    const breakdownIssue = findBreakdownSubFieldIssue(draft.parameters);
    if (breakdownIssue) {
      toast({ title: "Breakdown sub-item problem", description: breakdownIssue, variant: "destructive" });
      return;
    }
    const suffix = Math.random().toString(36).slice(2, 6);
    try {
      const created = await reportTypesApi.createReportType({
        name: `${draft.name} (Copy)`,
        code: `${draft.code}-${suffix}`,
        description: draft.description,
        parameters: draft.parameters,
        sections: draft.sections,
        method: draft.method,
        defaultRemarks: draft.defaultRemarks,
        sectionWiseRemarks: draft.sectionWiseRemarks,
        sectionWiseMethod: draft.sectionWiseMethod,
      });
      setSelectedId(created._id);
      setDraft(JSON.parse(JSON.stringify(created)));
      await loadTemplates();
      toast({ title: "Template duplicated" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to duplicate template",
        variant: "destructive",
      });
    }
  };

  const handleNewTemplate = async () => {
    const suffix = Math.random().toString(36).slice(2, 6);
    try {
      const created = await reportTypesApi.createReportType({
        name: "New template",
        code: `new-${suffix}`,
        description: "",
        parameters: [],
        sections: [],
      });
      setSelectedId(created._id);
      setDraft(JSON.parse(JSON.stringify(created)));
      await loadTemplates();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create template",
        variant: "destructive",
      });
    }
  };

  if (loading && !templates.length && !draft) {
    return (
      <div className="py-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold mb-1">Report templates</h3>
              <p className="text-xs text-muted-foreground">
                Parameters, units and normal ranges per test type · {pagination.total} template
                {pagination.total === 1 ? "" : "s"}
              </p>
            </div>
            <Button onClick={handleNewTemplate}>+ New template</Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates by name or code..."
                className="pl-8"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "active", "draft"] as StatusFilter[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => handleStatusFilterChange(s)}
                >
                  {s === "all" ? "All" : s === "active" ? "Active" : "Draft"}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No templates match your search.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {templates.map((t) => (
                <button
                  key={t._id}
                  onClick={() => selectTemplate(t)}
                  className={`text-left rounded-md border p-3 transition-colors ${
                    selectedId === t._id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{t.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        t.isActive
                          ? "bg-green-50 text-green-700 border-green-200 shrink-0"
                          : "bg-slate-100 text-slate-600 border-slate-200 shrink-0"
                      }
                    >
                      {t.isActive ? "Active" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.parameters.length} parameters · {t.sections?.length || 0} sections
                  </p>
                </button>
              ))}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row justify-between md:items-start gap-3 mb-6">
              <div className="flex-1">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="text-2xl font-bold border-none px-0 h-auto focus-visible:ring-0 mb-1"
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Code</span>
                  <Input
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    className="h-7 w-28 text-sm"
                  />
                  <span>
                    · {draft.parameters.length} parameters · {draft.sections?.length || 0} sections
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleDuplicate}>
                  Duplicate
                </Button>
                <Button variant="outline" onClick={handleToggleActive}>
                  {draft.isActive ? "Set to draft" : "Set to active"}
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => setDeleteTarget(draft)}>
                  Delete
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save template"}
                </Button>
              </div>
            </div>

            <div className="border rounded-lg p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Sections</h4>
                  <p className="text-xs text-muted-foreground">
                    Group parameters under named sections (matched against each parameter's Section field below).
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="section-wise-remarks" className="text-sm">
                      Section-wise remarks
                    </Label>
                    <Switch
                      id="section-wise-remarks"
                      checked={!!draft.sectionWiseRemarks}
                      onCheckedChange={(checked) => setDraft({ ...draft, sectionWiseRemarks: checked })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="section-wise-method" className="text-sm">
                      Section-wise method
                    </Label>
                    <Switch
                      id="section-wise-method"
                      checked={!!draft.sectionWiseMethod}
                      onCheckedChange={(checked) => setDraft({ ...draft, sectionWiseMethod: checked })}
                    />
                  </div>
                </div>
              </div>

              {(draft.sections || []).map((s, si) => (
                <div key={si} className="border rounded-md p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-[8rem_1fr_1fr_auto] gap-2 items-start">
                    <Input
                      placeholder="Key"
                      value={s.key}
                      onChange={(e) => updateSection(si, { key: e.target.value })}
                    />
                    <Input
                      placeholder="Title"
                      value={s.title}
                      onChange={(e) => updateSection(si, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={s.description || ""}
                      onChange={(e) => updateSection(si, { description: e.target.value })}
                    />
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => moveSection(si, -1)} disabled={si === 0}>
                        ↑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveSection(si, 1)}
                        disabled={si === (draft.sections?.length || 0) - 1}
                      >
                        ↓
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeSection(si)}>
                        Remove
                      </Button>
                    </div>
                  </div>

                  {draft.sectionWiseRemarks && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Switch
                          id={`section-remarks-${si}`}
                          checked={!!s.remarksEnabled}
                          onCheckedChange={(checked) => updateSection(si, { remarksEnabled: checked })}
                        />
                        <Label htmlFor={`section-remarks-${si}`} className="text-sm">
                          Has its own remarks
                        </Label>
                      </div>
                      {s.remarksEnabled && (
                        <RemarksEditor
                          value={s.defaultRemarks || ""}
                          onChange={(html) => updateSection(si, { defaultRemarks: html })}
                          placeholder="Boilerplate shown for this section, unless overridden per-report"
                        />
                      )}
                    </div>
                  )}

                  {draft.sectionWiseMethod && (
                    <div className="pt-2 border-t">
                      <Label className="text-sm mb-1 block">Method</Label>
                      <Textarea
                        value={s.method || ""}
                        onChange={(e) => updateSection(si, { method: e.target.value })}
                        placeholder="e.g. Detection by ISE Analyser"
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addSection}>
                + Add section
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {!draft.sectionWiseMethod && (
                <div>
                  <Label>Method</Label>
                  <Textarea
                    value={draft.method || ""}
                    onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                    placeholder="e.g. Detection is by quantitative method on SEAC SLIM ANALYSER"
                    className="resize-none"
                    rows={3}
                  />
                </div>
              )}
              {!draft.sectionWiseRemarks && (
                <div>
                  <Label>Default remarks</Label>
                  <RemarksEditor
                    value={draft.defaultRemarks || ""}
                    onChange={(html) => setDraft({ ...draft, defaultRemarks: html })}
                    placeholder="Boilerplate shown on every report of this type, unless overridden per-report"
                  />
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 text-muted-foreground font-medium text-sm">Parameter</th>
                    <th className="pb-2 text-muted-foreground font-medium text-sm">Type</th>
                    <th className="pb-2 text-muted-foreground font-medium text-sm">Unit</th>
                    <th className="pb-2 text-muted-foreground font-medium text-sm" colSpan={2}>
                      Normal range
                    </th>
                    <th className="pb-2 text-muted-foreground font-medium text-sm">Section</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.parameters.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <Input value={p.name} onChange={(e) => updateDraftParam(i, { name: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2 w-32">
                        <Select value={p.type} onValueChange={(val) => handleTypeChange(i, val as Parameter["type"])}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PARAMETER_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-2">
                        {p.type === "paragraph" || p.type === "datedReadings" || p.type === "breakdown" ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <Input value={p.unit} onChange={(e) => updateDraftParam(i, { unit: e.target.value })} />
                        )}
                      </td>
                      {p.type === "paragraph" || p.type === "datedReadings" ? (
                        <td className="py-2 pr-2 text-muted-foreground text-sm" colSpan={2}>
                          — (free text, no range)
                        </td>
                      ) : CONFIGURABLE_TYPES.includes(p.type) ? (
                        <td className="py-2 pr-2" colSpan={2}>
                          <Button variant="outline" size="sm" onClick={() => setConfiguringIndex(i)}>
                            Configure
                          </Button>
                        </td>
                      ) : (p.normalValues?.length || 0) > 1 ? (
                        <td className="py-2 pr-2" colSpan={2}>
                          <Button variant="outline" size="sm" onClick={() => setRangesIndex(i)}>
                            Ranges ({p.normalValues.length})
                          </Button>
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-1 w-24">
                            <Input
                              type="number"
                              value={p.normalValues?.[0]?.min ?? ""}
                              onChange={(e) => updateDraftRange(i, "min", e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-2 w-24">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={p.normalValues?.[0]?.max ?? ""}
                                onChange={(e) => updateDraftRange(i, "max", e.target.value)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-1.5 text-muted-foreground shrink-0"
                                title="Set separate ranges by gender/age"
                                onClick={() => setRangesIndex(i)}
                              >
                                +
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-2">
                        <Input value={p.section} onChange={(e) => updateDraftParam(i, { section: e.target.value })} />
                      </td>
                      <td className="py-2">
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeParameter(i)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button variant="outline" className="mt-4" onClick={addParameter}>
              + Add parameter
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={configuringIndex !== null} onOpenChange={(open) => !open && setConfiguringIndex(null)}>
        <DialogContent>
          {draft && configuringIndex !== null && draft.parameters[configuringIndex] && (
            <>
              <DialogHeader>
                <DialogTitle>Configure "{draft.parameters[configuringIndex].name || "Parameter"}"</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {draft.parameters[configuringIndex].type === "select" && (
                  <div>
                    <Label>Options</Label>
                    <div className="space-y-2 mt-1">
                      {(draft.parameters[configuringIndex].options || []).map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <Input value={opt} onChange={(e) => updateOption(configuringIndex, oi, e.target.value)} />
                          <Button variant="outline" size="sm" onClick={() => removeOption(configuringIndex, oi)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addOption(configuringIndex)}>
                        + Add option
                      </Button>
                    </div>
                  </div>
                )}

                {draft.parameters[configuringIndex].type === "breakdown" && (
                  <div>
                    <Label>Sub-items</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Fixed for every report using this template — e.g. "Actively Motile" with unit "%".
                    </p>
                    <div className="space-y-2">
                      {(draft.parameters[configuringIndex].subFields || []).map((sf, sfi) => (
                        <div key={sfi} className="flex gap-2">
                          <Input
                            value={sf.label}
                            onChange={(e) => updateSubField(configuringIndex, sfi, { label: e.target.value })}
                            placeholder="Label, e.g. Actively Motile"
                            className="flex-1"
                          />
                          <Input
                            value={sf.unit || ""}
                            onChange={(e) => updateSubField(configuringIndex, sfi, { unit: e.target.value })}
                            placeholder="Unit, e.g. %"
                            className="w-24"
                          />
                          <Button variant="outline" size="sm" onClick={() => removeSubField(configuringIndex, sfi)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addSubField(configuringIndex)}>
                        + Add sub-item
                      </Button>
                    </div>
                  </div>
                )}

                {draft.parameters[configuringIndex].type === "boolean" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>True label</Label>
                      <Input
                        value={draft.parameters[configuringIndex].booleanLabels?.trueLabel || ""}
                        onChange={(e) =>
                          updateDraftParam(configuringIndex, {
                            booleanLabels: {
                              ...draft.parameters[configuringIndex].booleanLabels,
                              trueLabel: e.target.value,
                            },
                          })
                        }
                        placeholder="Positive"
                      />
                    </div>
                    <div>
                      <Label>False label</Label>
                      <Input
                        value={draft.parameters[configuringIndex].booleanLabels?.falseLabel || ""}
                        onChange={(e) =>
                          updateDraftParam(configuringIndex, {
                            booleanLabels: {
                              ...draft.parameters[configuringIndex].booleanLabels,
                              falseLabel: e.target.value,
                            },
                          })
                        }
                        placeholder="Negative"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label>Reference range / value (optional)</Label>
                  <Input
                    value={draft.parameters[configuringIndex].referenceRangeText || ""}
                    onChange={(e) => updateDraftParam(configuringIndex, { referenceRangeText: e.target.value })}
                    placeholder="e.g. Negative, or 4.5 - 11.0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional — shown in the Reference Range column. Leave blank if this parameter has none.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setConfiguringIndex(null)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rangesIndex !== null} onOpenChange={(open) => !open && setRangesIndex(null)}>
        <DialogContent className="max-w-2xl">
          {draft && rangesIndex !== null && draft.parameters[rangesIndex] && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Normal ranges for "{draft.parameters[rangesIndex].name || "Parameter"}"
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  The report shown to a patient uses whichever range matches their sex and age. Add one range per
                  gender (and optionally narrow it by age) — a range left on "All" applies to anyone it isn't
                  overridden for.
                </p>
                {(draft.parameters[rangesIndex].normalValues || []).map((nv, ri) => (
                  <div key={ri} className="grid grid-cols-[7rem_5rem_5rem_5rem_4.5rem_4.5rem_auto] gap-2 items-end">
                    <div>
                      {ri === 0 && <Label className="text-xs">Gender</Label>}
                      <Select
                        value={nv.gender}
                        onValueChange={(val) => updateRange(rangesIndex, ri, { gender: val as NormalValue["gender"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      {ri === 0 && <Label className="text-xs">Min</Label>}
                      <Input
                        type="number"
                        value={nv.min ?? ""}
                        onChange={(e) =>
                          updateRange(rangesIndex, ri, { min: e.target.value === "" ? undefined : Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      {ri === 0 && <Label className="text-xs">Max</Label>}
                      <Input
                        type="number"
                        value={nv.max ?? ""}
                        onChange={(e) =>
                          updateRange(rangesIndex, ri, { max: e.target.value === "" ? undefined : Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      {ri === 0 && <Label className="text-xs">Unit</Label>}
                      <Input value={nv.unit || ""} onChange={(e) => updateRange(rangesIndex, ri, { unit: e.target.value })} />
                    </div>
                    <div>
                      {ri === 0 && <Label className="text-xs">Age min</Label>}
                      <Input
                        type="number"
                        value={nv.ageRange?.min ?? ""}
                        onChange={(e) =>
                          updateRange(rangesIndex, ri, {
                            ageRange: { ...nv.ageRange, min: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                    <div>
                      {ri === 0 && <Label className="text-xs">Age max</Label>}
                      <Input
                        type="number"
                        value={nv.ageRange?.max ?? ""}
                        onChange={(e) =>
                          updateRange(rangesIndex, ri, {
                            ageRange: { ...nv.ageRange, max: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeRange(rangesIndex, ri)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addRange(rangesIndex)}>
                  + Add range
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setRangesIndex(null)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the template. If it's ever been used by a report, this will be blocked —
              use "Set to draft" instead to retire it without breaking anything that references it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminTemplatesTab;
