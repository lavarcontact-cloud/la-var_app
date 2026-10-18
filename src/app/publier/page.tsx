"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/chrome";
import { useSession } from "@/components/session";
import { friendlyError } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATEGORIES, INFO_STATUS, SCOPES, type Category, type InfoStatus, type MediaItem, type PostKind, type Scope } from "@/lib/types";

const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VID_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMG = 10 * 1024 * 1024;
const MAX_VID = 50 * 1024 * 1024;
const MAX_VID_S = 180;

/** Affiche de la vidéo : une image capturée dans le navigateur (aucun service tiers). */
function videoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const url = URL.createObjectURL(file);
    const done = (b: Blob | null) => { URL.revokeObjectURL(url); resolve(b); };
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => {
      const w = Math.min(720, v.videoWidth || 720);
      const h = Math.round(((v.videoHeight || 1280) * w) / (v.videoWidth || 720));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(v, 0, 0, w, h);
      c.toBlob((b) => done(b), "image/jpeg", 0.82);
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

export default function PublishPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { ready, user, profile } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("actu");
  const [scope, setScope] = useState<Scope>("fr");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [status, setStatus] = useState<InfoStatus>("a_verifier");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"idle" | "upload" | "save">("idle");
  const [progress, setProgress] = useState(0);

  if (!ready) return <p className="p-8 text-center text-[var(--color-muted)]">Chargement…</p>;
  if (!sb) return <Centered title="Publication indisponible" text="La base de données n'est pas encore configurée sur cette version d'aperçu." />;
  if (!user) return <Centered title="Publier sur LA VAR" text="Connectez-vous pour partager une actu, une sortie ou une découverte." action={<Link href="/connexion?suite=/publier" className="btn btn-red">Se connecter</Link>} />;

  const staff = profile && ["editor", "admin"].includes(profile.role);
  const officialAllowed = staff || (profile?.role === "artist" && profile.is_verified);
  const statusOptions: InfoStatus[] = staff ? ["confirme", "officiel", "a_verifier", "rumeur"] : officialAllowed ? ["officiel", "a_verifier", "rumeur"] : ["a_verifier", "rumeur"];

  const pick = async (list: FileList | null) => {
    setError("");
    if (!list) return;
    const arr = Array.from(list);
    const videos = arr.filter((f) => VID_TYPES.includes(f.type));
    const images = arr.filter((f) => IMG_TYPES.includes(f.type));
    if (videos.length + images.length !== arr.length) return setError("Formats acceptés : JPEG, PNG, WebP, MP4, WebM, MOV.");
    if (videos.length > 1 || (videos.length && images.length)) return setError("Une seule vidéo par publication, sans photo.");
    if (images.length > 10) return setError("10 photos maximum.");
    if (images.some((f) => f.size > MAX_IMG)) return setError("Chaque photo doit faire moins de 10 Mo.");
    if (videos[0]) {
      if (videos[0].size > MAX_VID) return setError("La vidéo doit faire moins de 50 Mo.");
      const d = await videoDuration(videos[0]);
      if (d > MAX_VID_S) return setError("La vidéo doit durer 3 minutes maximum.");
    }
    setFiles(arr);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (title.trim().length < 3) return setError("Le titre doit faire au moins 3 caractères.");
    if (sourceUrl && !/^https:\/\/\S+\.\S+/.test(sourceUrl)) return setError("Le lien de la source doit commencer par https://");
    const uploaded: string[] = [];
    try {
      const media: MediaItem[] = [];
      if (files.length) {
        setStep("upload");
        for (const [i, f] of files.entries()) {
          const ext = f.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await sb.storage.from("media").upload(path, f, { contentType: f.type, cacheControl: "31536000" });
          if (upErr) throw new Error("Le dépôt du fichier a échoué.");
          uploaded.push(path);
          const item: MediaItem = { path, type: f.type.startsWith("video") ? "video" : "image" };
          if (item.type === "video") {
            const blob = await videoPoster(f);
            if (blob) {
              const pPath = `${user.id}/${crypto.randomUUID()}-poster.jpg`;
              const { error: pErr } = await sb.storage.from("media").upload(pPath, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
              if (!pErr) { uploaded.push(pPath); item.poster = pPath; }
            }
          }
          media.push(item);
          setProgress(Math.round(((i + 1) / files.length) * 100));
        }
      }
      setStep("save");
      const kind: PostKind = media.some((m) => m.type === "video") ? "video" : media.length > 1 ? "carousel" : media.length === 1 ? "photo" : sourceUrl ? "link" : "article";
      const { data, error: insErr } = await sb
        .from("posts")
        .insert({ kind, category, scope, title: title.trim(), body: body.trim() || null, media, source_name: sourceName.trim() || null, source_url: sourceUrl.trim() || null, info_status: status })
        .select("id")
        .single();
      if (insErr) throw new Error(friendlyError(insErr.message));
      router.push(`/p/${data.id}?publie=1`);
    } catch (err) {
      if (uploaded.length) await sb.storage.from("media").remove(uploaded); // pas de fichiers orphelins
      setError(err instanceof Error ? err.message : "Publication impossible.");
      setStep("idle");
      setProgress(0);
    }
  };

  return (
    <div>
      <PageHeader title="Publier" />
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 px-4 py-6" noValidate>
        <div>
          <label className="block text-sm font-semibold" htmlFor="files">Vidéo ou photos</label>
          <input id="files" type="file" accept={[...IMG_TYPES, ...VID_TYPES].join(",")} multiple onChange={(e) => pick(e.target.files)} className="input mt-1 file:mr-3 file:rounded file:border-0 file:bg-[var(--color-red)] file:px-3 file:py-1.5 file:font-semibold file:text-white" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">Une vidéo verticale (9:16 idéalement, 3 min et 50 Mo max.) ou jusqu'à 10 photos. Facultatif pour un article.</p>
          {files.length > 0 && <p className="mt-1 text-sm">{files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}.</p>}
        </div>
        <label className="block text-sm font-semibold">
          Titre
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="input mt-1" placeholder="Ce qu'il faut savoir, en une ligne" />
        </label>
        <label className="block text-sm font-semibold">
          Texte (facultatif)
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} className="input mt-1" />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Rubrique</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.value} className="chip cursor-pointer">
                <input type="radio" name="cat" className="sr-only" checked={category === c.value} onChange={() => setCategory(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Scène</legend>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <label key={s.value} className="chip cursor-pointer">
                <input type="radio" name="scope" className="sr-only" checked={scope === s.value} onChange={() => setScope(s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Source (facultatif)
            <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={80} className="input mt-1" placeholder="ex. compte officiel de l'artiste" />
          </label>
          <label className="block text-sm font-semibold">
            Lien de la source
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} inputMode="url" className="input mt-1" placeholder="https://" />
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Statut de l'information</legend>
          <div className="grid gap-2">
            {statusOptions.map((s) => (
              <label key={s} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border-2 border-[var(--color-line)] p-3 has-[:checked]:border-[var(--color-red)]">
                <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} className="mt-1 accent-[var(--color-red)]" />
                <span><b>{INFO_STATUS[s].label}</b><span className="block text-xs text-[var(--color-muted)]">{INFO_STATUS[s].hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-[var(--color-muted)]">
          En publiant, vous confirmez avoir le droit de partager ces images et ce son, et respecter les <Link href="/regles" className="underline">règles de la communauté</Link>. Les contenus signalés sont examinés par la modération.
        </p>
        {error && <p role="alert" className="text-sm text-[var(--color-red-hi)]">{error}</p>}
        <button type="submit" className="btn btn-red w-full" disabled={step !== "idle"}>
          {step === "upload" ? `Envoi des fichiers… ${progress} %` : step === "save" ? "Publication…" : "Publier"}
        </button>
      </form>
    </div>
  );
}

function Centered({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[80svh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="t-display text-4xl">{title}</p>
      <p className="mt-3 text-[var(--color-muted)]">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
