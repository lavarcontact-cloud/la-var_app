"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { NewsRow, Section } from "@/components/news-list";
import { Avatar, VerifiedMark } from "@/components/post-ui";
import { useSession } from "@/components/session";
import { fetchFeed, setFollow } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FeedPost, Profile } from "@/lib/types";
import { PostThumb } from "../u/[handle]/profile-view";

/** Découvertes : talents émergents et nouveautés, pas seulement les têtes d'affiche. */
export default function DiscoverPage() {
  const sb = supabaseBrowser();
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [artists, setArtists] = useState<Profile[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sb) return;
    fetchFeed(sb, { category: "decouverte", limit: 24 }).then(setPosts).catch(() => setPosts([]));
    sb.from("profiles").select("*").eq("role", "artist").order("created_at", { ascending: false }).limit(20).then(({ data }) => setArtists((data as Profile[]) ?? []));
    if (user) sb.from("follows").select("followee_id").eq("follower_id", user.id).then(({ data }) => setFollowed(new Set((data ?? []).map((r) => r.followee_id))));
  }, [sb, user]);

  const toggle = async (id: string) => {
    if (!sb || !user) return (location.href = "/connexion?suite=/decouvertes");
    const on = !followed.has(id);
    setFollowed((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    try { await setFollow(sb, id, on); } catch { setFollowed((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; }); }
  };

  return (
    <div>
      <PageHeader title="Découvertes" />
      <div className="mx-auto max-w-5xl px-4 pb-10">
        {!sb && <p className="py-10 text-center text-[var(--color-muted)]">Base de données non configurée sur cette version d'aperçu.</p>}
        <Section title="Artistes à suivre" count={sb ? (artists ? artists.length : null) : 0} empty="Aucun compte artiste pour l'instant. Les artistes peuvent demander un badge depuis leur profil.">
          {artists && artists.length > 0 && (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {artists.map((a) => (
                <li key={a.id} className="w-36 shrink-0 rounded-md border-2 border-[var(--color-line)] p-3 text-center">
                  <Link href={`/u/${a.handle}`} className="flex flex-col items-center gap-2">
                    <Avatar path={a.avatar_path} name={a.display_name} size={64} />
                    <span className="flex items-center gap-1 font-semibold">{a.display_name}{a.is_verified && <VerifiedMark />}</span>
                  </Link>
                  {user?.id !== a.id && (
                    <button type="button" onClick={() => toggle(a.id)} aria-pressed={followed.has(a.id)} className={`btn mt-2 w-full !min-h-[38px] !text-sm ${followed.has(a.id) ? "btn-line" : "btn-red"}`}>
                      {followed.has(a.id) ? "Abonné" : "Suivre"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Nouveaux sons et talents" count={sb ? (posts ? posts.length : null) : 0} empty="Aucune découverte partagée. Vous connaissez un talent ? Publiez-le dans la rubrique Découvertes." action={<Link href="/publier" className="text-sm underline">Partager</Link>}>
          {posts && posts.length > 0 && (
            <>
              <NewsRow post={posts[0]} big />
              <ul className="mt-3 grid grid-cols-3 gap-1 sm:grid-cols-4">{posts.slice(1).map((p) => <li key={p.id}><PostThumb post={p} /></li>)}</ul>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
