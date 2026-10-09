import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { JobEventsProvider } from "@/context/JobEventsContext";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import ReportCreation from "./pages/ReportCreation";
import ReportDetail from "./pages/ReportDetail";
import ReportExportView from "./pages/ReportExportView";
import ReportVerification from "./pages/ReportVerification";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import RequestChanges from "./pages/RequestChanges";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Profile from "./pages/Profile";
import ForceChangePassword from "./pages/ForceChangePassword";

const queryClient = new QueryClient();

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  // For now, we're not implementing actual auth check to simplify preview
  // In a real app, you would check if the user is authenticated

  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  // AuthContext rehydrates from localStorage in an effect, so isAuthenticated
  // is still false on the first render. Redirecting during that window bounced
  // every deep link (/report/:id on a hard refresh, and the PDF exporter's
  // /report/:id/export) to /login, which then forwarded to /dashboard once
  // auth resolved — losing the requested page entirely.
  if (isLoading) return null;

  if (!isAuthenticated) return <Navigate to="/login" />;

  // A temp-password login must be resolved before anything else is reachable.
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
};

// Role-based route protection
const DoctorRoute = ({ children }: { children: React.ReactNode }) => {
  const { isDoctor } = useAuth();
  return isDoctor() ? <>{children}</> : <Navigate to="/dashboard" />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin } = useAuth();
  return isAdmin() ? <>{children}</> : <Navigate to="/dashboard" />;
};

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Inside AuthProvider (it needs to know when there's a session to
            stream for) and inside BrowserRouter (it stays off the headless
            PDF renderer's /export route — see the provider's comment). */}
        <JobEventsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report/create"
              element={
                <ProtectedRoute>
                  <ReportCreation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report/:id"
              element={
                <ProtectedRoute>
                  <ReportDetail />
                </ProtectedRoute>
              }
            />
            {/* Bare render target for the server-side PDF exporter — no
                navbar, no actions. Headless Chromium authenticates with a
                short-lived token, so it sees only what that user could. */}
            <Route
              path="/report/:id/export"
              element={
                <ProtectedRoute>
                  <ReportExportView />
                </ProtectedRoute>
              }
            />
            <Route
              // path="/report/verify/:id"
              path="/verification"
              element={
                <ProtectedRoute>
                  <DoctorRoute>
                    <ReportVerification />
                  </DoctorRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients"
              element={
                <ProtectedRoute>
                  <Patients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/:id"
              element={
                <ProtectedRoute>
                  <PatientDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/changes-requested"
              element={
                <ProtectedRoute>
                  <RequestChanges />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ForceChangePassword />
                </ProtectedRoute>
              }
            />

            {/* Catch-all route for 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
        </JobEventsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
