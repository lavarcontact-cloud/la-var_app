"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { addComment, fetchComments, report, setLike, setSave, type CommentRow } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/supabase/env";
import { absoluteDate, relativeDate } from "@/lib/time";
import { CATEGORY_LABEL, INFO_STATUS, ROLE_LABEL, type FeedPost, type InfoStatus } from "@/lib/types";
import { useSession } from "./session";

export function InfoBadge({ status }: { status: InfoStatus }) {
  const s = INFO_STATUS[status];
  return (
    <span className={`tag tag-${s.tone}`} title={s.hint}>
      <span>{s.label}</span>
    </span>
  );
}

export function Avatar({ path, name, size = 36 }: { path: string | null; name: string; size?: number }) {
  const url = mediaUrl(path);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-[var(--color-red)]" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-panel)] font-[family-name:var(--font-display)] font-extrabold uppercase italic ring-2 ring-[var(--color-red)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function VerifiedMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" role="img" aria-label="Compte vérifié" className="inline shrink-0">
      <path d="M12 2l2.5 2 3.2-.3 1 3 2.8 1.6-.9 3.1.9 3.1-2.8 1.6-1 3-3.2-.3L12 22l-2.5-2-3.2.3-1-3L2.5 15.7l.9-3.1-.9-3.1L5.3 7.9l1-3 3.2.3z" fill="#C92526" />
      <path d="M8 12.3l2.6 2.6L16.2 9.3" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Auteur + heure + source : affichés pour chaque publication. */
export function PostMeta({ post, compact }: { post: FeedPost; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/u/${post.author_handle}`} className="flex min-w-0 items-center gap-1.5 font-semibold hover:underline">
          <span className="truncate">{post.author_name}</span>
          {post.author_verified && <VerifiedMark />}
        </Link>
        {post.is_editorial && <span className="tag tag-solid !text-[10.5px]"><span>Rédaction</span></span>}
        {!post.is_editorial && post.author_role !== "member" && (
          <span className="t-kicker !text-[11px] text-[var(--color-muted)]">{ROLE_LABEL[post.author_role]}</span>
        )}
      </div>
      <p className="t-time mt-0.5">
        <time dateTime={post.created_at} title={absoluteDate(post.created_at)}>
          {compact ? relativeDate(post.created_at) : absoluteDate(post.created_at)}
        </time>
        {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 60_000 && <span> · modifié</span>}
      </p>
      {(post.source_name || post.source_url) && (
        <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
          Source :{" "}
          {post.source_url ? (
            <a href={post.source_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline underline-offset-2 hover:text-[var(--color-paper)]">
              {post.source_name || new URL(post.source_url).hostname}
            </a>
          ) : (
            post.source_name
          )}
        </p>
      )}
    </div>
  );
}

export function CategoryLine({ post }: { post: FeedPost }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tag"><span>{CATEGORY_LABEL[post.category]}</span></span>
      <InfoBadge status={post.info_status} />
      {post.is_sample && <span className="tag tag-warn"><span>Exemple</span></span>}
    </div>
  );
}

/** Demande de connexion avant une interaction, sans perdre la page en cours. */
function useRequireAuth() {
  const { user } = useSession();
  const router = useRouter();
  return () => {
    if (user) return true;
    router.push(`/connexion?suite=${encodeURIComponent(location.pathname + location.search)}`);
    return false;
  };
}

/** Rail d'actions : j'aime, commentaires, partage, enregistrer, signaler. */
export function ActionRail({ post, onComments, layout = "rail" }: { post: FeedPost; onComments: () => void; layout?: "rail" | "row" }) {
  const sb = supabaseBrowser();
  const requireAuth = useRequireAuth();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    setLiked(post.liked);
    setLikes(post.like_count);
    setSaved(post.saved);
  }, [post.id, post.liked, post.like_count, post.saved]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const like = async () => {
    if (!sb || !requireAuth()) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await setLike(sb, post.id, next);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      flash("Action impossible pour le moment.");
    }
  };
  const save = async () => {
    if (!sb || !requireAuth()) return;
    const next = !saved;
    setSaved(next);
    try {
      await setSave(sb, post.id, next);
      flash(next ? "Enregistré dans votre profil." : "Retiré des enregistrements.");
    } catch {
      setSaved(!next);
      flash("Action impossible pour le moment.");
    }
  };
  const share = async () => {
    const url = `${location.origin}/p/${post.id}`;
    if (navigator.share) {
      await navigator.share({ title: post.title, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).then(() => flash("Lien copié.")).catch(() => flash(url));
    }
  };

  const row = layout === "row";
  return (
    <>
      <div className={row ? "flex items-center gap-1" : "flex flex-col items-center gap-4"}>
        <RailButton label={`${liked ? "Ne plus aimer" : "J'aime"} (${likes})`} count={likes} pressed={liked} onClick={like} row={row}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={liked ? "#C92526" : "none"} stroke={liked ? "#C92526" : "currentColor"} className={liked ? "pop" : ""} />
        </RailButton>
        <RailButton label={`Commentaires (${post.comment_count})`} count={post.comment_count} onClick={onComments} row={row}>
          <path d="M4 5h16v11H9l-5 4z" />
        </RailButton>
        <RailButton label="Partager" onClick={share} row={row}>
          <path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5" />
        </RailButton>
        <RailButton label={saved ? "Retirer des enregistrements" : "Enregistrer"} pressed={saved} onClick={save} row={row}>
          <path d="M6 3h12v18l-6-4-6 4z" fill={saved ? "currentColor" : "none"} />
        </RailButton>
        <RailButton label="Plus d'options" onClick={() => setMenu(true)} row={row}>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </RailButton>
      </div>
      {menu && <PostMenu post={post} onClose={() => setMenu(false)} />}
      {toast && (
        <p role="status" className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-b)+16px)] z-[70] mx-auto w-fit rounded-md bg-[var(--color-paper)] px-4 py-2 text-sm font-semibold text-black">
          {toast}
        </p>
      )}
    </>
  );
}

function RailButton({ label, count, pressed, onClick, row, children }: { label: string; count?: number; pressed?: boolean; onClick: () => void; row?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={row ? "flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-[var(--color-panel)]" : "flex flex-col items-center gap-1 text-[12px] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"}
    >
      <span className={row ? "" : "flex h-11 w-11 items-center justify-center rounded-full bg-black/45"}>
        <svg width={row ? 22 : 26} height={row ? 22 : 26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {children}
        </svg>
      </span>
      {count !== undefined && <span aria-hidden>{count}</span>}
    </button>
  );
}

/** Feuille du bas accessible (dialogue natif). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby={id}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none bg-transparent p-0 backdrop:bg-black/70 sm:m-auto sm:max-w-lg"
    >
      <div className="sheet flex max-h-[85dvh] flex-col rounded-t-2xl border-t-2 border-[var(--color-red)] bg-[var(--color-coal)] text-[var(--color-paper)] sm:rounded-2xl sm:border-2">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h2 id={id} className="t-display text-xl">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} className="flex h-11 w-11 items-center justify-center" aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}

export function CommentsSheet({ post, onClose }: { post: FeedPost; onClose: () => void }) {
  const sb = supabaseBrowser();
  const { user } = useSession();
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);

  const load = () => {
    if (!sb) return;
    fetchComments(sb, post.id).then(setItems).catch(() => setError("Impossible de charger les commentaires."));
  };
  useEffect(load, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      await addComment(sb, post.id, body.trim());
      setBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet title={`Commentaires · ${post.comment_count}`} onClose={onClose}>
      {items === null && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded" />)}</div>}
      {items?.length === 0 && <p className="py-6 text-center text-[var(--color-muted)]">Aucun commentaire. Lancez la discussion.</p>}
      <ul className="space-y-4">
        {items?.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar path={c.author.avatar_path} name={c.author.display_name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <Link href={`/u/${c.author.handle}`} className="font-semibold hover:underline">{c.author.display_name}</Link>{" "}
                {c.author.is_verified && <VerifiedMark />} <time className="t-time" dateTime={c.created_at} title={absoluteDate(c.created_at)}>{relativeDate(c.created_at)}</time>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px]">{c.body}</p>
              {user && user.id !== c.author.id && (
                <button type="button" onClick={() => setReporting(c.id)} className="mt-1 text-xs text-[var(--color-muted)] underline">Signaler</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--color-red-hi)]">{error}</p>}
      {user ? (
        <form onSubmit={send} className="sticky bottom-0 mt-4 flex gap-2 bg-[var(--color-coal)] pt-2">
          <label htmlFor={`c-${post.id}`} className="sr-only">Votre commentaire</label>
          <input id={`c-${post.id}`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Votre commentaire" className="input" />
          <button type="submit" className="btn btn-red shrink-0" disabled={sending || !body.trim()}>{sending ? "…" : "Envoyer"}</button>
        </form>
      ) : (
        <Link href={`/connexion?suite=${encodeURIComponent(`/p/${post.id}`)}`} className="btn btn-line mt-4 w-full">Se connecter pour commenter</Link>
      )}
      {reporting && <ReportSheet targetType="comment" targetId={reporting} onClose={() => setReporting(null)} />}
    </Sheet>
  );
}

const REASONS = [
  ["spam", "Spam ou arnaque"],
  ["haine", "Haine ou discrimination"],
  ["harcelement", "Harcèlement"],
  ["violence", "Violence ou menace"],
  ["sexuel", "Contenu sexuel"],
  ["desinformation", "Fausse information"],
  ["droit_auteur", "Atteinte au droit d'auteur"],
  ["vie_privee", "Atteinte à la vie privée"],
  ["autre", "Autre"],
] as const;

/** Signalement (notification d'un contenu illicite ou contraire aux règles). */
export function ReportSheet({ targetType, targetId, onClose }: { targetType: "post" | "comment" | "profile"; targetId: string; onClose: () => void }) {
  const sb = supabaseBrowser();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb || !reason) return;
    setState("sending");
    try {
      await report(sb, targetType, targetId, reason, details.trim());
      setState("done");
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Envoi impossible.");
      setState("error");
    }
  };
  return (
    <Sheet title="Signaler" onClose={onClose}>
      {state === "done" ? (
        <p role="status" className="py-4">Signalement enregistré. L'équipe de modération l'examinera et vous pourrez suivre la décision.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Pourquoi ce contenu pose-t-il problème ?</legend>
            <div className="grid gap-2">
              {REASONS.map(([v, l]) => (
                <label key={v} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border-2 border-[var(--color-line)] px-3 has-[:checked]:border-[var(--color-red)]">
                  <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="accent-[var(--color-red)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold">
            Précisions (facultatif)
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="input mt-1" />
          </label>
          {state === "error" && <p role="alert" className="text-sm text-[var(--color-red-hi)]">{err}</p>}
          <button type="submit" className="btn btn-red w-full" disabled={!reason || state === "sending"}>{state === "sending" ? "Envoi…" : "Envoyer le signalement"}</button>
        </form>
      )}
    </Sheet>
  );
}

function PostMenu({ post, onClose }: { post: FeedPost; onClose: () => void }) {
  const { user } = useSession();
  const [reporting, setReporting] = useState(false);
  if (reporting) return <ReportSheet targetType="post" targetId={post.id} onClose={onClose} />;
  return (
    <Sheet title="Options" onClose={onClose}>
      <div className="grid gap-2">
        <Link href={`/p/${post.id}`} className="btn btn-line">Ouvrir la publication</Link>
        <Link href={`/u/${post.author_handle}`} className="btn btn-line">Voir le profil de {post.author_name}</Link>
        {user && user.id !== post.author_id && (
          <button type="button" className="btn btn-line" onClick={() => setReporting(true)}>Signaler la publication</button>
        )}
        {!user && <Link href="/connexion" className="btn btn-line">Se connecter pour signaler</Link>}
      </div>
    </Sheet>
  );
}
