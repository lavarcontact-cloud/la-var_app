import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Accès à la pile Supabase LOCALE (supabase start). Les clés sont celles de
 * démonstration publiques de l'environnement local, lues à l'exécution
 * (jamais écrites dans le dépôt).
 */
function readEnv() {
  const out = execSync("npx --no-install supabase status -o env", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString();
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1] ?? "";
  return { url: get("API_URL"), anon: get("ANON_KEY"), service: get("SERVICE_ROLE_KEY"), db: get("DB_URL") };
}
export const env = readEnv();
export const sql = postgres(env.db, { onnotice: () => {} });
export const admin = createClient(env.url, env.service, { auth: { persistSession: false } });
export const anon = () => createClient(env.url, env.anon, { auth: { persistSession: false } });

const created: string[] = [];

/** Supprime les comptes créés par les tests (publications, likes… en cascade) et leurs fichiers. */
export async function cleanup() {
  for (const id of created.splice(0)) {
    const { data } = await admin.storage.from("media").list(id);
    if (data?.length) await admin.storage.from("media").remove(data.map((f) => `${id}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) throw new Error(`suppression du compte ${id} impossible : ${error.message}`);
  }
}

/** Crée un compte confirmé et renvoie un client connecté. */
export async function user(handle: string, role?: "member" | "artist" | "editor" | "moderator" | "admin", verified = false) {
  const email = `${handle}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  const password = "motdepasse-de-test-123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { handle } });
  if (error) throw error;
  const id = data.user!.id;
  created.push(id);
  if (role || verified) await sql`update public.profiles set role = ${role ?? "member"}, is_verified = ${verified} where id = ${id}`;
  const client: SupabaseClient = anon();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id, client, email };
}
