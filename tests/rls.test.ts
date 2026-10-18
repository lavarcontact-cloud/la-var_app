import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanup, sql, user } from "./local-stack";

type U = Awaited<ReturnType<typeof user>>;
let a: U, b: U, mod: U, editor: U, adminU: U, artist: U;

beforeAll(async () => {
  [a, b, mod, editor, adminU, artist] = await Promise.all([
    user("alice"), user("bruno"), user("modo", "moderator"), user("redac", "editor"), user("chef", "admin"), user("artiste", "artist", true),
  ]);
});
afterAll(async () => {
  await cleanup();
  await sql`delete from public.quote_requests where email in ('label@example.com', 's@example.com')`;
  await sql.end();
});

async function post(u: U, extra: Record<string, unknown> = {}) {
  const { data, error } = await u.client
    .from("posts")
    .insert({ kind: "article", category: "actu", title: "Test publication " + Math.random().toString(36).slice(2, 7), body: "corps", ...extra })
    .select()
    .single();
  if (error) throw error;
  return data;
}

describe("publications", () => {
  it("un visiteur lit le fil mais ne peut pas publier", async () => {
    await post(a);
    const v = anon();
    const { data } = await v.rpc("get_feed", { p_limit: 5 });
    expect((data ?? []).length).toBeGreaterThan(0);
    const { error } = await v.from("posts").insert({ kind: "article", category: "actu", title: "Intrus" });
    expect(error).not.toBeNull();
  });

  it("un membre ne peut ni se déclarer rédaction, ni confirmer une info, ni usurper un auteur", async () => {
    const p = await post(a, { info_status: "confirme" });
    expect(p.author_id).toBe(a.id);
    expect(p.info_status).toBe("a_verifier");
    expect(p.is_editorial).toBe(false);
    const { error } = await a.client.from("posts").insert({ kind: "article", category: "actu", title: "Usurpation", author_id: b.id });
    expect(error).not.toBeNull(); // colonne author_id non accordée
    const { error: e2 } = await a.client.from("posts").insert({ kind: "article", category: "actu", title: "Une forcée", is_featured: true });
    expect(e2).not.toBeNull();
  });

  it("un artiste vérifié peut marquer son annonce officielle, pas un membre", async () => {
    const p1 = await post(artist, { info_status: "officiel", category: "sortie" });
    expect(p1.info_status).toBe("officiel");
    const p2 = await post(a, { info_status: "officiel" });
    expect(p2.info_status).toBe("a_verifier");
  });

  it("personne ne modifie ou ne supprime la publication d'un autre", async () => {
    const p = await post(a);
    const up = await b.client.from("posts").update({ title: "Piraté !" }).eq("id", p.id).select();
    expect(up.data ?? []).toHaveLength(0);
    const del = await b.client.from("posts").delete().eq("id", p.id).select();
    expect(del.data ?? []).toHaveLength(0);
    const [row] = await sql`select title from public.posts where id = ${p.id}`;
    expect(row.title).toBe(p.title);
  });

  it("les compteurs ne sont pas modifiables par le client", async () => {
    const p = await post(a);
    const { error } = await a.client.from("posts").update({ like_count: 9999 }).eq("id", p.id);
    expect(error).not.toBeNull();
  });
});

describe("interactions", () => {
  it("aimer / ne plus aimer met à jour le compteur, pas de double vote", async () => {
    const p = await post(a);
    expect((await b.client.from("likes").insert({ post_id: p.id })).error).toBeNull();
    expect((await b.client.from("likes").insert({ post_id: p.id })).error).not.toBeNull();
    let [row] = await sql`select like_count from public.posts where id = ${p.id}`;
    expect(row.like_count).toBe(1);
    await b.client.from("likes").delete().eq("post_id", p.id);
    [row] = await sql`select like_count from public.posts where id = ${p.id}`;
    expect(row.like_count).toBe(0);
  });

  it("on ne peut pas aimer au nom d'un autre", async () => {
    const p = await post(a);
    const { error } = await b.client.from("likes").insert({ post_id: p.id, user_id: a.id });
    expect(error).not.toBeNull();
  });

  it("les enregistrements sont privés", async () => {
    const p = await post(b);
    await a.client.from("saves").insert({ post_id: p.id });
    const { data } = await b.client.from("saves").select("*").eq("post_id", p.id);
    expect(data ?? []).toHaveLength(0);
    const mine = await a.client.rpc("get_feed", { p_saved: true, p_limit: 30 });
    expect((mine.data ?? []).map((x: { id: string }) => x.id)).toContain(p.id);
  });

  it("commentaires : compteur, masquage par un modérateur, invisibles ensuite", async () => {
    const p = await post(a);
    const { data: c, error } = await b.client.from("comments").insert({ post_id: p.id, body: "Bien vu" }).select().single();
    expect(error).toBeNull();
    let [row] = await sql`select comment_count from public.posts where id = ${p.id}`;
    expect(row.comment_count).toBe(1);
    expect((await a.client.rpc("moderate", { p_target_type: "comment", p_target_id: c!.id, p_action: "hide", p_reason: "essai" })).error).not.toBeNull();
    expect((await mod.client.rpc("moderate", { p_target_type: "comment", p_target_id: c!.id, p_action: "hide", p_reason: "Propos hors sujet" })).error).toBeNull();
    [row] = await sql`select comment_count from public.posts where id = ${p.id}`;
    expect(row.comment_count).toBe(0);
    const seen = await anon().from("comments").select("id").eq("post_id", p.id);
    expect(seen.data ?? []).toHaveLength(0);
  });

  it("abonnements : impossible de s'abonner à soi-même ou au nom d'un autre", async () => {
    expect((await a.client.from("follows").insert({ followee_id: b.id })).error).toBeNull();
    expect((await a.client.from("follows").insert({ followee_id: a.id })).error).not.toBeNull();
    expect((await a.client.from("follows").insert({ follower_id: b.id, followee_id: mod.id })).error).not.toBeNull();
  });
});

describe("modération et signalements", () => {
  it("signalement : visible par son auteur et les modérateurs seulement", async () => {
    const p = await post(a);
    const { data: r, error } = await b.client.from("reports").insert({ target_type: "post", target_id: p.id, reason: "spam" }).select().single();
    expect(error).toBeNull();
    expect((await a.client.from("reports").select("id").eq("id", r!.id)).data ?? []).toHaveLength(0);
    expect((await mod.client.from("reports").select("id").eq("id", r!.id)).data ?? []).toHaveLength(1);
  });

  it("retrait par un modérateur avec motif : invisible au public, motif visible par l'auteur", async () => {
    const p = await post(a);
    const { data: r } = await b.client.from("reports").insert({ target_type: "post", target_id: p.id, reason: "desinformation" }).select().single();
    expect((await mod.client.rpc("moderate", { p_target_type: "post", p_target_id: p.id, p_action: "remove", p_reason: "Information fausse, source démentie", p_report_id: r!.id })).error).toBeNull();
    expect((await anon().from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
    expect((await a.client.from("posts").select("status").eq("id", p.id).single()).data?.status).toBe("removed");
    const log = await a.client.from("moderation_actions").select("reason").eq("target_id", p.id);
    expect(log.data?.[0]?.reason).toContain("source démentie");
    const [rep] = await sql`select status from public.reports where id = ${r!.id}`;
    expect(rep.status).toBe("actioned");
  });

  it("un compte suspendu ne peut plus publier ni commenter", async () => {
    const c = await user("suspendu");
    expect((await mod.client.rpc("moderate", { p_target_type: "profile", p_target_id: c.id, p_action: "ban", p_reason: "Spam répété", p_ban_days: 3 })).error).toBeNull();
    const { error } = await c.client.from("posts").insert({ kind: "article", category: "actu", title: "Je reviens" });
    expect(error).not.toBeNull();
  });

  it("qualification éditoriale réservée à la rédaction", async () => {
    const p = await post(a);
    expect((await mod.client.rpc("qualify_post", { p_post_id: p.id, p_info_status: "confirme", p_featured: true, p_editorial: false })).error).not.toBeNull();
    expect((await editor.client.rpc("qualify_post", { p_post_id: p.id, p_info_status: "confirme", p_featured: true, p_editorial: false, p_correction: "Date de sortie précisée" })).error).toBeNull();
    const [row] = await sql`select info_status, is_featured, correction_note from public.posts where id = ${p.id}`;
    expect(row).toMatchObject({ info_status: "confirme", is_featured: true, correction_note: "Date de sortie précisée" });
  });
});

describe("fonctions internes", () => {
  it("le compteur anti-spam n'est pas appelable directement (impossible d'épuiser le quota d'un autre)", async () => {
    expect((await anon().rpc("rate_ok", { k: `post:${a.id}`, max_count: 0, window_s: 3600 })).error).not.toBeNull();
    expect((await b.client.rpc("rate_ok", { k: `post:${a.id}`, max_count: 0, window_s: 3600 })).error).not.toBeNull();
  });
  it("les fonctions d'administration sont fermées aux visiteurs", async () => {
    for (const fn of ["moderate", "qualify_post", "set_role", "update_service", "upsert_source", "upsert_work", "find_profile"]) {
      expect((await anon().rpc(fn, {})).error, fn).not.toBeNull();
    }
  });
});

describe("droit à l'effacement", () => {
  it("un compte de modérateur peut être supprimé, le journal des décisions est conservé", async () => {
    const m2 = await user("modo2", "moderator");
    const p = await post(a);
    await m2.client.rpc("moderate", { p_target_type: "post", p_target_id: p.id, p_action: "hide", p_reason: "Test effacement" });
    const { error } = await admin.auth.admin.deleteUser(m2.id);
    expect(error).toBeNull();
    const [log] = await sql`select moderator_id, reason from public.moderation_actions where target_id = ${p.id}`;
    expect(log).toMatchObject({ moderator_id: null, reason: "Test effacement" });
  });
});

describe("profils et rôles", () => {
  it("impossible de s'attribuer un rôle ou un badge", async () => {
    const { error } = await a.client.from("profiles").update({ role: "admin" }).eq("id", a.id);
    expect(error).not.toBeNull();
    expect((await a.client.rpc("set_role", { p_user: a.id, p_role: "admin", p_verified: true })).error).not.toBeNull();
    const ok = await a.client.from("profiles").update({ bio: "Fan de rap" }).eq("id", a.id).select().single();
    expect(ok.data?.bio).toBe("Fan de rap");
  });
  it("un profil est créé automatiquement avec un pseudo unique", async () => {
    const [x] = await sql`select handle from public.profiles where id = ${a.id}`;
    expect(x.handle).toMatch(/^alice\d*$/);
  });
});

describe("studio", () => {
  it("demande de devis : appel direct refusé aux visiteurs, enregistrée via le serveur, lisible par l'admin seul", async () => {
    const v = anon();
    const args = { p_service: "clip", p_name: "Label Test", p_email: "label@example.com", p_phone: "", p_message: "Un clip pour notre artiste, tournage en décembre.", p_budget: "", p_date: "", p_client_key: "test-" + Date.now() };
    expect((await v.rpc("submit_quote", args)).error).not.toBeNull();
    const { data: id, error } = await admin.rpc("submit_quote", args); // = route serveur /api/quote
    expect(error).toBeNull();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await v.from("quote_requests").select("id")).data ?? []).toHaveLength(0);
    expect((await a.client.from("quote_requests").select("id").eq("id", id)).data ?? []).toHaveLength(0);
    expect((await adminU.client.from("quote_requests").select("id").eq("id", id)).data ?? []).toHaveLength(1);
  });
  it("un devis invalide est refusé (pas de faux succès)", async () => {
    const { error } = await admin.rpc("submit_quote", { p_service: "clip", p_name: "X", p_email: "pas-un-mail", p_phone: "", p_message: "court", p_budget: "", p_date: "", p_client_key: "k" + Date.now() });
    expect(error).not.toBeNull();
  });
  it("devis : 5 par heure et par empreinte d'IP", async () => {
    const key = "ip-" + Date.now();
    const args = { p_service: "", p_name: "Spam", p_email: "s@example.com", p_phone: "", p_message: "Message suffisamment long pour passer.", p_budget: "", p_date: "", p_client_key: key };
    const results = [];
    for (let i = 0; i < 6; i++) results.push(!(await admin.rpc("submit_quote", args)).error);
    expect(results).toEqual([true, true, true, true, true, false]);
  });
  it("seul un administrateur modifie un tarif", async () => {
    const args = { p_slug: "photographie", p_title: "Photographie", p_description: "Portraits, presse, plateau.", p_price_cents: 30000, p_price_label: "À partir de", p_terms: "", p_active: true };
    expect((await editor.client.rpc("update_service", args)).error).not.toBeNull();
    expect((await adminU.client.rpc("update_service", args)).error).toBeNull();
    const [s] = await sql`select price_cents from public.services where slug = 'photographie'`;
    expect(s.price_cents).toBe(30000);
    await sql`update public.services set price_cents = null, price_label = null where slug = 'photographie'`;
  });
});

describe("stockage des médias", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000a49444154789c6300010000050001" + "0d0a2db40000000049454e44ae426082", "hex");
  it("dépôt dans son propre dossier autorisé, dans celui d'un autre refusé", async () => {
    const ok = await a.client.storage.from("media").upload(`${a.id}/test-${Date.now()}.png`, png, { contentType: "image/png" });
    expect(ok.error).toBeNull();
    const ko = await a.client.storage.from("media").upload(`${b.id}/intrus-${Date.now()}.png`, png, { contentType: "image/png" });
    expect(ko.error).not.toBeNull();
  });
  it("types de fichiers non autorisés refusés", async () => {
    const ko = await a.client.storage.from("media").upload(`${a.id}/x-${Date.now()}.html`, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" });
    expect(ko.error).not.toBeNull();
  });
  it("un visiteur ne peut rien déposer", async () => {
    const ko = await anon().storage.from("media").upload(`anon/x-${Date.now()}.png`, png, { contentType: "image/png" });
    expect(ko.error).not.toBeNull();
  });
});
