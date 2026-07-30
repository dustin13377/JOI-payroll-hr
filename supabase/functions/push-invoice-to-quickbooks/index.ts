/**
 * push-invoice-to-quickbooks  (phase 1 — books only, SIMPLE mode)
 *
 * Mirrors one app invoice into QuickBooks Online as a SINGLE summary line:
 *   - Amount = the invoice grand total (SUM of invoice_lines.total_price), which
 *     already includes the holiday 3x premium and spiffs. We do NOT re-derive
 *     any of that math here — QB just receives the one final number, so the QB
 *     total can never drift from the app.
 *   - The per-agent detail rides along as the attached invoice+timesheet PDF
 *     (generated in the browser, passed in as base64), the same PDF the client
 *     already gets by email.
 *
 * Flow:
 *   1. JWT auth — owner / admin / manager only.
 *   2. Load invoice + its client; resolve the org's QuickBooks connection.
 *   3. Get a valid access token (refresh if expired; PERSIST the rotated
 *      refresh token every time).
 *   4. Find-or-create the QB Customer for the client (cache the id on clients).
 *   5. Find-or-create the "Mexico agents" service Item.
 *   6. Create the QB Invoice (DocNumber = our invoice_number).
 *   7. Attach the PDF (non-fatal if it fails — the invoice is already in QB).
 *   8. Write quickbooks_invoice_id + sync status back onto the invoice row.
 *
 * Required secrets:
 *   QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET
 *   QUICKBOOKS_ENV               "sandbox" (default) | "production"
 *   QUICKBOOKS_ORG_ID            org that owns the connection (fallback if the
 *                                invoice's client has no organization_id)
 *   QUICKBOOKS_MINOR_VERSION     QBO API minor version (default "75")
 *   QUICKBOOKS_SERVICE_ITEM_NAME service item name (default "Mexico agents")
 *   ALLOWED_ORIGIN               CORS allow-list (defaults to app domain)
 * Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET") ?? "";
const QBO_ENV = (Deno.env.get("QUICKBOOKS_ENV") ?? "sandbox").toLowerCase();
const ORG_ID = Deno.env.get("QUICKBOOKS_ORG_ID") ?? "";
const MINOR_VERSION = Deno.env.get("QUICKBOOKS_MINOR_VERSION") ?? "75";
const SERVICE_ITEM_NAME = Deno.env.get("QUICKBOOKS_SERVICE_ITEM_NAME") ?? "Mexico agents";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE = QBO_ENV === "production"
  ? "https://quickbooks.api.intuit.com"
  : "https://sandbox-quickbooks.api.intuit.com";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it")
  .split(",").map((o) => o.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface Conn {
  organization_id: string;
  realm_id: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  refresh_token: string | null;
}

// Return a valid access token, refreshing (and persisting the rotated refresh
// token) if the cached one is missing or within 60s of expiry.
async function getAccessToken(supabase: SupabaseClient, conn: Conn): Promise<string> {
  const stillValid =
    conn.access_token &&
    conn.access_token_expires_at &&
    new Date(conn.access_token_expires_at).getTime() - Date.now() > 60_000;
  if (stillValid) return conn.access_token as string;

  if (!conn.refresh_token) throw new Error("QuickBooks is not connected (no refresh token)");

  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error_description?: string; error?: string }).error_description ??
      (json as { error?: string }).error ?? `Token refresh HTTP ${res.status}`;
    // invalid_grant means the refresh token is dead — user must reconnect.
    throw new Error(`QuickBooks connection expired — reconnect it. (${msg})`);
  }

  const now = Date.now();
  const accessToken = json.access_token as string;
  await supabase.from("quickbooks_connections").update({
    access_token: accessToken,
    access_token_expires_at: new Date(now + (Number(json.expires_in ?? 3600) - 60) * 1000).toISOString(),
    refresh_token: json.refresh_token as string, // rotated — always persist
    refresh_token_expires_at: new Date(now + Number(json.x_refresh_token_expires_in ?? 8640000) * 1000).toISOString(),
    updated_at: new Date(now).toISOString(),
  }).eq("organization_id", conn.organization_id);

  return accessToken;
}

// Thin QBO API helper. Throws with the QB fault message on non-2xx.
async function qbFetch(
  accessToken: string,
  realmId: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}/v3/company/${realmId}${path}${sep}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fault = (json as any)?.Fault?.Error?.[0];
    const msg = fault ? `${fault.Message}${fault.Detail ? ` — ${fault.Detail}` : ""}` : `QuickBooks HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// Escape a value for a QBO SQL-ish query string (single quotes).
const qbEscape = (s: string) => s.replace(/'/g, "\\'");

async function ensureCustomer(
  supabase: SupabaseClient,
  accessToken: string,
  realmId: string,
  client: { id: string; name: string; bill_to_name: string | null; quickbooks_customer_id: string | null },
): Promise<string> {
  if (client.quickbooks_customer_id) return client.quickbooks_customer_id;

  const displayName = (client.bill_to_name || client.name || "").trim();
  if (!displayName) throw new Error("Client has no name to use as a QuickBooks customer");

  // Try to find an existing customer with this display name.
  const q = `select Id, DisplayName from Customer where DisplayName = '${qbEscape(displayName)}'`;
  const found = await qbFetch(accessToken, realmId, `/query?query=${encodeURIComponent(q)}`);
  let customerId: string | undefined = found?.QueryResponse?.Customer?.[0]?.Id;

  if (!customerId) {
    const created = await qbFetch(accessToken, realmId, `/customer`, {
      method: "POST",
      body: JSON.stringify({ DisplayName: displayName }),
    });
    customerId = created?.Customer?.Id;
  }
  if (!customerId) throw new Error("Could not find or create the QuickBooks customer");

  // Cache it on the client so we don't look it up again.
  await supabase.from("clients").update({ quickbooks_customer_id: customerId }).eq("id", client.id);
  return customerId;
}

async function ensureServiceItem(accessToken: string, realmId: string): Promise<string> {
  const q = `select Id, Name from Item where Name = '${qbEscape(SERVICE_ITEM_NAME)}'`;
  const found = await qbFetch(accessToken, realmId, `/query?query=${encodeURIComponent(q)}`);
  const existing: string | undefined = found?.QueryResponse?.Item?.[0]?.Id;
  if (existing) return existing;

  // Need an income account to create a Service item. Grab the first Income account.
  const acctQ = `select Id, Name from Account where AccountType = 'Income' maxresults 1`;
  const accts = await qbFetch(accessToken, realmId, `/query?query=${encodeURIComponent(acctQ)}`);
  const incomeAccountId: string | undefined = accts?.QueryResponse?.Account?.[0]?.Id;
  if (!incomeAccountId) {
    throw new Error(`No QuickBooks service item named "${SERVICE_ITEM_NAME}" and no Income account to create one — create the item once in QuickBooks, then retry.`);
  }

  const created = await qbFetch(accessToken, realmId, `/item`, {
    method: "POST",
    body: JSON.stringify({
      Name: SERVICE_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: incomeAccountId },
    }),
  });
  const id = created?.Item?.Id;
  if (!id) throw new Error("Could not create the QuickBooks service item");
  return id;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Attach the PDF to the QB invoice via the Attachable upload endpoint.
// Returns true on success. Non-fatal: caller keeps the sync as successful.
async function attachPdf(
  accessToken: string,
  realmId: string,
  qbInvoiceId: string,
  pdfBase64: string,
  filename: string,
): Promise<boolean> {
  try {
    const meta = {
      AttachableRef: [{ EntityRef: { type: "Invoice", value: qbInvoiceId }, IncludeOnSend: false }],
      FileName: filename,
      ContentType: "application/pdf",
    };
    const fd = new FormData();
    fd.append("file_metadata_01", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    fd.append("file_content_01", new Blob([base64ToBytes(pdfBase64)], { type: "application/pdf" }), filename);
    await qbFetch(accessToken, realmId, `/upload`, { method: "POST", body: fd });
    return true;
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const jsonHeaders = { "Content-Type": "application/json", ...cors };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "POST only");
  if (!CLIENT_ID || !CLIENT_SECRET) return fail(500, "QuickBooks app credentials not configured");

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Auth.
  const authHeader = req.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) return fail(401, "Authorization: Bearer <jwt> required");
  const { data: userData, error: authErr } = await supabase.auth.getUser(m[1]);
  if (authErr || !userData?.user) return fail(401, "Invalid or expired session");
  const { data: profile } = await supabase
    .from("user_profiles").select("role").eq("id", userData.user.id).single();
  if (!profile || !["owner", "admin", "manager"].includes(profile.role as string)) {
    return fail(403, "Only leadership can push invoices to QuickBooks");
  }

  // 2. Parse body + load invoice/client.
  const body = (await req.json().catch(() => ({}))) as {
    invoice_id?: string; pdf_base64?: string; pdf_filename?: string;
  };
  const invoiceId = body.invoice_id?.trim();
  if (!invoiceId) return fail(400, "invoice_id is required");

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, week_start, week_end, due_date, project_name, quickbooks_invoice_id, clients(id, name, bill_to_name, organization_id, quickbooks_customer_id)")
    .eq("id", invoiceId)
    .single();
  if (invErr || !invoice) return fail(404, "Invoice not found");

  const client = (invoice as any).clients as {
    id: string; name: string; bill_to_name: string | null;
    organization_id: string | null; quickbooks_customer_id: string | null;
  } | null;
  if (!client) return fail(400, "Invoice has no client");

  const orgId = client.organization_id ?? ORG_ID;
  if (!orgId) return fail(500, "Could not resolve organization (set QUICKBOOKS_ORG_ID)");

  // Server-side grand total = SUM(total_price). This is the number we push.
  const { data: lineRows, error: lineErr } = await supabase
    .from("invoice_lines").select("total_price").eq("invoice_id", invoiceId);
  if (lineErr) return fail(500, `Could not read invoice lines: ${lineErr.message}`);
  const total = (lineRows ?? []).reduce((s, r: any) => s + Number(r.total_price ?? 0), 0);
  const totalRounded = Math.round(total * 100) / 100;
  if (totalRounded <= 0) return fail(400, "Invoice total is zero — nothing to push");

  // 3. Connection + token.
  const { data: conn } = await supabase
    .from("quickbooks_connections")
    .select("organization_id, realm_id, access_token, access_token_expires_at, refresh_token")
    .eq("organization_id", orgId)
    .single();
  if (!conn || !conn.realm_id || !conn.refresh_token) {
    return fail(400, "QuickBooks isn't connected yet — connect it first");
  }

  const markError = async (msg: string) => {
    await supabase.from("invoices").update({
      quickbooks_sync_status: "error",
      quickbooks_sync_error: msg,
      quickbooks_synced_at: new Date().toISOString(),
    }).eq("id", invoiceId);
  };

  try {
    const accessToken = await getAccessToken(supabase, conn as Conn);
    const realmId = conn.realm_id as string;

    const customerId = await ensureCustomer(supabase, accessToken, realmId, client);
    const itemId = await ensureServiceItem(accessToken, realmId);

    const period = `${invoice.week_start} — ${invoice.week_end}`;
    const description = `Mexico agents${invoice.project_name ? ` — ${invoice.project_name}` : ""} (${period})`;
    // DocNumber max length in QBO is 21 chars.
    const docNumber = String(invoice.invoice_number ?? "").slice(0, 21);

    const invoicePayload: Record<string, unknown> = {
      Line: [{
        Amount: totalRounded,
        DetailType: "SalesItemLineDetail",
        Description: description,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: 1,
          UnitPrice: totalRounded,
        },
      }],
      CustomerRef: { value: customerId },
      TxnDate: invoice.week_start,
      DueDate: invoice.due_date,
    };
    if (docNumber) invoicePayload.DocNumber = docNumber;

    const created = await qbFetch(accessToken, realmId, `/invoice`, {
      method: "POST",
      body: JSON.stringify(invoicePayload),
    });
    const qbInvoiceId: string | undefined = created?.Invoice?.Id;
    if (!qbInvoiceId) throw new Error("QuickBooks did not return an invoice id");

    let attached = false;
    if (body.pdf_base64) {
      attached = await attachPdf(
        accessToken, realmId, qbInvoiceId, body.pdf_base64,
        body.pdf_filename?.trim() || `${docNumber || "invoice"}.pdf`,
      );
    }

    await supabase.from("invoices").update({
      quickbooks_invoice_id: qbInvoiceId,
      quickbooks_sync_status: "synced",
      quickbooks_sync_error: null,
      quickbooks_synced_at: new Date().toISOString(),
    }).eq("id", invoiceId);

    return new Response(JSON.stringify({
      status: "synced",
      quickbooks_invoice_id: qbInvoiceId,
      total: totalRounded,
      pdf_attached: attached,
    }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markError(msg);
    return fail(502, msg);
  }
});
