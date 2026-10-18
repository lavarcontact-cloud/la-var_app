import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

/** Client serveur lié à la session de l'utilisateur (cookies). */
export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null;
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Appelé depuis un composant serveur : le proxy rafraîchit la session.
        }
      },
    },
  });
}

/**
 * Client "service" : contourne RLS. Réservé aux tâches serveur internes
 * (import des actualités). La clé n'existe que dans les variables
 * d'environnement serveur, jamais dans le navigateur.
 */
export function supabaseService(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}
