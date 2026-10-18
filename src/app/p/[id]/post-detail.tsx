"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { ActionRail, CategoryLine, CommentsSheet, PostMeta } from "@/components/post-ui";
import { fetchPost } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/supabase/env";
import { SCOPES, type FeedPost } from "@/lib/types";

export function PostDetail({ id }: { id: string }) {
  const sb = supabaseBrowser();
  const params = useSearchParams();
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined);
  const [comments, setComments] = useState(false);

  useEffect(() => {
    if (!sb) return setPost(null);
    fetchPost(sb, id).then(setPost).catch(() => setPost(null));
  }, [sb, id]);

  if (post === undefined) return <div className="mx-auto max-w-2xl space-y-4 p-4"><div className="skeleton aspect-[9/12] rounded" /><div className="skeleton h-8 rounded" /></div>;
  if (post === null) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <p className="t-display text-4xl">Publication introuvable</p>
        <p className="mt-3 text-[var(--color-muted)]">Elle a peut-être été supprimée par son auteur ou retirée par la modération.</p>
        <Link href="/" className="btn btn-red mt-6">Retour au fil</Link>
      </div>
    );
  }
  const video = post.media.find((m) => m.type === "video");
  const images = post.media.filter((m) => m.type === "image");
  return (
    <div>
      <PageHeader title="Publication" />
      <article className="mx-auto max-w-2xl px-4 py-5">
        {params.get("publie") && <p role="status" className="mb-4 rounded-md border-2 border-[var(--color-red)] p-3 text-sm">Publication en ligne. Elle apparaît dans le fil.</p>}
        {post.status && post.status !== "published" && (
          <p role="status" className="mb-4 rounded-md border-2 border-[var(--color-warn)] p-3 text-sm text-[var(--color-warn)]">Cette publication n'est plus visible publiquement (décision de modération). Le motif figure dans votre profil.</p>
        )}
        <CategoryLine post={post} />
        <h1 className="t-display mt-3 text-[40px] lg:text-6xl">{post.title}</h1>
        <div className="mt-3"><PostMeta post={post} /></div>
        <p className="t-time mt-1">Scène : {SCOPES.find((s) => s.value === post.scope)?.label}</p>
        {post.correction_note && <p className="mt-3 border-l-[3px] border-[var(--color-red)] pl-3 text-sm">Correction de la rédaction : {post.correction_note}</p>}
        <div className="mt-5 space-y-3">
          {video && <video src={mediaUrl(video.path)!} poster={mediaUrl(video.poster) ?? undefined} controls playsInline preload="metadata" className="mx-auto max-h-[80svh] w-full rounded-md bg-black" aria-label={post.title} />}
          {images.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.path} src={mediaUrl(m.path)!} alt={i === 0 ? post.title : `${post.title}, image ${i + 1}`} className="w-full rounded-md" loading={i === 0 ? "eager" : "lazy"} />
          ))}
        </div>
        {post.body && <p className="mt-5 whitespace-pre-wrap text-[17px] leading-relaxed">{post.body}</p>}
        <div className="mt-6 border-y border-[var(--color-line)] py-2">
          <ActionRail post={post} onComments={() => setComments(true)} layout="row" />
        </div>
      </article>
      {comments && <CommentsSheet post={post} onClose={() => setComments(false)} />}
    </div>
  );
}
