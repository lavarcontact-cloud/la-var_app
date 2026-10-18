import crypto from "node:crypto";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase/server";

const input = z.object({
  service: z.string().max(40).optional().default(""),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().min(20).max(3000),
  budget: z.string().trim().max(60).optional().default(""),
  date: z.string().trim().max(80).optional().default(""),
  website: z.string().max(0).optional(), // champ piège anti-robot
});

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Demande de devis. La limitation de débit s'appuie sur une empreinte de
 * l'IP calculée ici (le navigateur ne peut pas la falsifier). Réponse
 * positive uniquement si la base a réellement enregistré la demande.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || new URL(origin).host !== host) return json({ error: "Origine refusée." }, 403);
  const sb = supabaseService();
  if (!sb) return json({ error: "Le formulaire de devis n'est pas encore activé sur cette version." }, 503);
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Vérifiez les champs : nom, e-mail valide et description d'au moins 20 caractères." }, 422);
  const d = parsed.data;
  if (d.website) return json({ error: "Requête refusée." }, 400);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnu";
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const key = crypto.createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 32);
  const { data, error } = await sb.rpc("submit_quote", {
    p_service: d.service, p_name: d.name, p_email: d.email, p_phone: d.phone, p_message: d.message, p_budget: d.budget, p_date: d.date, p_client_key: key,
  });
  if (error || !data) {
    return json({ error: /trop de demandes/i.test(error?.message ?? "") ? "Trop de demandes envoyées. Réessayez dans une heure." : "La demande n'a pas pu être enregistrée." }, error && /trop/.test(error.message) ? 429 : 500);
  }
  return json({ ok: true, id: data });
}
