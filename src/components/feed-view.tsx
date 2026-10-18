"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeed, type FeedQuery } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/supabase/env";
import { CATEGORIES, type Category, type FeedPost } from "@/lib/types";
import { ActionRail, CategoryLine, CommentsSheet, PostMeta } from "./post-ui";
import { useSession } from "./session";

/**
 * Fil vertical. Défilement natif + scroll-snap ; seule la publication visible
 * à 60 % lit sa vidéo ; la suivante précharge ses métadonnées ; les autres ne
 * chargent rien. Clavier : flèches haut/bas, J/K, espace.
 */
export function FeedView() {
  const sb = supabaseBrowser();
  const { user } = useSession();
  const [mode, setMode] = useState<"pour-toi" | "abonnements">("pour-toi");
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState(0);
  const [comments, setComments] = useState<FeedPost | null>(null);
  const [reduced, setReduced] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const query = useCallback(
    (before?: string): FeedQuery => ({ category, following: mode === "abonnements", before: before ?? null, limit: 8 }),
    [category, mode],
  );

  useEffect(() => setReduced(matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  useEffect(() => {
    if (!sb) return;
    setItems(null);
    setError("");
    setDone(false);
    setActive(0);
    scroller.current?.scrollTo({ top: 0 });
    fetchFeed(sb, query())
      .then((r) => {
        setItems(r);
        setDone(r.length < 8);
      })
      .catch(() => setError("Le fil n'a pas pu être chargé. Vérifiez votre connexion."));
  }, [sb, query]);

  const loadMore = useCallback(async () => {
    if (!sb || !items?.length || done || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchFeed(sb, query(items[items.length - 1].created_at));
      setItems((cur) => [...(cur ?? []), ...more.filter((m) => !cur?.some((c) => c.id === m.id))]);
      setDone(more.length < 8);
    } catch {
      /* on réessaiera au prochain défilement */
    } finally {
      setLoadingMore(false);
    }
  }, [sb, items, done, loadingMore, query]);

  useEffect(() => {
    const root = scroller.current;
    if (!root || !items?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    if (items && active >= items.length - 3) loadMore();
  }, [active, items, loadMore]);

  const go = useCallback((d: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-index="${active + d}"]`);
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, dialog")) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(1); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(-1); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="relative">
      {/* Filtres posés sur le fil */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-black/85 to-transparent pb-6 pt-[calc(var(--safe-t)+10px)] lg:left-60">
        <div className="pointer-events-auto flex items-center justify-between px-4">
          <Link href="/une" aria-label="LA VAR" className="w-[72px] lg:hidden">
            <Image src="/brand/la-var-logo-640.png" alt="LA VAR" width={640} height={328} priority className="h-auto w-full" />
          </Link>
          <div role="tablist" aria-label="Type de fil" className="flex gap-4 font-[family-name:var(--font-display)] text-lg font-extrabold uppercase italic">
            {(["pour-toi", "abonnements"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`border-b-[3px] pb-0.5 ${mode === m ? "border-[var(--color-red)] text-[var(--color-paper)]" : "border-transparent text-[var(--color-muted)]"}`}
              >
                {m === "pour-toi" ? "Pour toi" : "Abonnements"}
              </button>
            ))}
          </div>
          <span className="w-[72px] lg:hidden" aria-hidden />
        </div>
        <div role="group" aria-label="Filtrer par rubrique" className="pointer-events-auto mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <button type="button" className="chip shrink-0 bg-black/40" aria-pressed={category === null} onClick={() => setCategory(null)}>Tout</button>
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" className="chip shrink-0 bg-black/40" aria-pressed={category === c.value} onClick={() => setCategory(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="feed" role="feed" aria-busy={items === null} aria-label="Fil LA VAR">
        {!sb && <EmptyState title="Base de données non configurée" text="Cette version d'aperçu ne peut pas encore charger ni publier de contenus." />}
        {sb && items === null && !error && <SlideSkeleton />}
        {error && <EmptyState title="Fil indisponible" text={error} action={<button className="btn btn-line" onClick={() => location.reload()}>Réessayer</button>} />}
        {items?.length === 0 && (
          <EmptyState
            title={mode === "abonnements" ? (user ? "Rien de neuf chez vos abonnements" : "Connectez-vous pour suivre des comptes") : "Aucune publication pour l'instant"}
            text={mode === "abonnements" ? "Suivez des artistes et des médias pour composer ce fil." : "Soyez le premier à partager une actu, une sortie ou une découverte."}
            action={<Link href={mode === "abonnements" && !user ? "/connexion" : "/publier"} className="btn btn-red">{mode === "abonnements" && !user ? "Se connecter" : "Publier"}</Link>}
          />
        )}
        {items?.map((p, i) => (
          <Slide key={p.id} post={p} index={i} total={items.length} active={i === active} near={Math.abs(i - active) <= 1} reduced={reduced} onComments={() => setComments(p)} />
        ))}
        {items && items.length > 0 && done && (
          <section role="article" className="slide flex items-center justify-center px-6 text-center" aria-label="Fin du fil">
            <div>
              <p className="t-display text-4xl">Vous êtes à jour.</p>
              <p className="mt-2 text-[var(--color-muted)]">Revenez plus tard, ou partagez ce que vous savez.</p>
              <div className="mt-6 flex justify-center gap-2">
                <Link href="/une" className="btn btn-line">À la une</Link>
                <Link href="/publier" className="btn btn-red">Publier</Link>
              </div>
            </div>
          </section>
        )}
      </div>
      {comments && <CommentsSheet post={comments} onClose={() => setComments(null)} />}
    </div>
  );
}

function Slide({ post, index, total, active, near, reduced, onComments }: { post: FeedPost; index: number; total: number; active: boolean; near: boolean; reduced: boolean; onComments: () => void }) {
  const video = post.media.find((m) => m.type === "video");
  const images = post.media.filter((m) => m.type === "image");
  return (
    <article className="slide" data-index={index} aria-posinset={index + 1} aria-setsize={total} aria-labelledby={`t-${post.id}`}>
      <div className="absolute inset-0">
        {video ? (
          <SlideVideo src={mediaUrl(video.path)!} poster={mediaUrl(video.poster) ?? undefined} active={active} near={near} reduced={reduced} label={post.title} />
        ) : images.length ? (
          <Carousel images={images.map((m) => mediaUrl(m.path)!)} title={post.title} eager={index < 2} />
        ) : (
          <TextCard post={post} />
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/50" />

      <div className="absolute bottom-[calc(var(--nav-h)+var(--safe-b)+14px)] left-4 right-20 lg:bottom-8 lg:left-8 lg:max-w-xl">
        <CategoryLine post={post} />
        <h2 id={`t-${post.id}`} className="t-display mt-2 text-[32px] lg:text-5xl">
          <Link href={`/p/${post.id}`}>{post.title}</Link>
        </h2>
        {post.body && (video || images.length > 0) && <p className="mt-2 line-clamp-2 text-[15px] text-[#d9d7d1]">{post.body}</p>}
        {post.correction_note && <p className="mt-2 border-l-2 border-[var(--color-red)] pl-2 text-sm">Correction : {post.correction_note}</p>}
        <div className="mt-3"><PostMeta post={post} compact /></div>
      </div>
      <div className="absolute bottom-[calc(var(--nav-h)+var(--safe-b)+14px)] right-2 lg:bottom-8 lg:right-8">
        <ActionRail post={post} onComments={onComments} />
      </div>
    </article>
  );
}

function SlideVideo({ src, poster, active, near, reduced, label }: { src: string; poster?: string; active: boolean; near: boolean; reduced: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(reduced);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active && !paused) v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    else v.pause();
  }, [active, paused]);
  return (
    <>
      <video
        ref={ref}
        src={near ? src : undefined}
        poster={poster}
        muted
        loop
        playsInline
        preload={active ? "auto" : near ? "metadata" : "none"}
        onClick={() => setPaused((p) => !p)}
        aria-label={label}
        className="h-full w-full object-cover lg:object-contain"
      />
      {active && (paused || blocked) && (
        <button type="button" onClick={() => setPaused(false)} className="scrim absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full" aria-label="Lire la vidéo">
          <svg width="28" height="28" viewBox="0 0 12 12" aria-hidden><path d="M3.5 1.8v8.4l7-4.2z" fill="white" /></svg>
        </button>
      )}
    </>
  );
}

function Carousel({ images, title, eager }: { images: string[]; title: string; eager: boolean }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="relative h-full w-full">
      <div
        ref={ref}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        aria-label={images.length > 1 ? `Carrousel de ${images.length} images` : undefined}
      >
        {images.map((src, k) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={k === 0 ? title : `${title}, image ${k + 1}`} loading={eager && k === 0 ? "eager" : "lazy"} className="h-full w-full object-cover lg:object-contain" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 top-[calc(var(--safe-t)+108px)] flex justify-center gap-1.5" aria-hidden>
          {images.map((_, k) => <span key={k} className={`h-1 w-6 rounded-full ${k === i ? "bg-[var(--color-red)]" : "bg-white/40"}`} />)}
        </div>
      )}
    </div>
  );
}

/** Publication sans média : la typographie du logo porte l'info. */
function TextCard({ post }: { post: FeedPost }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-coal)] px-6">
      <div className="max-w-xl -skew-x-[6deg] border-[3px] border-[var(--color-red)] bg-black px-6 py-8">
        <div className="skew-x-[6deg]">
          <p className="t-display text-[clamp(34px,8vw,64px)] text-[var(--color-paper)]">{post.title}</p>
          {post.body && <p className="mt-4 line-clamp-6 text-[16px] not-italic text-[#d9d7d1]">{post.body}</p>}
        </div>
      </div>
    </div>
  );
}

function SlideSkeleton() {
  return (
    <div role="article" className="slide" aria-label="Chargement">
      <div className="skeleton absolute inset-0" />
      <div className="absolute bottom-[calc(var(--nav-h)+40px)] left-4 right-20 space-y-3">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton h-10 w-full rounded" />
        <div className="skeleton h-4 w-52 rounded" />
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <section role="article" className="slide flex items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <p className="t-display text-4xl">{title}</p>
        <p className="mt-3 text-[var(--color-muted)]">{text}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </section>
  );
}
