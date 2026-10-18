"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { useSession } from "@/components/session";
import { fetchFeed } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { absoluteDate } from "@/lib/time";
import { INFO_STATUS, type FeedPost, type InfoStatus } from "@/lib/types";

type Report = { id: string; target_type: "post" | "comment" | "profile"; target_id: string; reason: string; details: string | null; created_at: string };
type Preview = { text: string; link: string | null; status?: string };

const REASON_LABEL: Record<string, string> = {
  spam: "Spam", haine: "Haine", harcelement: "Harcèlement", violence: "Violence", sexuel: "Sexuel",
  desinformation: "Fausse information", droit_auteur: "Droit d'auteur", vie_privee: "Vie privée", autre: "Autre",
};

export default function ModerationPage() {
  const sb = supabaseBrowser();
  const { ready, profile } = useSession();
  const staff = !!profile && ["moderator", "editor", "admin"].includes(profile.role);
  const editor = !!profile && ["editor", "admin"].includes(profile.role);
  const [reports, setReports] = useState<(Report & { preview: Preview })[] | null>(null);
  const [queue, setQueue] = useState<FeedPost[] | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!sb || !staff) return;
    const { data } = await sb.from("reports").select("id, target_type, target_id, reason, details, created_at").eq("status", "open").order("created_at").limit(50);
    const rows = (data ?? []) as Report[];
    const withPreview = await Promise.all(rows.map(async (r) => ({ ...r, preview: await preview(r) })));
    setReports(withPreview);
    if (editor) {
      const recent = await fetchFeed(sb, { limit: 30 });
      setQueue(recent.filter((p) => p.info_status === "a_verifier" || p.info_status === "rumeur"));
    }
  }, [sb, staff, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  async function preview(r: Report): Promise<Preview> {
    if (!sb) return { text: "", link: null };
    if (r.target_type === "post") {
      const { data } = await sb.from("posts").select("title, status").eq("id", r.target_id).maybeSingle();
      return { text: data?.title ?? "(publication supprimée)", link: `/p/${r.target_id}`, status: data?.status };
    }
    if (r.target_type === "comment") {
      const { data } = await sb.from("comments").select("body, status, post_id").eq("id", r.target_id).maybeSingle();
      return { text: data?.body ?? "(commentaire supprimé)", link: data ? `/p/${data.post_id}` : null, status: data?.status };
    }
    const { data } = await sb.from("profiles").select("handle, display_name").eq("id", r.target_id).maybeSingle();
    return { text: data ? `${data.display_name} (@${data.handle})` : "(compte supprimé)", link: data ? `/u/${data.handle}` : null };
  }

  useEffect(() => { load(); }, [load]);

  const act = async (r: Report, action: string) => {
    if (!sb) return;
    const reason = prompt(action === "dismiss" ? "Note (pourquoi le signalement est rejeté) :" : "Motif communiqué à l'auteur (obligatoire) :");
    if (!reason || reason.trim().length < 3) return setMsg("Motif requis (3 caractères minimum).");
    const { error } = action === "dismiss"
      ? await sb.rpc("dismiss_report", { p_report_id: r.id, p_note: reason })
      : await sb.rpc("moderate", { p_target_type: r.target_type, p_target_id: r.target_id, p_action: action, p_reason: reason.trim(), p_report_id: r.id, p_ban_days: 7 });
    setMsg(error ? `Échec : ${error.message}` : "Décision enregistrée.");
    load();
  };

  const qualify = async (p: FeedPost, status: InfoStatus, featured: boolean) => {
    if (!sb) return;
    const correction = status === "rumeur" || status === "confirme" ? prompt("Note de correction publique (facultatif) :") ?? "" : "";
    const { error } = await sb.rpc("qualify_post", { p_post_id: p.id, p_info_status: status, p_featured: featured, p_editorial: p.is_editorial, p_correction: correction });
    setMsg(error ? `Échec : ${error.message}` : "Publication qualifiée.");
    load();
  };

  if (!ready) return <p className="p-8 text-center text-[var(--color-muted)]">Chargement…</p>;
  if (!staff) return <div className="px-6 py-24 text-center"><p className="t-display text-4xl">Accès réservé</p><p className="mt-2 text-[var(--color-muted)]">Cet espace est réservé à l'équipe de modération.</p></div>;

  return (
    <div>
      <PageHeader title="Modération" />
      <div className="mx-auto max-w-4xl px-4 pb-12">
        {msg && <p role="status" className="mt-4 rounded-md border-2 border-[var(--color-line)] p-3 text-sm">{msg}</p>}
        <section className="mt-6">
          <h2 className="t-display text-2xl">Signalements ouverts</h2>
          {reports === null ? <div className="skeleton mt-3 h-24 rounded" /> : reports.length === 0 ? (
            <p className="py-6 text-[var(--color-muted)]">Aucun signalement en attente.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reports.map((r) => (
                <li key={r.id} className="rounded-md border-2 border-[var(--color-line)] p-4">
                  <p className="text-sm"><span className="tag tag-warn"><span>{REASON_LABEL[r.reason] ?? r.reason}</span></span> <span className="t-time ml-2">{absoluteDate(r.created_at)}</span></p>
                  <p className="mt-2">
                    <span className="t-kicker text-[var(--color-muted)]">{r.target_type === "post" ? "Publication" : r.target_type === "comment" ? "Commentaire" : "Profil"}</span>{" "}
                    {r.preview.link ? <Link href={r.preview.link} className="underline" target="_blank">{r.preview.text}</Link> : r.preview.text}
                    {r.preview.status && r.preview.status !== "published" && <span className="ml-2 text-xs text-[var(--color-warn)]">({r.preview.status})</span>}
                  </p>
                  {r.details && <p className="mt-1 text-sm text-[var(--color-muted)]">« {r.details} »</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.target_type !== "profile" ? (
                      <>
                        <button className="btn btn-line !min-h-[38px] !text-sm" onClick={() => act(r, "hide")}>Masquer</button>
                        <button className="btn btn-red !min-h-[38px] !text-sm" onClick={() => act(r, "remove")}>Retirer</button>
                        <button className="btn btn-ghost !min-h-[38px] !text-sm" onClick={() => act(r, "restore")}>Rétablir</button>
                      </>
                    ) : (
                      <button className="btn btn-red !min-h-[38px] !text-sm" onClick={() => act(r, "ban")}>Suspendre 7 jours</button>
                    )}
                    <button className="btn btn-ghost !min-h-[38px] !text-sm" onClick={() => act(r, "dismiss")}>Classer sans suite</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editor && (
          <section className="mt-10">
            <h2 className="t-display text-2xl">À vérifier par la rédaction</h2>
            <p className="text-sm text-[var(--color-muted)]">Publications récentes de membres, non qualifiées. Confirmer une information engage la rédaction : vérifiez la source.</p>
            {queue === null ? <div className="skeleton mt-3 h-24 rounded" /> : queue.length === 0 ? <p className="py-6 text-[var(--color-muted)]">Rien à vérifier.</p> : (
              <ul className="mt-3 space-y-3">
                {queue.map((p) => (
                  <li key={p.id} className="rounded-md border-2 border-[var(--color-line)] p-4">
                    <Link href={`/p/${p.id}`} className="font-semibold underline" target="_blank">{p.title}</Link>
                    <p className="t-time">{absoluteDate(p.created_at)} · @{p.author_handle} · {INFO_STATUS[p.info_status].label}{p.source_url ? ` · source : ${p.source_url}` : " · sans source"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn btn-red !min-h-[38px] !text-sm" onClick={() => qualify(p, "confirme", false)}>Confirmer</button>
                      <button className="btn btn-line !min-h-[38px] !text-sm" onClick={() => qualify(p, "confirme", true)}>Confirmer + à la une</button>
                      <button className="btn btn-ghost !min-h-[38px] !text-sm" onClick={() => qualify(p, "rumeur", false)}>Marquer rumeur</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
