"use client";

import Link from "next/link";
import { mediaUrl } from "@/lib/supabase/env";
import { absoluteDate, relativeDate } from "@/lib/time";
import { CATEGORY_LABEL, type ExternalItem, type FeedPost } from "@/lib/types";
import { InfoBadge, VerifiedMark } from "./post-ui";

/** Ligne éditoriale : vignette, rubrique, statut, titre, auteur, heure, source. */
export function NewsRow({ post, big }: { post: FeedPost; big?: boolean }) {
  const m = post.media[0];
  const url = m ? mediaUrl(m.path) : null;
  return (
    <Link href={`/p/${post.id}`} className={`group grid gap-3 ${big ? "" : "grid-cols-[96px_1fr] sm:grid-cols-[132px_1fr]"} rounded-md p-2 hover:bg-[var(--color-coal)]`}>
      <div className={`relative overflow-hidden rounded bg-[var(--color-panel)] ${big ? "aspect-video" : "aspect-[4/5]"}`}>
        {url && m.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        )}
        {url && m.type === "video" && (m.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(m.poster)!} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : <video src={url} muted playsInline preload="metadata" aria-hidden className="h-full w-full object-cover" />)}
        {!url && <span className="absolute inset-0 m-2 -skew-x-[6deg] border-2 border-[var(--color-red)]" aria-hidden />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-kicker text-[var(--color-red-hi)]">{CATEGORY_LABEL[post.category]}</span>
          <InfoBadge status={post.info_status} />
          {post.is_sample && <span className="tag tag-warn"><span>Exemple</span></span>}
        </div>
        <h3 className={`t-display mt-1.5 ${big ? "text-4xl" : "text-[22px]"} group-hover:underline`}>{post.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-[var(--color-muted)]">
          <span className="font-semibold text-[var(--color-paper)]">{post.is_editorial ? "Rédaction LA VAR" : post.author_name}</span>
          {post.author_verified && <VerifiedMark />}
          <span>·</span>
          <time dateTime={post.created_at} title={absoluteDate(post.created_at)}>{relativeDate(post.created_at)}</time>
          {post.source_name && <><span>·</span><span>Source : {post.source_name}</span></>}
        </p>
      </div>
    </Link>
  );
}

/** Titre d'un autre média : lien sortant, jamais le contenu complet. */
export function ExternalRow({ item }: { item: ExternalItem }) {
  const when = item.published_at ?? item.fetched_at;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="group block rounded-md border-l-[3px] border-[var(--color-line)] px-3 py-2 hover:border-[var(--color-red)] hover:bg-[var(--color-coal)]">
      <p className="t-kicker !text-[11px] text-[var(--color-muted)]">{item.source?.name ?? "Source externe"} · {CATEGORY_LABEL[item.category]}</p>
      <p className="mt-0.5 font-semibold group-hover:underline">{item.title} <span aria-hidden>↗</span></p>
      <p className="t-time mt-0.5">
        <time dateTime={when} title={absoluteDate(when)}>{item.published_at ? absoluteDate(item.published_at) : `récupéré ${relativeDate(item.fetched_at)}`}</time>
      </p>
    </a>
  );
}

export function Section({ title, children, empty, action, count }: { title: string; children?: React.ReactNode; empty?: string; action?: React.ReactNode; count?: number | null }) {
  // count : nombre d'éléments (null = en cours de chargement, undefined = toujours afficher children).
  if (count === null) {
    return (
      <section className="mt-8" aria-label={title} aria-busy="true">
        <div className="mb-2 border-b-2 border-[var(--color-red)] pb-1"><h2 className="t-display text-2xl">{title}</h2></div>
        <div className="skeleton h-24 rounded" />
      </section>
    );
  }
  const isEmpty = count === 0 || (count === undefined && (!children || (Array.isArray(children) && children.length === 0)));
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-2 flex items-end justify-between gap-3 border-b-2 border-[var(--color-red)] pb-1">
        <h2 className="t-display text-2xl">{title}</h2>
        {action}
      </div>
      {isEmpty ? <p className="py-4 text-sm text-[var(--color-muted)]">{empty}</p> : children}
    </section>
  );
}
