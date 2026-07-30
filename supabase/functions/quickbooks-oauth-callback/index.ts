/**
 * quickbooks-oauth-callback
 *
 * Handles the one-time "Connect to QuickBooks" OAuth 2.0 handshake for a private
 * app connected to JOI's own QuickBooks company. Two modes on one function:
 *
 *   A) POST  (JWT-authenticated, leadership only)  { action: "authorize_url" }
 *      -> generates a CSRF `state`, stores it on the org's connection row, and
 *         returns the Intuit authorize URL for the browser to open.
 *
 *   B) GET   (public — this is the redirect_uri Intuit sends the browser back to)
 *      ?code=...&realmId=...&state=...
 *      -> matches the row by `state`, exchanges the code for tokens, stores the
 *         realm id + refresh token, and returns a small success page.
 *
 * The refresh token ROTATES: Intuit may hand back a new refresh token on every
 * exchange/refresh, and it expires after ~100 days of no use. We always persist
 * whatever comes back, so the connection stays alive.
 *
 * Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
 *   QUICKBOOKS_CLIENT_ID       Intuit app client id.
 *   QUICKBOOKS_CLIENT_SECRET   Intuit app client secret.
 *   QUICKBOOKS_REDIRECT_URI    Must EXACTLY match the redirect URI registered in
 *                              the Intuit app. Defaults to this function's URL.
 *   QUICKBOOKS_ORG_ID          The organization id that owns the connection
 *                              (JOI). Single-tenant shortcut so we don't have to
 *                              derive the org from the user.
 *   ALLOWED_ORIGIN             CORS allow-list (comma-separated). Defaults to app.
 *   APP_BASE_URL               Where to bounce the browser after a successful
 *                              connect. Defaults to the app domain /facturas.
 *
 * Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET") ?? "";
const REDIRECT_URI =
  Deno.env.get("QUICKBOOKS_REDIRECT_URI") ??
  `${SUPABASE_URL}/functions/v1/quickbooks-oauth-callback`;
const ORG_ID = Deno.env.get("QUICKBOOKS_ORG_ID") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://app.justoutsource.it";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? APP_BASE_URL)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

// A short random state string (CSRF protection for the OAuth round-trip).
function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function htmlPage(title: string, body: string, redirectTo?: string): Response {
  const meta = redirectTo
    ? `<meta http-equiv="refresh" content="3;url=${redirectTo}">`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8">${meta}` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title>` +
    `<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;` +
    `max-width:520px;margin:80px auto;padding:0 20px;color:#111;line-height:1.5}` +
    `.ok{color:#0a7d33}.err{color:#b3261e}a{color:#2563eb}</style></head>` +
    `<body>${body}</body></html>`;
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(html, { status: 200, headers });
}

async function exchangeCode(code: string): Promise<Record<string, unknown>> {
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error_description?: string; error?: string }).error_description ??
      (json as { error?: string }).error ?? `Token exchange HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as Record<string, unknown>;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const jsonHeaders = { "Content-Type": "application/json", ...cors };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!CLIENT_ID || !CLIENT_SECRET) return fail(500, "QuickBooks app credentials not configured");
  if (!ORG_ID) return fail(500, "QUICKBOOKS_ORG_ID secret is not set");

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── Mode A: POST -> return the authorize URL (leadership only) ────────────
  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const m = authHeader.match(/^Bearer (.+)$/);
    if (!m) return fail(401, "Authorization: Bearer <jwt> required");
    const { data: userData, error: authErr } = await supabase.auth.getUser(m[1]);
    if (authErr || !userData?.user) return fail(401, "Invalid or expired session");

    const { data: profile } = await supabase
      .from("user_profiles").select("role").eq("id", userData.user.id).single();
    if (!profile || !["owner", "admin", "manager"].includes(profile.role as string)) {
      return fail(403, "Only leadership can connect QuickBooks");
    }

    const state = randomState();
    const { error: upErr } = await supabase
      .from("quickbooks_connections")
      .upsert(
        { organization_id: ORG_ID, pending_state: state, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" },
      );
    if (upErr) return fail(500, `Could not start connect: ${upErr.message}`);

    const url = `${AUTHORIZE_URL}?${new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      scope: SCOPE,
      redirect_uri: REDIRECT_URI,
      state,
    })}`;
    return new Response(JSON.stringify({ url }), { status: 200, headers: jsonHeaders });
  }

  // ── Mode B: GET -> Intuit redirected the browser back here ────────────────
  if (req.method === "GET") {
    const u = new URL(req.url);
    const code = u.searchParams.get("code");
    const realmId = u.searchParams.get("realmId");
    const state = u.searchParams.get("state");
    const error = u.searchParams.get("error");

    if (error) {
      return htmlPage("QuickBooks connection cancelled",
        `<h2 class="err">Connection cancelled</h2><p>QuickBooks reported: ${error}. You can close this tab and try again.</p>`);
    }
    if (!code || !realmId || !state) {
      return htmlPage("QuickBooks connection error",
        `<h2 class="err">Missing parameters</h2><p>This page is the QuickBooks redirect target and should only be opened by the connect flow.</p>`);
    }

    // Match the row by the state we stored when the flow started.
    const { data: conn } = await supabase
      .from("quickbooks_connections")
      .select("organization_id, pending_state")
      .eq("pending_state", state)
      .single();
    if (!conn) {
      return htmlPage("QuickBooks connection error",
        `<h2 class="err">Could not verify this request</h2><p>The security token didn't match. Start the connect again from the app.</p>`);
    }

    let tokens: Record<string, unknown>;
    try {
      tokens = await exchangeCode(code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return htmlPage("QuickBooks connection failed",
        `<h2 class="err">Token exchange failed</h2><p>${msg}</p>`);
    }

    const now = Date.now();
    const accessExpires = new Date(now + (Number(tokens.expires_in ?? 3600) - 60) * 1000);
    const refreshExpires = new Date(now + Number(tokens.x_refresh_token_expires_in ?? 8640000) * 1000);

    const { error: saveErr } = await supabase
      .from("quickbooks_connections")
      .update({
        realm_id: realmId,
        access_token: tokens.access_token as string,
        access_token_expires_at: accessExpires.toISOString(),
        refresh_token: tokens.refresh_token as string,
        refresh_token_expires_at: refreshExpires.toISOString(),
        pending_state: null,
        connected_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .eq("organization_id", conn.organization_id);
    if (saveErr) {
      return htmlPage("QuickBooks connection error",
        `<h2 class="err">Couldn't save the connection</h2><p>${saveErr.message}</p>`);
    }

    return htmlPage("QuickBooks connected",
      `<h2 class="ok">QuickBooks connected &#10003;</h2>` +
      `<p>Company ${realmId} is now linked. Returning you to the app...</p>` +
      `<p><a href="${APP_BASE_URL}/facturas">Continue to JOI &rarr;</a></p>`,
      `${APP_BASE_URL}/facturas`);
  }

  return fail(405, "Method not allowed");
});
