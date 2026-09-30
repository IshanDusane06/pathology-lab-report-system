// src/router.tsx
import {
    createBrowserRouter,
    Navigate,
    Outlet,
  } from "react-router-dom";
  import Index from "@/pages/Index";
  import Login from "@/pages/Login";
  import Dashboard from "@/pages/Dashboard";
  import Reports from "@/pages/Reports";
  import ReportCreation from "@/pages/ReportCreation";
  import ReportVerification from "@/pages/ReportVerification";
  import AdminDashboard from "@/pages/AdminDashboard";
  import NotFound from "@/pages/NotFound";
  
  const ProtectedRoute = () => {
    const isAuthenticated = true;
    return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
  };
  
  const DoctorRoute = () => {
    const isDoctor = true;
    return isDoctor ? <Outlet /> : <Navigate to="/dashboard" />;
  };
  
  export const router = createBrowserRouter([
    {
      path: "/",
      element: <Index />,
    },
    {
      path: "/login",
      element: <Login />,
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          path: "/dashboard",
          element: <Dashboard />,
        },
        {
          path: "/reports",
          element: <Reports />,
        },
        {
          path: "/report/create",
          element: <ReportCreation />,
        },
        {
          path: "/report/verify/:id",
          element: <ReportVerification />,
        },
        {
          element: <DoctorRoute />,
          children: [
            {
              path: "/admin",
              element: <AdminDashboard />,
            },
          ],
        },
      ],
    },
    {
      path: "*",
      element: <NotFound />,
    },
  ]);
  