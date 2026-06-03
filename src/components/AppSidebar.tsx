import {
  LayoutDashboard,
  Users,
  History,
  LogOut,
  FileText,
  Clock,
  BarChart3,
  CalendarDays,
  Timer,
  ClipboardCheck,
  ClipboardList,
  Settings,
  Building2,
  Calculator,
  DollarSign,
  UserCog,
  FileCheck,
  ScrollText,
  CalendarCheck,
  PlusSquare,
  ClipboardEdit,
  ShieldCheck,
  Megaphone,
  UserPlus,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePendingHrDocumentRequestsCount } from "@/hooks/useHrDocumentRequests";
import { usePendingTimeOffCount } from "@/hooks/useTimeOffCount";
import { usePendingAgentReviewsCount } from "@/hooks/useAgentReviews";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

// Leadership (owner / admin / manager) — sees everything including pay
const leadershipItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Employees", url: "/empleados", icon: Users },
  // Phase 4a: new payroll UI at /admin/payroll replaces the old /payroll-run entry.
  // The old PayrollRun page (/payroll-run) is still accessible by URL until Phase 4c cleanup.
  { title: "Payroll", url: "/admin/payroll", icon: DollarSign },
  { title: "Payroll History", url: "/historial", icon: History },
  { title: "Invoices (USD)", url: "/facturas", icon: FileText },
  { title: "Campaigns", url: "/campaigns", icon: Building2 },
  { title: "Recruiting", url: "/recruiting", icon: UserPlus },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "Announcements", url: "/comunicados", icon: Megaphone },
];

const hrItems = [
  { title: "Attendance", url: "/asistencia", icon: Clock },
  { title: "Performance", url: "/desempeno", icon: BarChart3 },
  { title: "30-Day Reviews", url: "/reviews", icon: ClipboardEdit },
  { title: "Document Types", url: "/settings/document-types", icon: FileCheck },
  { title: "Departments", url: "/settings/departments", icon: Building2 },
  { title: "Manage Policies", url: "/settings/policies", icon: ScrollText },
  // Time Off has TWO entries: "Time Off" is the org-wide approval queue,
  // "Request Time Off" is the personal submit form (same one agents/TLs use).
  // Leadership has employee records too, so they need both views.
  { title: "Time Off", url: "/hr/time-off", icon: CalendarDays },
  { title: "Cartas y Actas", url: "/hr/document-queue", icon: ClipboardList },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
  { title: "Request Time Off", url: "/vacation", icon: CalendarDays },
];

// Team Lead — team-scoped views, shift settings (their campaign), no pay
const teamLeadItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "My Team", url: "/asistencia", icon: Users },
  { title: "30-Day Reviews", url: "/reviews", icon: ClipboardEdit },
  // TLs approve their team's pending time-off in the Approvals card on Home.
  // "Request Time Off" below is for the TL's own submissions (TLs are still
  // employees who can request leave like anyone else).
  { title: "Shift Settings", url: "/settings/shifts", icon: Settings },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
  { title: "Request Time Off", url: "/vacation", icon: CalendarDays },
  { title: "Announcements", url: "/comunicados", icon: Megaphone },
];

// Agent — only their own stuff
const agentItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  // Unified time-off form (vacation / sick / personal / other). One form,
  // tenure determines what's available + paid vs unpaid.
  { title: "Time Off", url: "/vacation", icon: CalendarDays },
  { title: "Holiday Requests", url: "/holidays", icon: CalendarCheck },
  { title: "Announcements", url: "/comunicados", icon: Megaphone },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut, user, isLeadership, isTeamLead, isAgent, isOwner } = useAuth();
  const collapsed = state === "collapsed";

  // Sidebar badge counts — only fetched for leadership + TL. Agents don't
  // approve these so the badge wouldn't be meaningful for them, and HR docs
  // would error since agents have no RLS on hr_document_requests.
  const canApprove = isLeadership || isTeamLead;
  const { data: pendingHrDocCount = 0 } = usePendingHrDocumentRequestsCount(canApprove);
  const { data: pendingTimeOffCount = 0 } = usePendingTimeOffCount(canApprove);
  const { data: pendingReviewsCount = 0 } = usePendingAgentReviewsCount(canApprove);
  const badgeCounts: Record<string, number> = {
    "/hr/document-queue": pendingHrDocCount,
    // Sidebar badge moved here when /solicitudes was retired. Counts pending_tl +
    // pending_hr from the unified vacation_requests table.
    "/hr/time-off": pendingTimeOffCount,
    "/reviews": pendingReviewsCount,
  };

  // Determine which items to show based on title
  let mainItems: { title: string; url: string; icon: typeof LayoutDashboard }[] = [];
  let showHRSection = false;

  if (isLeadership) {
    // Owner-only items: invoices + payroll + payroll history.
    // Hidden from admins/managers (they still see everything else).
    const ownerOnlyUrls = ["/facturas", "/admin/payroll", "/historial"];
    mainItems = isOwner
      ? leadershipItems
      : leadershipItems.filter((i) => !ownerOnlyUrls.includes(i.url));
    showHRSection = true;
  } else if (isTeamLead) {
    mainItems = teamLeadItems;
  } else if (isAgent) {
    mainItems = agentItems;
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img
              src="/joi-logo.svg"
              alt="JOI"
              className="h-10 w-auto select-none"
              draggable={false}
            />
            <div>
              <h2 className="text-sm font-bold tracking-tight text-sidebar-foreground">Payroll & HR</h2>
              <p className="text-[11px] uppercase tracking-widest text-sidebar-foreground/40 font-medium">Management</p>
            </div>
          </div>
        )}
        {collapsed && (
          <img
            src="/joi-favicon.svg"
            alt="JOI"
            className="h-8 w-8 mx-auto select-none"
            draggable={false}
          />
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-widest text-sidebar-foreground/30 font-medium">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const badgeCount = badgeCounts[item.url] ?? 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent relative"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && (
                          <span className="flex-1 flex items-center justify-between gap-2">
                            <span>{item.title}</span>
                            {badgeCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 min-w-[18px] h-[18px] text-[10px] font-semibold leading-none text-destructive-foreground"
                                aria-label={`${badgeCount} pending`}
                              >
                                {badgeCount > 99 ? "99+" : badgeCount}
                              </span>
                            )}
                          </span>
                        )}
                        {collapsed && badgeCount > 0 && (
                          <span
                            className="absolute top-0.5 right-0.5 inline-flex items-center justify-center rounded-full bg-destructive w-2 h-2"
                            aria-label={`${badgeCount} pending`}
                          />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {showHRSection && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-widest text-sidebar-foreground/30 font-medium">Human Resources</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {hrItems.map((item) => {
                  const badgeCount = badgeCounts[item.url] ?? 0;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          className="hover:bg-sidebar-accent relative"
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                        >
                          <item.icon className="mr-2 h-4 w-4" />
                          {!collapsed && (
                            <span className="flex-1 flex items-center justify-between gap-2">
                              <span>{item.title}</span>
                              {badgeCount > 0 && (
                                <span
                                  className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 min-w-[18px] h-[18px] text-[10px] font-semibold leading-none text-destructive-foreground"
                                  aria-label={`${badgeCount} pending`}
                                >
                                  {badgeCount > 99 ? "99+" : badgeCount}
                                </span>
                              )}
                            </span>
                          )}
                          {collapsed && badgeCount > 0 && (
                            <span
                              className="absolute top-0.5 right-0.5 inline-flex items-center justify-center rounded-full bg-destructive w-2 h-2"
                              aria-label={`${badgeCount} pending`}
                            />
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* Owner-only admin section */}
        {isOwner && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-widest text-sidebar-foreground/30 font-medium">Owner</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin/system-users"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {!collapsed && <span>System Users</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* TODO: re-enable when multi-tenancy / white-label provisioning is in scope.
            The /admin/provision-org route + ProvisionOrg page + provision-org edge
            function are all still wired up — only the nav entry is hidden here.
        {isOwner && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-widest text-sidebar-foreground/30 font-medium">Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin/provision-org"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <PlusSquare className="mr-2 h-4 w-4" />
                      {!collapsed && <span>New Organization</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        */}
      </SidebarContent>
      <SidebarFooter className="p-2">
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/50 px-2 mb-1 truncate">{user.email}</p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/account"
                className="hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
              >
                <UserCog className="mr-2 h-4 w-4" />
                {!collapsed && <span>My Account</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
