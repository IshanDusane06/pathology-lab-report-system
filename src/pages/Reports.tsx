import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { PageTransition } from "@/utils/animations";
import { CalendarIcon, Download, FileText, Search, SendHorizontal, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "@/components/ui/use-toast";
import { IReport, reportsApi } from "../services/reportsApi";
import { reportTypesApi } from "../services/reportTypesApi";
import { Pagination } from "../services/api";
import ReportStatusBadge, { ReportStatusValue, STATUS_CONFIG } from "@/components/report/ReportStatusBadge";
import { canEditReportContent } from "@/lib/reportAccess";
import SendReportEmailDialog from "@/components/report/SendReportEmailDialog";
import { usePdfJob, saveBlobAs } from "@/hooks/usePdfJob";

const PAGE_SIZE = 20;

const Reports = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isDoctor } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  // Prefilled from ?status=... (e.g. Dashboard's "View pending" link). A
  // lazy initializer rather than a separate effect, so the URL-derived value
  // is there from the very first fetch instead of triggering one fetch for
  // "all" and a second once the effect reads the query string.
  const [statusFilter, setStatusFilter] = useState(
    () => new URLSearchParams(location.search).get("status") || "all"
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [reports, setReports] = useState<IReport[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reportTypes, setReportTypes] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { requestPdf } = usePdfJob();
  const [emailTarget, setEmailTarget] = useState<IReport | null>(null);

  const memoizedGetReportTypeName = useCallback(
    (code: string) => {
      return reportTypes[code as keyof typeof reportTypes] || code;
    },
    [reportTypes]
  );

  // fetch types of report for dropdown
  useEffect(() => {
    const fetch = async () => {
      try {
        const types = await reportTypesApi.getReportTypes();
        types.unshift({
          _id: "all",
          name: "All",
          code: "all",
          parameters: [],
        });
        types.forEach((type) => {
          reportTypes[type.code] = type.name;
        });
        setReportTypes(reportTypes);
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

  // Fetch reports — filtering, date-range, and pagination all happen
  // server-side now; this just asks for the current page under the current
  // filters.
  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await reportsApi.getReports({
        page,
        limit: PAGE_SIZE,
        status: statusFilter === "all" ? undefined : statusFilter,
        reportTypeCode: typeFilter === "all" ? undefined : typeFilter,
        search: searchTerm || undefined,
        dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
        dateTo: dateTo ? dateTo.toISOString() : undefined,
      });
      const mapped: IReport[] = response.data.map((report: IReport) => {
        report.id = report._id;
        report.reportTypeCode = report.reportTypeCode.toString();
        report.patientInfo = {
          name: report.patientInfo.name,
          date: report.createdAt,
          referredBy: report.technician['name'],
          sex: report.patientInfo.sex,
          age: report.patientInfo.age,
          contact: report.patientInfo.contact,
          address: report.patientInfo.address,
        };
        return report;
      });
      setReports(mapped);
      setPagination(response.pagination);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Error",
        description: "Failed to load reports. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter, dateFrom, dateTo]);

  // Debounced search — reset to page 1 whenever the query changes. Skips the
  // initial mount so it doesn't duplicate the effect above's fetch.
  const isFirstSearch = useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadReports();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleDateFromChange = (date: Date | undefined) => {
    setDateFrom(date);
    setPage(1);
  };

  const handleDateToChange = (date: Date | undefined) => {
    setDateTo(date);
    setPage(1);
  };

  const handleClearDateRange = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const handleViewReport = (reportId: string) => {
    navigate(`/report/${reportId}`);
  };

  // Same navigation target either way (/report/:id already opens editable
  // for whoever can edit it) — this only changes what the button says, so
  // it stops reading like a read-only dead end for a report you can edit.
  const getRowActionLabel = (report: IReport) => {
    if (canEditReportContent(report, user?.id, user?.role)) {
      return report.status?.value === "pendingApproval" ? "Review" : "Edit";
    }
    return "View";
  };

  const handleDownloadPdf = async (report: IReport) => {
    const reportId = report._id || report.id;
    if (!reportId) return;
    setDownloadingId(reportId);
    try {
      // Queued server-side render — the row's button stays disabled until the
      // bytes arrive. The server names the file; see ReportDetail's copy.
      const { blob, filename } = await requestPdf(reportId);
      saveBlobAs(blob, filename);
    } catch (error) {
      toast({
        title: "Couldn't generate the PDF",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Opens the same dialog ReportDetail uses, so there is exactly one send flow.
  const handleSendReport = (report: IReport) => {
    setEmailTarget(report);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDateBucketLabel = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const groupedReports: { label: string; reports: typeof reports }[] = [];
  reports.forEach((report) => {
    const label = getDateBucketLabel(report.createdAt);
    const lastGroup = groupedReports[groupedReports.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.reports.push(report);
    } else {
      groupedReports.push({ label, reports: [report] });
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Reports</h1>
              <p className="text-muted-foreground mt-1">
                Manage and view laboratory reports
              </p>
            </div>
          </div>

          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle>Filter Reports</CardTitle>
              <CardDescription>
                Search and filter to find specific reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search by patient name or test type"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {(Object.keys(STATUS_CONFIG) as ReportStatusValue[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {STATUS_CONFIG[value].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by test type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(reportTypes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={handleDateFromChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {dateTo ? format(dateTo, "MMM d, yyyy") : "To date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateTo} onSelect={handleDateToChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                {(dateFrom || dateTo) && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      onClick={handleClearDateRange}
                    >
                      <X size={14} />
                      Clear date range
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Report Results</CardTitle>
              <CardDescription>
                {pagination.total} report{pagination.total === 1 ? "" : "s"} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !reports.length ? (
                <div className="py-4 flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground/60 mx-auto mb-3" />
                  <h3 className="text-lg font-medium mb-1">No reports found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your filters or create a new report
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => navigate("/report/create")}
                  >
                    Create New Report
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedReports.map((group) => (
                    <div key={group.label}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                        {group.label}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left">
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Patient
                              </th>
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Test Type
                              </th>
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Created
                              </th>
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Status
                              </th>
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Created By
                              </th>
                              <th className="pb-3 text-muted-foreground font-medium text-sm">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.reports.map((report, index) => {
                              const isSigned = report.status?.value === "signed";
                              return (
                                <tr
                                  key={report.id || `report-${index}`}
                                  className="border-t border-border hover:bg-muted/30 transition-colors"
                                >
                                  <td className="py-3">{report.patientInfo?.name || 'N/A'}</td>
                                  <td className="py-3">{memoizedGetReportTypeName(report.reportTypeCode)}</td>
                                  <td className="py-3">
                                    {formatDate(report.createdAt)}
                                  </td>
                                  <td className="py-3">
                                    <ReportStatusBadge status={report.status?.value as ReportStatusValue} />
                                  </td>
                                  <td className="py-3">
                                    {(typeof report.technician === 'string'
                                      ? report.technician
                                      : report.technician?.name) || 'N/A'}
                                  </td>
                                  <td className="py-3">
                                    <div className="flex items-center space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleViewReport(report.id)}
                                      >
                                        {getRowActionLabel(report)}
                                      </Button>

                                      {isSigned && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDownloadPdf(report)}
                                            disabled={downloadingId === (report._id || report.id)}
                                            className="gap-1"
                                          >
                                            <Download size={14} />
                                            {downloadingId === (report._id || report.id) ? "..." : "PDF"}
                                          </Button>

                                          <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() => handleSendReport(report)}
                                            className="gap-1"
                                          >
                                            <SendHorizontal size={14} />
                                            Send
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageTransition>

      <SendReportEmailDialog
        reportId={emailTarget?._id || emailTarget?.id || null}
        open={!!emailTarget}
        onOpenChange={(open) => !open && setEmailTarget(null)}
        defaultRecipient={emailTarget?.patientEmail}
        patientName={emailTarget?.patientInfo?.name}
      />
    </div>
  );
};

export default Reports;
