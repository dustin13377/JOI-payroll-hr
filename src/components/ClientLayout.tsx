import { Link, useLocation } from "react-router-dom";
import { UserPlus, Users, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="h-screen flex w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r bg-sidebar text-sidebar-foreground">
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-4 border-b">
          <img
            src="/joi-logo.svg"
            alt="JOI"
            className="h-8 w-auto select-none"
            draggable={false}
          />
          <div>
            <p className="text-xs font-bold tracking-tight">Client Portal</p>
          </div>
        </div>

        {/* Nav — two-tab split: hiring (Recruitment) vs live-agent management
             (Team). Team is stubbed until write features ship. */}
        <nav className="flex-1 p-2 space-y-1">
          <Link
            to="/client"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
              isActive("/client") && "bg-sidebar-accent text-sidebar-primary font-semibold",
            )}
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            Recruitment
          </Link>
          <Link
            to="/client/team"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
              isActive("/client/team") && "bg-sidebar-accent text-sidebar-primary font-semibold",
            )}
          >
            <Users className="h-4 w-4 shrink-0" />
            Team
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-2 border-t space-y-1">
          {user && (
            <p className="text-xs text-sidebar-foreground/50 px-3 py-1 truncate">{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 h-14 flex items-center px-6 bg-background/80 backdrop-blur-xl border-b">
          <h1 className="text-base font-semibold tracking-tight text-foreground">JOI Payroll & HR</h1>
        </header>
        <main className="flex-1 overflow-auto p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}
