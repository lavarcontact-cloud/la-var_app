"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { useSession } from "@/components/session";
import { supabaseBrowser } from "@/lib/supabase/client";
import { absoluteDate } from "@/lib/time";
import { CATEGORIES, ROLE_LABEL, SCOPES, type Category, type Profile, type Role, type Scope } from "@/lib/types";

type Service = { slug: string; title: string; description: string; price_cents: number | null; price_label: string | null; terms: string | null; is_active: boolean };
type Source = { id: string; name: string; homepage: string | null; feed_url: string; default_category: Category; default_scope: Scope; is_active: boolean; last_fetched_at: string | null; last_error: string | null };
type Quote = { id: string; service_slug: string | null; name: string; email: string; phone: string | null; message: string; budget: string | null; date_wish: string | null; status: string; created_at: string };
type Work = { id: string; title: string; artist: string | null; role: string | null; url: string | null; position: number; is_active: boolean };

export default function AdminPage() {
  const { ready, profile } = useSession();
  const isAdmin = profile?.role === "admin";
  const isEditor = isAdmin || profile?.role === "editor";
  const tabs = [
    ...(isAdmin ? [["devis", "Devis"], ["tarifs", "Tarifs"], ["realisations", "Réalisations"], ["roles", "Rôles"]] : []),
    ...(isEditor ? [["sources", "Sources d'actu"]] : []),
  ] as [string, string][];
  const [tab, setTab] = useState<string>("");
  useEffect(() => { if (!tab && tabs[0]) setTab(tabs[0][0]); }, [tabs, tab]);

  if (!ready) return <p className="p-8 text-center text-[var(--color-muted)]">Chargement…</p>;
  if (!isEditor) return <div className="px-6 py-24 text-center"><p className="t-display text-4xl">Accès réservé</p><p className="mt-2 text-[var(--color-muted)]">Cet espace est réservé à l'administration et à la rédaction.</p></div>;

  return (
    <div>
      <PageHeader title="Admin" />
      <div className="mx-auto max-w-4xl px-4 pb-12">
        <div role="tablist" className="mt-4 flex flex-wrap gap-2">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} className="chip" onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === "devis" && <Quotes />}
        {tab === "tarifs" && <Prices />}
        {tab === "realisations" && <Works />}
        {tab === "roles" && <Roles />}
        {tab === "sources" && <Sources />}
      </div>
    </div>
  );
}

function useMsg() {
  const [msg, setMsg] = useState("");
  const el = msg ? <p role="status" className="mt-3 rounded-md border-2 border-[var(--color-line)] p-3 text-sm">{msg}</p> : null;
  return [el, setMsg] as const;
}

function Quotes() {
  const sb = supabaseBrowser()!;
  const [rows, setRows] = useState<Quote[] | null>(null);
  const [msg, setMsg] = useMsg();
  const load = useCallback(() => { sb.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(100).then(({ data }) => setRows((data as Quote[]) ?? [])); }, [sb]);
  useEffect(load, [load]);
  const status = async (id: string, s: string) => { const { error } = await sb.rpc("set_quote_status", { p_id: id, p_status: s }); setMsg(error ? "Échec." : "Statut mis à jour."); load(); };
  if (!rows) return <div className="skeleton mt-4 h-32 rounded" />;
  return (
    <section className="mt-6">
      {msg}
      {rows.length === 0 ? <p className="py-6 text-[var(--color-muted)]">Aucune demande de devis.</p> : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id} className="rounded-md border-2 border-[var(--color-line)] p-4">
              <p className="font-semibold">{q.name} · <a className="underline" href={`mailto:${q.email}`}>{q.email}</a>{q.phone ? ` · ${q.phone}` : ""}</p>
              <p className="t-time">{absoluteDate(q.created_at)} · {q.service_slug ?? "prestation non précisée"} · budget : {q.budget ?? "-"} · date : {q.date_wish ?? "-"}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{q.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["nouveau", "en_cours", "repondu", "archive"].map((s) => <button key={s} className="chip !min-h-[32px] text-xs" aria-pressed={q.status === s} onClick={() => status(q.id, s)}>{s.replace("_", " ")}</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Prices() {
  const sb = supabaseBrowser()!;
  const [rows, setRows] = useState<Service[] | null>(null);
  const [msg, setMsg] = useMsg();
  const load = useCallback(() => { sb.from("services").select("*").order("position").then(({ data }) => setRows((data as Service[]) ?? [])); }, [sb]);
  useEffect(load, [load]);
  const save = async (s: Service, form: FormData) => {
    const raw = String(form.get("price") ?? "").replace(/\s/g, "").replace(",", ".");
    if (raw && !/^\d+(\.\d{1,2})?$/.test(raw)) return setMsg("Tarif invalide (ex. 450 ou 450,00). Laisser vide = sur devis.");
    const { error } = await sb.rpc("update_service", {
      p_slug: s.slug, p_title: String(form.get("title")), p_description: String(form.get("description")),
      p_price_cents: raw ? Math.round(Number(raw) * 100) : null, p_price_label: String(form.get("label") ?? ""), p_terms: String(form.get("terms") ?? ""), p_active: form.get("active") === "on",
    });
    setMsg(error ? "Échec de l'enregistrement." : `« ${s.title} » enregistré.`);
    load();
  };
  if (!rows) return <div className="skeleton mt-4 h-32 rounded" />;
  return (
    <section className="mt-6 space-y-4">
      {msg}
      <p className="text-sm text-[var(--color-muted)]">Tarif vide = affiché "Sur devis". Les prix affichés doivent être TTC si vous vendez à des particuliers.</p>
      {rows.map((s) => (
        <form key={s.slug} action={(f) => save(s, f)} className="grid gap-2 rounded-md border-2 border-[var(--color-line)] p-4">
          <label className="text-sm font-semibold">Titre<input name="title" defaultValue={s.title} className="input mt-1" /></label>
          <label className="text-sm font-semibold">Description<textarea name="description" defaultValue={s.description} rows={2} className="input mt-1" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold">Mention (ex. « À partir de »)<input name="label" defaultValue={s.price_label ?? ""} className="input mt-1" /></label>
            <label className="text-sm font-semibold">Tarif (€)<input name="price" inputMode="decimal" defaultValue={s.price_cents ? String(s.price_cents / 100) : ""} placeholder="Sur devis" className="input mt-1" /></label>
          </div>
          <label className="text-sm font-semibold">Modalités<input name="terms" defaultValue={s.terms ?? ""} placeholder="ex. acompte de 30 % à la réservation" className="input mt-1" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.is_active} className="accent-[var(--color-red)]" /> Visible sur le Studio</label>
          <button type="submit" className="btn btn-red justify-self-start">Enregistrer</button>
        </form>
      ))}
    </section>
  );
}

function Works() {
  const sb = supabaseBrowser()!;
  const [rows, setRows] = useState<Work[] | null>(null);
  const [msg, setMsg] = useMsg();
  const load = useCallback(() => { sb.from("studio_works").select("*").order("position").then(({ data }) => setRows((data as Work[]) ?? [])); }, [sb]);
  useEffect(load, [load]);
  const save = async (w: Partial<Work>, f: FormData) => {
    const url = String(f.get("url") ?? "");
    if (url && !url.startsWith("https://")) return setMsg("Le lien doit commencer par https://");
    const { error } = await sb.rpc("upsert_work", { p_id: w.id ?? null, p_title: String(f.get("title")), p_artist: String(f.get("artist") ?? ""), p_role: String(f.get("role") ?? ""), p_url: url, p_position: Number(f.get("position") || 100), p_active: f.get("active") === "on" });
    setMsg(error ? "Échec de l'enregistrement." : "Réalisation enregistrée.");
    load();
  };
  const fields = (w: Partial<Work>) => (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-semibold">Titre<input name="title" required defaultValue={w.title} className="input mt-1" /></label>
        <label className="text-sm font-semibold">Artiste<input name="artist" defaultValue={w.artist ?? ""} className="input mt-1" /></label>
        <label className="text-sm font-semibold">Rôle<input name="role" defaultValue={w.role ?? ""} placeholder="ex. réalisation" className="input mt-1" /></label>
        <label className="text-sm font-semibold">Lien (YouTube, portfolio…)<input name="url" defaultValue={w.url ?? ""} placeholder="https://" className="input mt-1" /></label>
      </div>
      <div className="flex items-center gap-4">
        <label className="text-sm font-semibold">Ordre<input name="position" type="number" defaultValue={w.position ?? 100} className="input mt-1 w-24" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={w.is_active ?? true} className="accent-[var(--color-red)]" /> Visible</label>
      </div>
    </>
  );
  if (!rows) return <div className="skeleton mt-4 h-32 rounded" />;
  return (
    <section className="mt-6 space-y-4">
      {msg}
      <form action={(f) => save({}, f)} className="grid gap-2 rounded-md border-2 border-[var(--color-red)] p-4">
        <p className="t-kicker">Ajouter une réalisation</p>
        {fields({})}
        <button type="submit" className="btn btn-red justify-self-start">Ajouter</button>
      </form>
      {rows.map((w) => (
        <form key={w.id} action={(f) => save(w, f)} className="grid gap-2 rounded-md border-2 border-[var(--color-line)] p-4">
          {fields(w)}
          <button type="submit" className="btn btn-line justify-self-start">Enregistrer</button>
        </form>
      ))}
    </section>
  );
}

function Roles() {
  const sb = supabaseBrowser()!;
  const [handle, setHandle] = useState("");
  const [found, setFound] = useState<Profile | null>(null);
  const [msg, setMsg] = useMsg();
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await sb.rpc("find_profile", { p_handle: handle.replace(/^@/, "") });
    setFound(((data as Profile[]) ?? [])[0] ?? null);
    if (!data?.length) setMsg("Aucun compte avec ce pseudo.");
  };
  const apply = async (f: FormData) => {
    if (!found) return;
    const { error } = await sb.rpc("set_role", { p_user: found.id, p_role: f.get("role") as Role, p_verified: f.get("verified") === "on" });
    setMsg(error ? "Échec." : `Rôle de @${found.handle} mis à jour.`);
  };
  return (
    <section className="mt-6">
      {msg}
      <form onSubmit={search} className="flex gap-2">
        <label className="sr-only" htmlFor="h">Pseudo</label>
        <input id="h" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@pseudo" className="input" />
        <button type="submit" className="btn btn-line shrink-0">Chercher</button>
      </form>
      {found && (
        <form action={apply} className="mt-4 grid gap-3 rounded-md border-2 border-[var(--color-line)] p-4">
          <p className="font-semibold">{found.display_name} (@{found.handle}) · actuellement {ROLE_LABEL[found.role]}</p>
          <label className="text-sm font-semibold">Rôle
            <select name="role" defaultValue={found.role} className="input mt-1">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={found.is_verified} className="accent-[var(--color-red)]" /> Badge vérifié (identité contrôlée)</label>
          <button type="submit" className="btn btn-red justify-self-start">Appliquer</button>
        </form>
      )}
      <p className="mt-4 text-xs text-[var(--color-muted)]">Artiste vérifié : peut marquer ses annonces "Officiel". Rédaction : qualifie les infos et gère la une. Modération : traite les signalements. Admin : tout, y compris tarifs et rôles.</p>
    </section>
  );
}

function Sources() {
  const sb = supabaseBrowser()!;
  const [rows, setRows] = useState<Source[] | null>(null);
  const [msg, setMsg] = useMsg();
  const load = useCallback(() => { sb.from("external_sources").select("*").order("name").then(({ data }) => setRows((data as Source[]) ?? [])); }, [sb]);
  useEffect(load, [load]);
  const save = async (s: Partial<Source>, f: FormData) => {
    const feed = String(f.get("feed_url") ?? "");
    if (!feed.startsWith("https://")) return setMsg("L'adresse du flux doit commencer par https://");
    const { error } = await sb.rpc("upsert_source", { p_id: s.id ?? null, p_name: String(f.get("name")), p_homepage: String(f.get("homepage") ?? ""), p_feed_url: feed, p_category: f.get("category"), p_scope: f.get("scope"), p_active: f.get("active") === "on" });
    setMsg(error ? (/duplicate|unique/.test(error.message) ? "Ce flux existe déjà." : "Échec de l'enregistrement.") : "Source enregistrée. Elle sera lue au prochain import automatique.");
    load();
  };
  const fields = (s: Partial<Source>) => (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-semibold">Nom du média<input name="name" required defaultValue={s.name} className="input mt-1" /></label>
        <label className="text-sm font-semibold">Site<input name="homepage" defaultValue={s.homepage ?? ""} placeholder="https://" className="input mt-1" /></label>
      </div>
      <label className="text-sm font-semibold">Flux RSS ou Atom<input name="feed_url" required defaultValue={s.feed_url} placeholder="https://…/feed" className="input mt-1" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">Rubrique par défaut<select name="category" defaultValue={s.default_category ?? "actu"} className="input mt-1">{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        <label className="text-sm font-semibold">Scène<select name="scope" defaultValue={s.default_scope ?? "fr"} className="input mt-1">{SCOPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.is_active ?? true} className="accent-[var(--color-red)]" /> Active</label>
    </>
  );
  if (!rows) return <div className="skeleton mt-4 h-32 rounded" />;
  return (
    <section className="mt-6 space-y-4">
      {msg}
      <p className="text-sm text-[var(--color-muted)]">Seuls le titre, le lien et un court résumé sont repris, avec la source et la date. N'ajoutez que des flux publics de médias dont les conditions le permettent.</p>
      <form action={(f) => save({}, f)} className="grid gap-2 rounded-md border-2 border-[var(--color-red)] p-4">
        <p className="t-kicker">Ajouter une source</p>
        {fields({})}
        <button type="submit" className="btn btn-red justify-self-start">Ajouter</button>
      </form>
      {rows.map((s) => (
        <form key={s.id} action={(f) => save(s, f)} className="grid gap-2 rounded-md border-2 border-[var(--color-line)] p-4">
          {fields(s)}
          <p className="t-time">{s.last_fetched_at ? `Dernier import : ${absoluteDate(s.last_fetched_at)}` : "Jamais importée"}{s.last_error ? ` · erreur : ${s.last_error}` : ""}</p>
          <button type="submit" className="btn btn-line justify-self-start">Enregistrer</button>
        </form>
      ))}
    </section>
  );
}
