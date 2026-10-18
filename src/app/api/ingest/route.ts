import crypto from "node:crypto";
import { fetchFeedText, parseFeed } from "@/lib/ingest";
import { supabaseService } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Import planifié (Vercel Cron, voir vercel.json) des titres des sources
 * actives. Protégé par CRON_SECRET. Idempotent : un lien déjà connu n'est
 * jamais réinséré (clé de déduplication unique).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = supabaseService();
  if (!sb) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 503 });

  const { data: sources } = await sb.from("external_sources").select("id, name, feed_url, default_category, default_scope").eq("is_active", true);
  const report: { source: string; inserted: number; error?: string }[] = [];
  for (const s of sources ?? []) {
    try {
      const items = parseFeed(await fetchFeedText(s.feed_url));
      const rows = items.map((i) => ({ ...i, source_id: s.id, category: s.default_category, scope: s.default_scope }));
      const { data, error } = rows.length
        ? await sb.from("external_items").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id")
        : { data: [], error: null };
      if (error) throw new Error(error.message);
      await sb.from("external_sources").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", s.id);
      report.push({ source: s.name, inserted: data?.length ?? 0 });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : "erreur").slice(0, 200);
      await sb.from("external_sources").update({ last_fetched_at: new Date().toISOString(), last_error: msg }).eq("id", s.id);
      report.push({ source: s.name, inserted: 0, error: msg });
    }
  }
  // Rétention : les titres de plus de 90 jours sont supprimés.
  await sb.from("external_items").delete().lt("fetched_at", new Date(Date.now() - 90 * 86400_000).toISOString());
  return Response.json({ ok: true, report });
}
