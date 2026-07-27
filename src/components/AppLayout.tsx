import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { InterviewReminderBanner } from "@/components/InterviewReminderBanner";
import { usePageTracking } from "@/hooks/usePageTracking";

export function AppLayout({ children }: { children: React.ReactNode }) {
  // Log each page view for feature-usage analytics (fire-and-forget, owner-read).
  usePageTracking();

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 h-14 flex items-center px-6 gap-3 bg-background/80 backdrop-blur-xl">
            <SidebarTrigger />
            <h1 className="text-base font-semibold tracking-tight text-foreground">JOI Payroll & HR</h1>
          </header>
          <InterviewReminderBanner />
          <main className="flex-1 overflow-auto p-6 bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
