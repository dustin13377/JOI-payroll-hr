import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ClientLayout } from "@/components/ClientLayout";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import Dashboard from "@/pages/Dashboard";
import EmployeeHome from "@/pages/EmployeeHome";
import Empleados from "@/pages/Empleados";
import EmpleadoPerfil from "@/pages/EmpleadoPerfil";
import Historial from "@/pages/Historial";
import Facturas from "@/pages/Facturas";
import FacturaNueva from "@/pages/FacturaNueva";
import FacturaDetalle from "@/pages/FacturaDetalle";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import Timeclock from "@/pages/Timeclock";
import EODForm from "@/pages/EODForm";
import VacationRequests from "@/pages/VacationRequests";
import Attendance from "@/pages/Attendance";
import Performance from "@/pages/Performance";
import ShiftSettings from "@/pages/ShiftSettings";
import Campaigns from "@/pages/Campaigns";
import Recruiting from "@/pages/Recruiting";
import CampaignDetail from "@/pages/CampaignDetail";
import PayrollRun from "@/pages/PayrollRun";
import TeamLeadHome from "@/pages/TeamLeadHome";
import Account from "@/pages/Account";
import DocumentTypes from "@/pages/DocumentTypes";
import Departments from "@/pages/Departments";
import Policies from "@/pages/Policies";
import MyPolicies from "@/pages/MyPolicies";
import HrDocumentQueue from "@/pages/HrDocumentQueue";
import HrDocumentDraft from "@/pages/HrDocumentDraft";
import HolidayRequests from "@/pages/HolidayRequests";
import HrTimeOff from "@/pages/HrTimeOff";
// TimeOff page (the old /solicitudes form) was retired when the two time-off
// systems were unified. The file at src/pages/TimeOff.tsx is now orphaned and
// can be `git rm`'d in a follow-up. The /solicitudes route below redirects to
// the new unified form at /vacation.
import ClientDashboard from "@/pages/ClientDashboard";
import ClientCampaignDetail from "@/pages/ClientCampaignDetail";
import ProvisionOrg from "@/pages/ProvisionOrg";
import AgentReviews from "@/pages/AgentReviews";
import SystemUsers from "@/pages/SystemUsers";
import Comunicados from "@/pages/Comunicados";
import Payroll from "@/pages/admin/Payroll";
import PayrollWeek from "@/pages/admin/PayrollWeek";
import PayrollRates from "@/pages/admin/PayrollRates";
import PayrollAgent from "@/pages/admin/PayrollAgent";
import PayrollHolidays from "@/pages/admin/PayrollHolidays";
import ClientHolidays from "@/pages/admin/ClientHolidays";
import PayrollPeriods from "@/pages/admin/PayrollPeriods";
import { RequireLeadership, RequireTeamLeadOrAbove, RequireClient, RequireOwner } from "@/components/RequireRole";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function RoleHome() {
  const { isLeadership, isTeamLead, isClient } = useAuth();
  // Client users get their own portal — redirect out of AppLayout
  if (isClient) return <Navigate to="/client" replace />;
  if (isLeadership) return <Dashboard />;
  if (isTeamLead) return <TeamLeadHome />;
  return <EmployeeHome />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isClient } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LogoLoadingIndicator size="lg" />
      </div>
    );
  }

  if (session) {
    // Send authenticated clients directly to their portal
    return <Navigate to={isClient ? "/client" : "/"} replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Client portal — own layout, completely separate from AppLayout / AppSidebar */}
          <Route
            path="/client/*"
            element={
              <ProtectedRoute>
                <RequireClient>
                  <ClientLayout>
                    <Routes>
                      <Route index element={<ClientDashboard />} />
                      <Route path="campaign/:id" element={<ClientCampaignDetail />} />
                    </Routes>
                  </ClientLayout>
                </RequireClient>
              </ProtectedRoute>
            }
          />

          {/* All other routes — AppLayout with AppSidebar */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<RoleHome />} />
                    <Route path="/empleados" element={<RequireLeadership><Empleados /></RequireLeadership>} />
                    <Route path="/empleados/:id" element={<RequireTeamLeadOrAbove><EmpleadoPerfil /></RequireTeamLeadOrAbove>} />
                    {/* Payroll History: owner-only. RLS also locked to is_owner(). */}
                    <Route path="/historial" element={<RequireOwner><Historial /></RequireOwner>} />
                    {/* Invoices: owner-only. RLS also locked to is_owner() — keep both layers in sync. */}
                    <Route path="/facturas" element={<RequireOwner><Facturas /></RequireOwner>} />
                    <Route path="/facturas/nueva" element={<RequireOwner><FacturaNueva /></RequireOwner>} />
                    <Route path="/facturas/:id" element={<RequireOwner><FacturaDetalle /></RequireOwner>} />
                    <Route path="/reloj" element={<Timeclock />} />
                    <Route path="/eod" element={<EODForm />} />
                    <Route path="/vacation" element={<VacationRequests />} />
                    <Route path="/asistencia" element={<RequireTeamLeadOrAbove><Attendance /></RequireTeamLeadOrAbove>} />
                    <Route path="/desempeno" element={<RequireTeamLeadOrAbove><Performance /></RequireTeamLeadOrAbove>} />
                    {/* /team-lead/dashboard removed in PR 2 — its useful bits
                        (Missing Yesterday, Submit-for-agent) moved into
                        TodaysRosterCard on the TL home. */}
                    <Route path="/reviews" element={<RequireTeamLeadOrAbove><AgentReviews /></RequireTeamLeadOrAbove>} />
                    <Route path="/settings/shifts" element={<RequireTeamLeadOrAbove><ShiftSettings /></RequireTeamLeadOrAbove>} />
                    <Route path="/campaigns" element={<RequireLeadership><Campaigns /></RequireLeadership>} />
                    <Route path="/recruiting" element={<RequireLeadership><Recruiting /></RequireLeadership>} />
                    <Route path="/campaigns/:id" element={<RequireLeadership><CampaignDetail /></RequireLeadership>} />
                    {/* Legacy payroll run — owner-only (kept accessible until Phase 4c cleanup). */}
                    <Route path="/payroll-run" element={<RequireOwner><PayrollRun /></RequireOwner>} />
                    <Route path="/settings/document-types" element={<RequireLeadership><DocumentTypes /></RequireLeadership>} />
                    <Route path="/settings/departments" element={<RequireLeadership><Departments /></RequireLeadership>} />
                    <Route path="/settings/policies" element={<RequireLeadership><Policies /></RequireLeadership>} />
                    <Route path="/hr/time-off" element={<RequireLeadership><HrTimeOff /></RequireLeadership>} />
                    <Route path="/hr/document-queue" element={<RequireLeadership><HrDocumentQueue /></RequireLeadership>} />
                    <Route path="/hr/document-queue/:id/edit" element={<RequireLeadership><HrDocumentDraft /></RequireLeadership>} />
                    {/* /solicitudes retired — redirect old bookmarks to the unified form. */}
                    <Route path="/solicitudes" element={<Navigate to="/vacation" replace />} />
                    <Route path="/holidays" element={<HolidayRequests />} />
                    <Route path="/policies" element={<MyPolicies />} />
                    <Route path="/account" element={<Account />} />
                    <Route path="/comunicados" element={<Comunicados />} />
                    <Route path="/admin/provision-org" element={<RequireOwner><ProvisionOrg /></RequireOwner>} />
                    <Route path="/admin/system-users" element={<RequireOwner><SystemUsers /></RequireOwner>} />
                    {/* Payroll — owner-only. RLS also locked to is_owner() on payroll_* tables. */}
                    <Route path="/admin/payroll" element={<RequireOwner><Payroll /></RequireOwner>} />
                    <Route path="/admin/payroll/week/:weekId" element={<RequireOwner><PayrollWeek /></RequireOwner>} />
                    <Route path="/admin/payroll/rates" element={<RequireOwner><PayrollRates /></RequireOwner>} />
                    <Route path="/admin/payroll/agent/:id" element={<RequireOwner><PayrollAgent /></RequireOwner>} />
                    <Route path="/admin/payroll/holidays" element={<RequireOwner><PayrollHolidays /></RequireOwner>} />
                    <Route path="/admin/payroll/client-holidays" element={<RequireOwner><ClientHolidays /></RequireOwner>} />
                    <Route path="/admin/payroll/periods" element={<RequireOwner><PayrollPeriods /></RequireOwner>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
