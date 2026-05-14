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
  UserCog,
  FileCheck,
  ScrollText,
  CalendarCheck,
  PlusSquare,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
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
  { title: "Payroll Run", url: "/payroll-run", icon: Calculator },
  { title: "Payroll History", url: "/historial", icon: History },
  { title: "Invoices (USD)", url: "/facturas", icon: FileText },
  { title: "Campaigns", url: "/campaigns", icon: Building2 },
  { title: "My Policies", url: "/policies", icon: ScrollText },
];

const hrItems = [
  { title: "Attendance", url: "/asistencia", icon: Clock },
  { title: "Performance", url: "/desempeno", icon: BarChart3 },
  { title: "Time Off Requests", url: "/solicitudes", icon: CalendarDays },
  { title: "Document Types", url: "/settings/document-types", icon: FileCheck },
  { title: "Departments", url: "/settings/departments", icon: Building2 },
  { title: "Manage Policies", url: "/settings/policies", icon: ScrollText },
  { title: "Time Off", url: "/hr/time-off", icon: CalendarDays },
  { title: "Cartas y Actas", url: "/hr/document-queue", icon: ClipboardList },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
];

// Team Lead — team-scoped views, shift settings (their campaign), no pay
const teamLeadItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "My Team", url: "/asistencia", icon: Users },
  { title: "Time Off Requests", url: "/solicitudes", icon: CalendarDays },
  { title: "Shift Settings", url: "/settings/shifts", icon: Settings },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
];

// Agent — only their own stuff
const agentItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Timeclock", url: "/reloj", icon: Timer },
  { title: "My EOD History", url: "/eod", icon: ClipboardCheck },
  { title: "Time Off Requests", url: "/solicitudes", icon: CalendarDays },
  { title: "My Policies", url: "/policies", icon: ScrollText },
  { title: "Vacation", url: "/vacation", icon: CalendarDays },
  { title: "Holiday Requests", url: "/holidays", icon: CalendarCheck },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut, user, isLeadership, isTeamLead, isAgent, isOwner } = useAuth();
  const collapsed = state === "collapsed";

  // Determine which items to show based on title
  let mainItems: { title: string; url: string; icon: typeof LayoutDashboard }[] = [];
  let showHRSection = false;

  if (isLeadership) {
    mainItems = leadershipItems;
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
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {showHRSection && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-widest text-sidebar-foreground/30 font-medium">Human Resources</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {hrItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
