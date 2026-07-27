import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Fire-and-forget page-view tracking for feature-usage analytics.
 *
 * Logs one row to feature_usage_events every time the route changes, so the
 * owner-only Usage dashboard can show what's used / underused / never touched.
 *
 * Privacy by design:
 *  - We send only the NORMALIZED path + event_type. Everything else (user,
 *    employee, role, org) is stamped server-side by the fue_fill_defaults
 *    trigger, so it can't be forged.
 *  - Dynamic ids are collapsed to ":id" BEFORE insert, so we never record which
 *    specific employee / invoice / campaign someone opened — just the section.
 *
 * It never blocks navigation and never surfaces an error to the user; a failed
 * insert is silently dropped (analytics is best-effort).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collapse id-like path segments so routes bucket together. */
export function normalizeUsagePath(pathname: string): string {
  const segs = pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      if (UUID_RE.test(s)) return ":id"; // uuids (invoice / campaign / etc.)
      if (/^JOI-/i.test(s)) return ":id"; // employee & candidate codes
      if (/^\d+$/.test(s)) return ":id"; // bare numeric ids
      if (/^[0-9a-f]{16,}$/i.test(s)) return ":id"; // long hex tokens
      return s;
    });
  return "/" + segs.join("/");
}

export function usePageTracking() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const path = normalizeUsagePath(pathname);
    // Don't double-log the same page on re-renders.
    if (lastLogged.current === path) return;
    lastLogged.current = path;

    // Table isn't in the generated Supabase types yet (regen deferred), so we
    // cast locally rather than weaken the whole typed client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .from("feature_usage_events")
      .insert({ path, event_type: "page_view" })
      .then(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ error }: { error: any }) => {
          if (error) console.debug("usage tracking skipped:", error.message);
        },
      );
  }, [pathname, session]);
}
