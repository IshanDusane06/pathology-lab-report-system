import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { PageTransition } from "@/utils/animations";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, UserPlus, Phone, Mail } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { patientsApi, IPatient } from "@/services/patientsApi";
import { Pagination } from "@/services/api";
import PatientFormDialog from "@/components/patient/PatientFormDialog";
import PatientDuplicatesTab from "@/components/patient/PatientDuplicatesTab";
import { formatAge } from "@/components/patient/patientDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const Patients = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [patients, setPatients] = useState<IPatient[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await patientsApi.getPatients({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setPatients(res.data);
      setPagination(res.pagination);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load patients",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  // Debounced search — reset to page 1 whenever the query changes. Skips the
  // initial mount so it doesn't duplicate the page/status effect's fetch.
  const isFirstSearch = useRef(true);
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadPatients();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as typeof statusFilter);
    setPage(1);
  };

  const patientsListPanel = (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter patients</CardTitle>
          <CardDescription>
            Matches phone, name, or ID exactly the same way the report-creation
            picker does
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Mobile, name, or P-000042..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {pagination.total} patient{pagination.total === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !patients.length ? (
            <div className="py-12 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : patients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No patients match your search.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-3 text-muted-foreground font-medium text-sm">
                        Patient
                      </th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">
                        Sex / Age
                      </th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">
                        Contact
                      </th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm">
                        Registered
                      </th>
                      <th className="pb-3 text-muted-foreground font-medium text-sm" />
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr
                        key={p._id}
                        className="border-t border-border cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/patient/${p._id}`)}
                      >
                        <td className="py-3">
                          <p className="font-medium leading-tight">{p.name}</p>
                          <p className="text-xs font-mono text-primary">
                            {p.patientId}
                          </p>
                        </td>
                        <td className="py-3 text-sm">
                          {SEX_LABEL[p.sex] || p.sex} · {formatAge(p)}
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />
                              {p.phone || "—"}
                            </span>
                            {p.email && (
                              <span className="flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                {p.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/patient/${p._id}`);
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
            </>
          )}
        </CardContent>
      </Card>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="page-container space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Patients</h1>
              <p className="text-muted-foreground mt-1">
                Search by mobile number, name, or patient ID
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              New patient
            </Button>
          </div>

          {isAdmin() ? (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All patients</TabsTrigger>
                <TabsTrigger value="duplicates">
                  Possible duplicates
                </TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="space-y-6 mt-4">
                {patientsListPanel}
              </TabsContent>
              <TabsContent value="duplicates" className="mt-4">
                <PatientDuplicatesTab />
              </TabsContent>
            </Tabs>
          ) : (
            patientsListPanel
          )}
        </div>
      </PageTransition>

      <PatientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(patient) => {
          navigate(`/patient/${patient._id}`);
        }}
        onSelectExisting={(patient) => {
          navigate(`/patient/${patient._id}`);
        }}
      />
    </div>
  );
};

export default Patients;
