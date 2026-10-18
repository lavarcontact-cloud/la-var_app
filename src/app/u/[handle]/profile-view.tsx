"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { Avatar, ReportSheet, VerifiedMark } from "@/components/post-ui";
import { useSession } from "@/components/session";
import { fetchFeed, friendlyError, setFollow } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/supabase/env";
import { absoluteDate } from "@/lib/time";
import { CATEGORY_LABEL, ROLE_LABEL, type FeedPost, type Profile } from "@/lib/types";

type Decision = { id: string; action: string; reason: string; target_type: string; created_at: string };

export function ProfileView({ handle }: { handle: string }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { user, refreshProfile, signOut } = useSession();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [tab, setTab] = useState<"posts" | "saved">("posts");
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [msg, setMsg] = useState("");
  const isMe = !!user && profile?.id === user.id;

  const load = useCallback(async () => {
    if (!sb) return setProfile(null);
    const { data } = await sb.from("profiles").select("*").eq("handle", handle).maybeSingle();
    setProfile((data as Profile) ?? null);
    if (!data) return;
    const [fers, fing, mine] = await Promise.all([
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", data.id),
      sb.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", data.id),
      user ? sb.from("follows").select("followee_id").eq("follower_id", user.id).eq("followee_id", data.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setCounts({ followers: fers.count ?? 0, following: fing.count ?? 0 });
    setFollowing(!!mine.data);
    if (user?.id === data.id) {
      const { data: d } = await sb.from("moderation_actions").select("id, action, reason, target_type, created_at").order("created_at", { ascending: false }).limit(20);
      setDecisions((d ?? []).filter((x) => x.action !== "qualify") as Decision[]);
    }
  }, [sb, handle, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sb || !profile) return;
    setPosts(null);
    fetchFeed(sb, tab === "saved" ? { saved: true, limit: 30 } : { author: profile.id, limit: 30 }).then(setPosts).catch(() => setPosts([]));
  }, [sb, profile, tab]);

  const toggleFollow = async () => {
    if (!sb || !profile) return;
    if (!user) return router.push(`/connexion?suite=/u/${handle}`);
    const next = !following;
    setFollowing(next);
    setCounts((c) => ({ ...c, followers: c.followers + (next ? 1 : -1) }));
    try {
      await setFollow(sb, profile.id, next);
    } catch {
      setFollowing(!next);
      setCounts((c) => ({ ...c, followers: c.followers + (next ? -1 : 1) }));
      setMsg("Action impossible pour le moment.");
    }
  };

  if (profile === undefined) return <div className="mx-auto max-w-3xl space-y-4 p-6"><div className="skeleton h-24 rounded" /><div className="skeleton h-64 rounded" /></div>;
  if (profile === null) return <div className="px-6 py-24 text-center"><p className="t-display text-4xl">Profil introuvable</p><Link href="/" className="btn btn-red mt-6">Retour au fil</Link></div>;

  return (
    <div>
      <PageHeader title={`@${profile.handle}`} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar path={profile.avatar_path} name={profile.display_name} size={88} />
          <div className="min-w-0 flex-1">
            <h2 className="t-display flex items-center gap-2 text-4xl">{profile.display_name} {profile.is_verified && <VerifiedMark />}</h2>
            <p className="text-[var(--color-muted)]">@{profile.handle} · {ROLE_LABEL[profile.role]}</p>
            {profile.bio && <p className="mt-2 whitespace-pre-wrap">{profile.bio}</p>}
            <p className="mt-2 text-sm"><b>{counts.followers}</b> abonnés · <b>{counts.following}</b> abonnements</p>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap gap-2">
          {isMe ? (
            <>
              <button type="button" className="btn btn-line" onClick={() => setEditing((e) => !e)}>{editing ? "Fermer" : "Modifier le profil"}</button>
              <Link href="/studio" className="btn btn-line">Studio</Link>
              {["moderator", "editor", "admin"].includes(profile.role) && <Link href="/moderation" className="btn btn-line">Modération</Link>}
              {["editor", "admin"].includes(profile.role) && <Link href="/admin" className="btn btn-line">Admin</Link>}
              <button type="button" className="btn btn-ghost" onClick={async () => { await signOut(); router.push("/"); }}>Se déconnecter</button>
            </>
          ) : (
            <>
              <button type="button" className={`btn ${following ? "btn-line" : "btn-red"}`} aria-pressed={following} onClick={toggleFollow}>{following ? "Abonné" : "Suivre"}</button>
              {user && <button type="button" className="btn btn-ghost" onClick={() => setReporting(true)}>Signaler</button>}
            </>
          )}
        </div>
        {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
        {editing && isMe && <EditProfile profile={profile} onSaved={async () => { setEditing(false); await refreshProfile(); await load(); }} />}

        {isMe && decisions.length > 0 && (
          <section className="mt-6 rounded-md border-2 border-[var(--color-warn)] p-4" aria-labelledby="h-dec">
            <h3 id="h-dec" className="t-kicker text-[var(--color-warn)]">Décisions de modération vous concernant</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {decisions.map((d) => (
                <li key={d.id}><span className="t-time">{absoluteDate(d.created_at)}</span> · {d.target_type === "profile" ? "Compte" : d.target_type === "post" ? "Publication" : "Commentaire"} : {labelAction(d.action)}. Motif : {d.reason}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--color-muted)]">Vous pouvez contester une décision en écrivant à l'adresse indiquée dans les <Link href="/regles" className="underline">règles</Link>.</p>
          </section>
        )}

        <div role="tablist" className="mt-8 flex gap-2 border-b border-[var(--color-line)]">
          <button role="tab" aria-selected={tab === "posts"} onClick={() => setTab("posts")} className={`t-kicker border-b-[3px] px-3 pb-2 ${tab === "posts" ? "border-[var(--color-red)]" : "border-transparent text-[var(--color-muted)]"}`}>Publications</button>
          {isMe && <button role="tab" aria-selected={tab === "saved"} onClick={() => setTab("saved")} className={`t-kicker border-b-[3px] px-3 pb-2 ${tab === "saved" ? "border-[var(--color-red)]" : "border-transparent text-[var(--color-muted)]"}`}>Enregistrés (privé)</button>}
        </div>
        {posts === null ? (
          <div className="mt-4 grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[9/16]" />)}</div>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-[var(--color-muted)]">{tab === "saved" ? "Rien d'enregistré pour l'instant." : "Aucune publication."}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-1">
            {posts.map((p) => <li key={p.id}><PostThumb post={p} /></li>)}
          </ul>
        )}
      </div>
      {reporting && <ReportSheet targetType="profile" targetId={profile.id} onClose={() => setReporting(false)} />}
    </div>
  );
}

const labelAction = (a: string) => ({ hide: "masqué", remove: "retiré", restore: "rétabli", ban: "suspendu", unban: "suspension levée" })[a] ?? a;

export function PostThumb({ post }: { post: FeedPost }) {
  const m = post.media[0];
  const url = m ? mediaUrl(m.path) : null;
  return (
    <Link href={`/p/${post.id}`} className="group relative block aspect-[9/16] overflow-hidden bg-[var(--color-panel)]">
      {url && m.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      )}
      {url && m.type === "video" && (m.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(m.poster)!} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : <video src={url} muted playsInline preload="metadata" aria-hidden className="h-full w-full object-cover" />)}
      {!url && <span className="t-display flex h-full items-center p-3 text-lg">{post.title}</span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-xs font-semibold">
        <span className="t-kicker !text-[10px] text-[var(--color-red-hi)]">{CATEGORY_LABEL[post.category]}</span>
        <span className="line-clamp-2 block">{post.title}</span>
      </span>
    </Link>
  );
}

function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const sb = supabaseBrowser()!;
  const [name, setName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let avatar_path = profile.avatar_path;
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Photo : JPEG, PNG ou WebP, 5 Mo maximum.");
        const path = `${profile.id}/avatar-${crypto.randomUUID()}.${file.type.split("/")[1]}`;
        const { error: up } = await sb.storage.from("media").upload(path, file, { contentType: file.type });
        if (up) throw new Error("Le dépôt de la photo a échoué.");
        avatar_path = path;
      }
      const { error: err } = await sb.from("profiles").update({ display_name: name.trim(), bio: bio.trim() || null, avatar_path }).eq("id", profile.id);
      if (err) throw new Error(friendlyError(err.message));
      onSaved();
    } catch (er) {
      setError(er instanceof Error ? er.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-md border-2 border-[var(--color-line)] p-4">
      <label className="block text-sm font-semibold">Nom affiché<input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className="input mt-1" /></label>
      <label className="block text-sm font-semibold">Bio<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} className="input mt-1" /></label>
      <label className="block text-sm font-semibold">Photo de profil<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="input mt-1" /></label>
      {error && <p role="alert" className="text-sm text-[var(--color-red-hi)]">{error}</p>}
      <button type="submit" className="btn btn-red" disabled={busy}>{busy ? "…" : "Enregistrer"}</button>
    </form>
  );
}
