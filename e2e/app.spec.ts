import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanup, sql, user } from "../tests/local-stack";

/** Parcours réels : aucune réponse simulée, tout passe par Supabase local. */

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const signedUp: string[] = [];

test.afterAll(async () => {
  for (const handle of signedUp.splice(0)) {
    const [p] = await sql`select id from public.profiles where handle = ${handle}`;
    if (!p) continue;
    const { data } = await admin.storage.from("media").list(p.id);
    if (data?.length) await admin.storage.from("media").remove(data.map((f) => `${p.id}/${f.name}`));
    await admin.auth.admin.deleteUser(p.id);
  }
  await cleanup();
});

async function signUp(page: Page) {
  const handle = `e2e_${stamp()}`.slice(0, 24);
  signedUp.push(handle);
  await page.goto("/connexion?suite=/publier");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Pseudo").fill(handle);
  await page.getByLabel("E-mail").fill(`${handle}@test.local`);
  await page.getByLabel("Mot de passe").fill("motdepasse-e2e-1234");
  await page.getByLabel("J'ai 15 ans ou plus.").check();
  await page.getByRole("checkbox", { name: /règles de la communauté/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/publier$/);
  return handle;
}

async function signIn(page: Page, email: string) {
  await page.goto("/connexion?suite=/moderation");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-de-test-123");
  await page.getByRole("button", { name: "Se connecter" }).last().click();
  await expect(page).toHaveURL(/\/moderation$/);
}

test("un visiteur est renvoyé vers la connexion pour publier", async ({ page }) => {
  await page.goto("/publier");
  await expect(page.getByText("Connectez-vous pour partager")).toBeVisible();
  await page.getByRole("link", { name: "Se connecter" }).first().click();
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fpublier|\/connexion\?suite=\/publier/);
});

test("inscription, publication, j'aime, commentaire, signalement puis masquage par la modération", async ({ page, browser }) => {
  const handle = await signUp(page);
  const title = `Test e2e ${stamp()}`;
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  // Publier une photo
  await page.getByLabel("Vidéo ou photos").setInputFiles("public/brand/icon-512.png");
  await expect(page.getByText("1 fichier sélectionné.")).toBeVisible();
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Texte (facultatif)").fill("Publication créée par le test de bout en bout.");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\?publie=1/);
  await expect(page.getByText("Publication en ligne.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const postId = page.url().match(/\/p\/([0-9a-f-]+)/)![1];

  // Elle apparaît dans le fil
  await page.goto("/");
  await expect(page.getByRole("feed").getByText(title).first()).toBeVisible();

  // J'aime (persisté côté base)
  await page.goto(`/p/${postId}`);
  await page.getByRole("button", { name: "J'aime (0)" }).click();
  await expect(page.getByRole("button", { name: "Ne plus aimer (1)" })).toBeVisible();
  await expect.poll(async () => (await sql`select like_count from public.posts where id = ${postId}`)[0].like_count).toBe(1);

  // Commentaire
  await page.getByRole("button", { name: /^Commentaires/ }).click();
  await page.getByLabel("Votre commentaire").fill("Premier commentaire e2e");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByRole("dialog").getByText("Premier commentaire e2e")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Fermer" }).click();

  // Un autre membre signale la publication
  const reporter = await user(`rep_${stamp()}`.slice(0, 24));
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/connexion");
  await p2.getByLabel("E-mail").fill(reporter.email);
  await p2.getByLabel("Mot de passe").fill("motdepasse-de-test-123");
  await p2.getByRole("button", { name: "Se connecter" }).last().click();
  await expect(p2).toHaveURL("/");
  await p2.goto(`/p/${postId}`);
  await p2.getByRole("button", { name: "Plus d'options" }).click();
  await p2.getByRole("button", { name: /Signaler/ }).click();
  await p2.getByLabel("Fausse information").check();
  await p2.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(p2.getByText("Signalement enregistré.")).toBeVisible();
  await other.close();

  // La modération masque la publication, avec un motif
  const mod = await user(`mod_${stamp()}`.slice(0, 24), "moderator");
  const modCtx = await browser.newContext();
  const p3 = await modCtx.newPage();
  await signIn(p3, mod.email);
  const card = p3.getByRole("listitem").filter({ hasText: title });
  await expect(card).toBeVisible();
  p3.once("dialog", (d) => d.accept("Information non sourcée (test)"));
  await card.getByRole("button", { name: "Masquer" }).click();
  await expect(p3.getByText("Décision enregistrée.")).toBeVisible();
  await modCtx.close();
  const [row] = await sql`select status from public.posts where id = ${postId}`;
  expect(row.status).toBe("hidden");

  // L'auteur voit l'état et le motif ; le public ne la voit plus
  await page.goto(`/p/${postId}`);
  await expect(page.getByText("n'est plus visible publiquement")).toBeVisible();
  await page.goto(`/u/${handle}`);
  await expect(page.getByText("Information non sourcée (test)")).toBeVisible();
  const anonCtx = await browser.newContext();
  const p4 = await anonCtx.newPage();
  await p4.goto(`/p/${postId}`);
  await expect(p4.getByText("Publication introuvable")).toBeVisible();
  await anonCtx.close();
});

test("les filtres de rubrique du fil répondent", async ({ page }) => {
  await page.goto("/");
  const all = page.getByRole("button", { name: "Tout", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  const chips = page.locator("button.chip").filter({ hasNotText: "Tout" });
  await chips.first().click();
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("feed")).toHaveAttribute("aria-busy", "false");
});

test("demande de devis enregistrée via /api/quote", async ({ page }) => {
  const email = `devis_${stamp()}@test.local`;
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Sébastien Fula-Pitu" })).toBeVisible();
  await expect(page.getByText("Sur devis").first()).toBeVisible(); // aucun prix inventé
  await page.getByLabel("Nom").fill("Test E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Le projet").fill("Clip pour un single, tournage de nuit, deux décors à Paris.");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByText(/Demande enregistrée \(réf\./)).toBeVisible();
  const rows = await sql`select id from public.quote_requests where email = ${email}`;
  expect(rows).toHaveLength(1);
  await sql`delete from public.quote_requests where email = ${email}`;
});

test("refus d'un devis incomplet, sans faux succès", async ({ page }) => {
  await page.goto("/studio");
  await page.getByLabel("Nom").fill("X");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.locator("#devis").getByRole("alert")).toHaveText("Indiquez votre nom.");
  await expect(page.getByText("Demande enregistrée")).toHaveCount(0);
});

test("page 404 à l'identité LA VAR", async ({ page }) => {
  const res = await page.goto("/cette-page-nexiste-pas");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /fil/i }).first()).toBeVisible();
});

for (const path of ["/", "/une", "/decouvertes", "/studio", "/connexion", "/regles"]) {
  test(`accessibilité (axe) et absence d'erreur console : ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(path, { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} élément(s)`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
