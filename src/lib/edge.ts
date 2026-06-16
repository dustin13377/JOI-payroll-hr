/**
 * Helpers for working with Supabase Edge Function responses.
 */

/**
 * Unwrap a Supabase Edge Function error into a human-readable message.
 *
 * When an edge function returns a non-2xx status, supabase-js sets `error` to a
 * FunctionsHttpError whose `.message` is always the unhelpful
 * "Edge Function returned a non-2xx status code". The actual JSON body (e.g.
 * { error: "TLs can only edit punches for their own campaign" }) is hidden on
 * `error.context`, which is the raw Response. This pulls that real message out.
 *
 * Use for any `supabase.functions.invoke` call so users see why something failed.
 */
export async function edgeErrorMessage(error: any): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    // fall through to the generic message
  }
  return error?.message ?? "Something went wrong";
}
