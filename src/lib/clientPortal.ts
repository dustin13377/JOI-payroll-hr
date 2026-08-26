/**
 * Shared helpers for the client-facing portal pages. Kept out of the page
 * files so ClientDashboard, ClientRoleDetail, and any future team-side pages
 * render the same source labels and week windows without drifting.
 */

/**
 * Normalizes ft_source + ft_channel into a short label a client can
 * reconcile against their ad-platform reports. "Facebook Ad" = paid social;
 * "Facebook (organic)" = share/page post; "Direct" = no UTM.
 */
export function formatSource(
  ft_source: string | null | undefined,
  ft_channel: string | null | undefined,
): string {
  const src = (ft_source ?? "").trim().toLowerCase();
  const ch = (ft_channel ?? "").trim().toLowerCase();
  const isPaid = ch.includes("paid") || ch.includes("cpc") || ch.includes("cpm");

  if (!src) return "Direct";
  // Reject junk: HTML-encoded entities, unfilled ad-platform template tokens
  // like [mtk:first.source] (Facebook), URL-looking values, or anything with
  // punctuation. Real ft_source is always a single lowercased word.
  if (/[.[\]{};&/\\<>]/.test(src) || src.includes("mtk")) return "Direct";
  if (
    src === "fb" ||
    src === "facebook" ||
    src === "meta" ||
    src === "instagram" ||
    src === "ig"
  ) {
    const label = src === "instagram" || src === "ig" ? "Instagram" : "Facebook";
    return isPaid ? `${label} Ad` : `${label} (organic)`;
  }
  if (src === "google" || src === "adwords" || src === "gads") {
    return isPaid ? "Google Ad" : "Google (organic)";
  }
  if (src === "whatsapp" || src === "wa") return "WhatsApp Referral";
  if (src === "tiktok") return isPaid ? "TikTok Ad" : "TikTok (organic)";
  if (src === "linkedin") return isPaid ? "LinkedIn Ad" : "LinkedIn (organic)";
  // Unknown source — pass through capitalized so the client sees something
  // and can flag any weird ones for us to normalize.
  const raw = ft_source ?? "";
  const pretty = raw.charAt(0).toUpperCase() + raw.slice(1);
  return isPaid ? `${pretty} Ad` : pretty;
}

/**
 * ISO string for local-midnight Monday of this week. Used to filter "this
 * week" against `created_at` (which is a UTC-ISO string from Postgres).
 * String comparison against ISO timestamps is safe because ISO 8601 sorts
 * lexicographically.
 */
export function mondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString();
}

/** Short date like "Aug 25" for applicant rows. */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
