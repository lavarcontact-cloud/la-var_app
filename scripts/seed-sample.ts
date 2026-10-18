// Données d'EXEMPLE pour le développement local uniquement.
// Usage : npm run db:sample   (refuse de tourner hors d'une URL locale)
// Chaque publication porte is_sample = true : badge "Exemple" visible, et
// aucun titre ne se présente comme une actualité réelle.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error("Refus : ce script ne s'exécute que sur la pile Supabase locale.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const assets = process.argv[2] ?? path.resolve(import.meta.dirname, "../../avant-la-sortie");

async function account(email: string, handle: string, name: string, role: string, verified: boolean) {
  const { data: list } = await sb.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: "motdepasse-local-123", email_confirm: true, user_metadata: { handle, display_name: name } });
    if (error) throw error;
    user = data.user!;
  }
  await sb.from("profiles").update({ role, is_verified: verified, display_name: name }).eq("id", user.id);
  return user.id;
}

async function upload(owner: string, file: string, type: string) {
  const p = `${owner}/${path.basename(file)}`;
  const { error } = await sb.storage.from("media").upload(p, fs.readFileSync(file), { contentType: type, upsert: true });
  if (error) throw error;
  return p;
}

const lavar = await account("redaction@lavar.local", "lavar", "LA VAR", "admin", true);
const membre = await account("membre@lavar.local", "membre_test", "Membre test", "member", false);

const img = (f: string) => path.join(assets, "images", f);
// Vidéos : versions WebM et affiches produites pour le portfolio (lisibles par
// le Chromium de test, qui n'a pas le codec H.264).
const vid = (f: string) => path.join(assets, "portfolio/public/media/videos", f);
const poster = (f: string) => path.join(assets, "portfolio/public/media/posters", f);
const media = {
  klm: await upload(lavar, img("lavar-post-klm.jpg"), "image/jpeg"),
  creamy: await upload(lavar, img("lavar-post-creamy.jpg"), "image/jpeg"),
  rnboi: await upload(lavar, vid("lavar-rnboi-preview.webm"), "video/webm"),
  rnboiPoster: await upload(lavar, poster("lavar-rnboi-preview.jpg"), "image/jpeg"),
  rvfleuze: await upload(lavar, vid("lavar-rvfleuze-preview.webm"), "video/webm"),
  rvfleuzePoster: await upload(lavar, poster("lavar-rvfleuze-preview.jpg"), "image/jpeg"),
};

await sb.from("posts").delete().eq("is_sample", true);
const posts = [
  { author_id: lavar, kind: "video", category: "decouverte", title: "Exemple de publication vidéo verticale", body: "Extrait de contenu publié par LA VAR, utilisé ici pour tester le fil.", media: [{ path: media.rvfleuze, type: "video", poster: media.rvfleuzePoster }], info_status: "officiel", is_editorial: true, is_featured: true },
  { author_id: lavar, kind: "photo", category: "actu", title: "Exemple de visuel d'actu", body: "Visuel publié par LA VAR, utilisé pour tester l'affichage photo.", media: [{ path: media.creamy, type: "image" }], info_status: "officiel", is_editorial: true },
  { author_id: lavar, kind: "video", category: "clip", title: "Exemple de clip dans le fil", media: [{ path: media.rnboi, type: "video", poster: media.rnboiPoster }], info_status: "officiel", is_editorial: true },
  { author_id: membre, kind: "photo", category: "tendance", title: "Exemple de publication d'un membre", body: "Une publication de membre arrive avec le statut « À vérifier ».", media: [{ path: media.klm, type: "image" }], info_status: "a_verifier" },
  { author_id: membre, kind: "article", category: "sortie", title: "Exemple d'article sans média", body: "Les publications sans image s'affichent en carte typographique, dans le cadre rouge du logo.", info_status: "rumeur" },
].map((p) => ({ body: null, media: [], is_editorial: false, is_featured: false, ...p, is_sample: true }));
const { error } = await sb.from("posts").insert(posts);
if (error) throw error;
console.log(`${posts.length} publications d'exemple créées. Comptes : redaction@lavar.local (admin) et membre@lavar.local, mot de passe local "motdepasse-local-123".`);
