// B2/B3 Phase 5c: Issue a signed URL for carta/acta PDF or signed scan.
//
// Authorization: the caller's JWT is used to query the finalization table
// (RLS enforces access — agent sees own signed docs, TL sees team, leadership
// sees all). If the row is returned, a service_role client issues the signed
// URL from storage (bypasses storage RLS which is leadership-only).
//
// POST body: { finalizationId: string, type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno", fileType: "pdf" | "signed_scan" }
// Returns:   { signedUrl: string }

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS_RAW =
  Deno.env.get("ALLOWED_ORIGIN") ?? "https://app.justoutsource.it";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { finalizationId, type, fileType } = await req.json();

    if (!finalizationId || !type || !fileType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: finalizationId, type, fileType" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!["carta", "acta", "renuncia", "rescision_prueba", "rescision_desempeno"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!["pdf", "signed_scan"].includes(fileType)) {
      return new Response(
        JSON.stringify({ error: "Invalid fileType" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Prefer APP_SUPABASE_KEY (publishable key) so this function is decoupled
    // from Supabase's auto-injected legacy anon key. Falls back to the
    // auto-injected SUPABASE_ANON_KEY until legacy keys are retired.
    const supabaseAnonKey =
      Deno.env.get("APP_SUPABASE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // User-scoped client (RLS enforces access)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const table =
      type === "rescision_desempeno"
        ? "rescision_desempeno_documents"
        : type === "rescision_prueba"
          ? "rescision_prueba_documents"
          : type === "renuncia"
            ? "resignation_packets"
            : type === "carta"
              ? "cartas_compromiso"
              : "actas_administrativas";
    const pathColumn = fileType === "pdf" ? "pdf_path" : "signed_scan_path";

    const { data: row, error: queryErr } = await userClient
      .from(table)
      .select(`id, ${pathColumn}`)
      .eq("id", finalizationId)
      .maybeSingle();

    if (queryErr) {
      console.error("Query error:", queryErr);
      return new Response(
        JSON.stringify({ error: "Query failed" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!row) {
      // RLS blocked the row (agent doesn't own it, TL not on team) or row doesn't exist
      return new Response(
        JSON.stringify({ error: "Document not found or access denied" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const filePath = row[pathColumn];
    if (!filePath) {
      return new Response(
        JSON.stringify({ error: `No ${fileType === "pdf" ? "PDF" : "signed scan"} available` }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Service-role client (bypasses storage RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: urlData, error: urlErr } = await serviceClient.storage
      .from("hr-documents")
      .createSignedUrl(filePath, 60 * 15); // 15 minutes

    if (urlErr) {
      console.error("Signed URL error:", urlErr);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ signedUrl: urlData.signedUrl }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
