import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSalesAccess } from "@/hooks/useSalesLeads";

/**
 * Gate for the Sales tab. Only users on the sales_access allowlist (D + Joe for
 * now) get in; everyone else is bounced to redirectTo. Waits for the access
 * check before redirecting so the page doesn't flash-redirect on first render.
 */
export function RequireSalesAccess({
  children,
  redirectTo = "/",
  fallback = null,
}: {
  children: ReactNode;
  redirectTo?: string;
  fallback?: ReactNode;
}) {
  const { data: allowed, isLoading } = useSalesAccess();
  if (isLoading) return <>{fallback}</>;
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
