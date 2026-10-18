"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { Section } from "@/components/news-list";
import { useSession } from "@/components/session";
import { supabaseBrowser } from "@/lib/supabase/client";

type Service = { slug: string; title: string; description: string; deliverables: string[]; price_cents: number | null; price_label: string | null; terms: string | null };
type Work = { id: string; title: string; artist: string | null; role: string | null; url: string | null };

const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: c % 100 ? 2 : 0 });

/** Espace professionnel de Sébastien Fula-Pitu, distinct du fil d'actualité. */
export default function StudioPage() {
  const sb = supabaseBrowser();
  const [services, setServices] = useState<Service[] | null>(null);
  const [works, setWorks] = useState<Work[] | null>(null);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!sb) return;
    sb.from("services").select("*").eq("is_active", true).order("position").then(({ data }) => setServices((data as Service[]) ?? []));
    sb.from("studio_works").select("id, title, artist, role, url").eq("is_active", true).order("position").then(({ data }) => setWorks((data as Work[]) ?? []));
  }, [sb]);

  return (
    <div>
      <PageHeader title="Studio" />
      <div className="mx-auto max-w-4xl px-4 pb-12">
        <section className="mt-6">
          <p className="t-kicker text-[var(--color-red-hi)]">Réalisation · Photo · Montage</p>
          <h2 className="t-display mt-2 text-[44px] sm:text-6xl">Sébastien Fula-Pitu</h2>
          <p className="mt-3 max-w-2xl text-lg text-[#d9d7d1]">
            Réalisateur, photographe et créateur de contenu dans le rap. Fondateur de LA VAR. Du studio au plateau : clips, plans-séquences, photos et formats pour les réseaux.
          </p>
        </section>

        <Section title="Prestations">
          {!sb && <p className="text-[var(--color-muted)]">Base de données non configurée sur cette version d'aperçu.</p>}
          {sb && services === null && <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-44 rounded" />)}</div>}
          {services && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.slug} className="flex flex-col rounded-md border-2 border-[var(--color-line)] p-5">
                  <h3 className="t-display text-3xl">{s.title}</h3>
                  <p className="mt-2 text-[#d9d7d1]">{s.description}</p>
                  {s.deliverables.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">{s.deliverables.map((d) => <li key={d} className="flex gap-2"><span className="text-[var(--color-red)]" aria-hidden>■</span>{d}</li>)}</ul>
                  )}
                  <p className="mt-4 font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase italic">
                    {s.price_cents ? `${s.price_label ? s.price_label + " " : ""}${euros(s.price_cents)}` : "Sur devis"}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">{s.terms ?? "Modalités précisées dans le devis."}</p>
                  <a href="#devis" onClick={() => setSelected(s.slug)} className="btn btn-red mt-4">Demander un devis</a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Réalisations" count={sb ? (works ? works.length : null) : 0} empty="Les réalisations seront ajoutées ici prochainement.">
          {works && works.length > 0 && (
            <ul className="divide-y divide-[var(--color-line)]">
              {works.map((w) => (
                <li key={w.id} className="py-3">
                  {w.url ? <a href={w.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{w.title} ↗</a> : <span className="font-semibold">{w.title}</span>}
                  <p className="text-sm text-[var(--color-muted)]">{[w.artist, w.role].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <QuoteForm services={services ?? []} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  );
}

function QuoteForm({ services, selected, onSelect }: { services: Service[]; selected: string; onSelect: (s: string) => void }) {
  const { user } = useSession();
  const [v, setV] = useState({ name: "", email: "", phone: "", message: "", budget: "", date: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (user?.email && !v.email) setV((x) => ({ ...x, email: user.email! })); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (v.name.trim().length < 2) return setError("Indiquez votre nom.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return setError("Adresse e-mail invalide.");
    if (v.message.trim().length < 20) return setError("Décrivez le projet en quelques phrases (20 caractères minimum).");
    setState("sending");
    try {
      // Passage par le serveur : la limite anti-spam s'appuie sur une empreinte d'IP.
      const r = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service: selected, name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), message: v.message.trim(), budget: v.budget.trim(), date: v.date.trim() }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.id) {
        setState("idle");
        return setError(out.error ?? "La demande n'a pas pu être enregistrée.");
      }
      setRef(String(out.id).slice(0, 8).toUpperCase());
      setState("done");
    } catch {
      setState("idle");
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
    }
  };

  return (
    <section id="devis" className="mt-10 scroll-mt-20 rounded-md border-2 border-[var(--color-red)] p-5" aria-labelledby="h-devis">
      <h2 id="h-devis" className="t-display text-3xl">Demande de devis</h2>
      {state === "done" ? (
        <p role="status" className="mt-3">Demande enregistrée (réf. <b className="font-mono">{ref}</b>). Sébastien la retrouve dans son espace et vous répond à {v.email}.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
          <label className="block text-sm font-semibold">
            Prestation
            <select value={selected} onChange={(e) => onSelect(e.target.value)} className="input mt-1">
              <option value="">Je ne sais pas encore</option>
              {services.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Nom<input value={v.name} onChange={set("name")} autoComplete="name" className="input mt-1" /></label>
            <label className="block text-sm font-semibold">E-mail<input type="email" value={v.email} onChange={set("email")} autoComplete="email" className="input mt-1" /></label>
            <label className="block text-sm font-semibold">Téléphone (facultatif)<input type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" className="input mt-1" /></label>
            <label className="block text-sm font-semibold">Date souhaitée (facultatif)<input value={v.date} onChange={set("date")} className="input mt-1" placeholder="ex. début décembre" /></label>
          </div>
          <label className="block text-sm font-semibold">Budget (facultatif)<input value={v.budget} onChange={set("budget")} className="input mt-1" placeholder="ex. 1 500 €" /></label>
          <label className="block text-sm font-semibold">Le projet<textarea value={v.message} onChange={set("message")} rows={5} maxLength={3000} className="input mt-1" placeholder="Artiste, morceau, intention, références…" /></label>
          <p className="text-xs text-[var(--color-muted)]">Vos informations servent uniquement à répondre à cette demande.</p>
          {error && <p role="alert" className="text-sm text-[var(--color-red-hi)]">{error}</p>}
          <button type="submit" className="btn btn-red" disabled={state === "sending"}>{state === "sending" ? "Envoi…" : "Envoyer la demande"}</button>
        </form>
      )}
    </section>
  );
}
